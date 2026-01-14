/**
 * Message sending service module
 * Handles message sending via Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

import { setupApiKey, isCustomBaseUrl, loadClaudeSettings } from '../../config/api-config.js';
import { selectWorkingDirectory } from '../../utils/path-utils.js';
import { mapModelIdToSdkName } from '../../utils/model-utils.js';
import { AsyncStream } from '../../utils/async-stream.js';
import { canUseTool } from '../../permission-handler.js';
import { persistJsonlMessage, loadSessionHistory } from './session-service.js';
import { loadAttachments, buildContentBlocks } from './attachment-service.js';
import { buildIDEContextPrompt } from '../system-prompts.js';

// Store active query results for rewind operations
// Key: sessionId, Value: query result object
const activeQueryResults = new Map();

const ACCEPT_EDITS_AUTO_APPROVE_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'CreateDirectory',
  'MoveFile',
  'CopyFile',
  'Rename'
]);

function shouldAutoApproveTool(permissionMode, toolName) {
  if (!toolName) return false;
  if (permissionMode === 'bypassPermissions') return true;
  if (permissionMode === 'acceptEdits') return ACCEPT_EDITS_AUTO_APPROVE_TOOLS.has(toolName);
  return false;
}

function createPreToolUseHook(permissionMode) {
  const normalizedPermissionMode = (!permissionMode || permissionMode === '') ? 'default' : permissionMode;

  return async (input) => {
    console.log('[PERM_DEBUG] PreToolUse hook called:', input?.tool_name);

    if (normalizedPermissionMode === 'plan') {
      return {
        decision: 'block',
        reason: 'Permission mode is plan (no execution)'
      };
    }

    if (shouldAutoApproveTool(normalizedPermissionMode, input?.tool_name)) {
      console.log('[PERM_DEBUG] Auto-approve tool:', input?.tool_name, 'mode:', normalizedPermissionMode);
      return { decision: 'approve' };
    }

    console.log('[PERM_DEBUG] Calling canUseTool...');
    try {
      const result = await canUseTool(input?.tool_name, input?.tool_input);
      console.log('[PERM_DEBUG] canUseTool returned:', result?.behavior);

      if (result?.behavior === 'allow') {
        return { decision: 'approve' };
      }
      if (result?.behavior === 'deny') {
        return {
          decision: 'block',
          reason: result?.message || 'Permission denied'
        };
      }
      return {};
    } catch (error) {
      console.error('[PERM_DEBUG] canUseTool error:', error?.message);
      return {
        decision: 'block',
        reason: 'Permission check failed: ' + (error?.message || String(error))
      };
    }
  };
}

/**
 * Send message (with session resume support)
 * @param {string} message - Message to send
 * @param {string} resumeSessionId - Session ID to resume
 * @param {string} cwd - Working directory
 * @param {string} permissionMode - Permission mode (optional)
 * @param {string} model - Model name (optional)
 */
	function buildConfigErrorPayload(error) {
			  try {
			    const rawError = error?.message || String(error);
			    const errorName = error?.name || 'Error';
			    const errorStack = error?.stack || null;

			    // Previously handled AbortError / timeout messages here
			    // Now unified in error handling, but still recording timeout/abort errors in details for debugging
			    const isAbortError =
			      errorName === 'AbortError' ||
			      rawError.includes('Claude Code process aborted by user') ||
			      rawError.includes('The operation was aborted');

		    const settings = loadClaudeSettings();
	    const env = settings?.env || {};

    const settingsApiKey =
      env.ANTHROPIC_AUTH_TOKEN !== undefined && env.ANTHROPIC_AUTH_TOKEN !== null
        ? env.ANTHROPIC_AUTH_TOKEN
        : env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY !== null
          ? env.ANTHROPIC_API_KEY
          : null;

    const settingsBaseUrl =
      env.ANTHROPIC_BASE_URL !== undefined && env.ANTHROPIC_BASE_URL !== null
        ? env.ANTHROPIC_BASE_URL
        : null;

    // Note: Config is only read from settings.json, no longer checks shell env vars
    let keySource = 'Not configured';
    let rawKey = null;

    if (settingsApiKey !== null) {
      rawKey = String(settingsApiKey);
      if (env.ANTHROPIC_AUTH_TOKEN !== undefined && env.ANTHROPIC_AUTH_TOKEN !== null) {
        keySource = '~/.claude/settings.json: ANTHROPIC_AUTH_TOKEN';
      } else if (env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY !== null) {
        keySource = '~/.claude/settings.json: ANTHROPIC_API_KEY';
      } else {
        keySource = '~/.claude/settings.json';
      }
    }

    const keyPreview = rawKey && rawKey.length > 0
      ? `${rawKey.substring(0, 10)}...（length ${rawKey.length} chars）`
      : 'Not configured（empty or missing）';

		    let baseUrl = settingsBaseUrl || 'https://api.anthropic.com';
		    let baseUrlSource;
		    if (settingsBaseUrl) {
		      baseUrlSource = '~/.claude/settings.json: ANTHROPIC_BASE_URL';
		    } else {
		      baseUrlSource = 'Default (https://api.anthropic.com)';
		    }

		    const heading = isAbortError
		      ? 'Claude Code was interrupted (timeout or user cancellation):'
		      : 'Claude Code error:';

		    const userMessage = [
	      heading,
	      `- Error: ${rawError}`,
	      `- API Key source: ${keySource}`,
	      `- API Key preview: ${keyPreview}`,
	      `- Base URL: ${baseUrl}（source: ${baseUrlSource}）`,
	      `- Tip: This plugin only reads from settings.json. You can configure inPlugin右上角Set - 供应商管理Config下即可Use`,
	      ''
	    ].join('\n');

	    return {
	      success: false,
	      error: userMessage,
	      details: {
	        rawError,
	        errorName,
	        errorStack,
	        isAbortError,
	        keySource,
	        keyPreview,
	        baseUrl,
	        baseUrlSource
	      }
	    };
  } catch (innerError) {
    const rawError = error?.message || String(error);
    return {
      success: false,
      error: rawError,
      details: {
        rawError,
        buildErrorFailed: String(innerError)
      }
    };
  }
}

/**
 * Send message (with session resume and streaming support)
 * @param {string} message - Message to send
 * @param {string} resumeSessionId - Session ID to resume
 * @param {string} cwd - Working directory
 * @param {string} permissionMode - Permission mode (optional)
 * @param {string} model - Model name (optional)
 * @param {object} openedFiles - Opened files list (optional)
 * @param {string} agentPrompt - Agent prompt (optional)
 * @param {boolean} streaming - Enable streaming (optional, defaults to config)
 */
export async function sendMessage(message, resumeSessionId = null, cwd = null, permissionMode = null, model = null, openedFiles = null, agentPrompt = null, streaming = null) {
	  let timeoutId;
	  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';
    console.log('[DEBUG] CLAUDE_CODE_ENTRYPOINT:', process.env.CLAUDE_CODE_ENTRYPOINT);

    // Setup API Key and get config info (including auth type)
    const { baseUrl, authType, apiKeySource, baseUrlSource } = setupApiKey();

    // Check if using custom Base URL
    if (isCustomBaseUrl(baseUrl)) {
      console.log('[DEBUG] Custom Base URL detected:', baseUrl);
      console.log('[DEBUG] Will use system Claude CLI (not Anthropic SDK fallback)');
    }

    console.log('[DEBUG] sendMessage called with params:', {
      resumeSessionId,
      cwd,
      permissionMode,
      model,
      IDEA_PROJECT_PATH: process.env.IDEA_PROJECT_PATH,
      PROJECT_PATH: process.env.PROJECT_PATH
    });

    console.log('[DEBUG] API Key source:', apiKeySource);
    console.log('[DEBUG] Base URL:', baseUrl || 'https://api.anthropic.com');
    console.log('[DEBUG] Base URL source:', baseUrlSource);

    console.log('[MESSAGE_START]');
    console.log('[DEBUG] Calling query() with prompt:', message);

    // Smart working directory detection
    const workingDirectory = selectWorkingDirectory(cwd);

    console.log('[DEBUG] process.cwd() before chdir:', process.cwd());
    try {
      process.chdir(workingDirectory);
      console.log('[DEBUG] Using working directory:', workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }
    console.log('[DEBUG] process.cwd() after chdir:', process.cwd());

    // Map model ID to SDK expected name
    const sdkModelName = mapModelIdToSdkName(model);
    console.log('[DEBUG] Model mapping:', model, '->', sdkModelName);

	    // Build systemPrompt.append content (for adding opened files context and agent prompt)
	    // Build IDE context prompt using unified prompt management module
	    console.log('[Agent] message-service.sendMessage received agentPrompt:', agentPrompt ? `✓ (${agentPrompt.length} chars)` : '✗ null');
	    const systemPromptAppend = buildIDEContextPrompt(openedFiles, agentPrompt);
	    console.log('[Agent] systemPromptAppend built:', systemPromptAppend ? `✓ (${systemPromptAppend.length} chars)` : '✗ empty');

	    // Prepare options
	    // Note: Dont pass pathToClaudeCodeExecutable, let SDK use built-in cli.js
	    // This avoids Windows CLI path issues (ENOENT errors)
	    const effectivePermissionMode = (!permissionMode || permissionMode === '') ? 'default' : permissionMode;
	    const shouldUseCanUseTool = effectivePermissionMode === 'default';
	    console.log('[PERM_DEBUG] permissionMode:', permissionMode);
	    console.log('[PERM_DEBUG] effectivePermissionMode:', effectivePermissionMode);
	    console.log('[PERM_DEBUG] shouldUseCanUseTool:', shouldUseCanUseTool);
	    console.log('[PERM_DEBUG] canUseTool function defined:', typeof canUseTool);

    // 🔧 Read Extended Thinking config from settings.json
    const settings = loadClaudeSettings();
    const alwaysThinkingEnabled = settings?.alwaysThinkingEnabled ?? true;
    const configuredMaxThinkingTokens = settings?.maxThinkingTokens
      || parseInt(process.env.MAX_THINKING_TOKENS || '0', 10)
      || 10000;

    // 🔧 Read streaming config from settings.json
    // streaming param takes priority, else from config, default off
    // Note: != null handles both null and undefined
    const streamingEnabled = streaming != null ? streaming : (settings?.streamingEnabled ?? false);
    console.log('[STREAMING_DEBUG] streaming param:', streaming);
    console.log('[STREAMING_DEBUG] settings.streamingEnabled:', settings?.streamingEnabled);
    console.log('[STREAMING_DEBUG] streamingEnabled (final):', streamingEnabled);

	    // Enable Extended Thinking based on config
	    // - If alwaysThinkingEnabled is true, use configured maxThinkingTokens
	    // - If false, dont set maxThinkingTokens (let SDK use default)
	    const maxThinkingTokens = alwaysThinkingEnabled ? configuredMaxThinkingTokens : undefined;

	    console.log('[THINKING_DEBUG] alwaysThinkingEnabled:', alwaysThinkingEnabled);
	    console.log('[THINKING_DEBUG] maxThinkingTokens:', maxThinkingTokens);

	    const options = {
	      cwd: workingDirectory,
	      permissionMode: effectivePermissionMode,
	      model: sdkModelName,
	      maxTurns: 100,
	      // Enable file checkpointing for rewind feature
	      enableFileCheckpointing: true,
	      // Extended Thinking config (based on settings.json alwaysThinkingEnabled)
	      // Thinking content output via [THINKING] tag for frontend
	      ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
	      // 🔧 Streaming config: enable includePartialMessages for incremental content
	      // When streamingEnabled is true, SDK returns partial messages with incremental content
	      ...(streamingEnabled && { includePartialMessages: true }),
	      additionalDirectories: Array.from(
	        new Set(
	          [workingDirectory, process.env.IDEA_PROJECT_PATH, process.env.PROJECT_PATH].filter(Boolean)
	        )
	      ),
	      canUseTool: shouldUseCanUseTool ? canUseTool : undefined,
	      hooks: {
	        PreToolUse: [{
	          hooks: [createPreToolUseHook(effectivePermissionMode)]
	        }]
	      },
	      // Dont pass pathToClaudeCodeExecutable, SDK uses built-in cli.js
	      settingSources: ['user', 'project', 'local'],
	      // Use Claude Code preset system prompt so Claude knows current working directory
	      // Key fix for path issues: without systemPrompt Claude doesnt know cwd
	      // If openedFiles exists, add context via append field
	      systemPrompt: {
	        type: 'preset',
	        preset: 'claude_code',
	        ...(systemPromptAppend && { append: systemPromptAppend })
	      }
	    };
	    console.log('[PERM_DEBUG] options.canUseTool:', options.canUseTool ? 'SET' : 'NOT SET');
	    console.log('[PERM_DEBUG] options.hooks:', options.hooks ? 'SET (PreToolUse)' : 'NOT SET');
	    console.log('[STREAMING_DEBUG] options.includePartialMessages:', options.includePartialMessages ? 'SET' : 'NOT SET');

		// Use AbortController for 60s timeout (disabled due to issues, keeping normal query logic)
		// const abortController = new AbortController();
		// options.abortController = abortController;

    console.log('[DEBUG] Using SDK built-in Claude CLI (cli.js)');

    console.log('[DEBUG] Options:', JSON.stringify(options, null, 2));

    // If有 sessionId 且不为Emptychars串，Use resume Resume session
    if (resumeSessionId && resumeSessionId !== '') {
      options.resume = resumeSessionId;
      console.log('[RESUMING]', resumeSessionId);
    }

	    console.log('[DEBUG] Query started, waiting for messages...');

	    // Call query Function
	    const result = query({
	      prompt: message,
	      options
	    });

		// Set 60 秒Timeout，Timeout后Via AbortController Cancel查询（已发现严重Issue，暂时Comment掉AutoTimeout逻辑）
		// timeoutId = setTimeout(() => {
		//   console.log('[DEBUG] Query timeout after 60 seconds, aborting...');
		//   abortController.abort();
		// }, 60000);

	    console.log('[DEBUG] Starting message loop...');

    let currentSessionId = resumeSessionId;

    // 流式Output
    let messageCount = 0;
    // 🔧 StreamingStatus追踪
    let streamStarted = false;
    let streamEnded = false;
    // 🔧 MarkYesNo收到了 stream_event（用于Avoid fallback diff 重复Output）
    let hasStreamEvents = false;
    // 🔧 diff fallback: 追踪上次的 assistant Content，用于计算Incremental
    let lastAssistantContent = '';
    let lastThinkingContent = '';

    try {
    for await (const msg of result) {
      messageCount++;
      console.log(`[DEBUG] Received message #${messageCount}, type: ${msg.type}`);

      // 🔧 Streaming：Output流式StartMark（仅首次）
      if (streamingEnabled && !streamStarted) {
        console.log('[STREAM_START]');
        streamStarted = true;
      }

      // 🔧 Streaming：Handle SDKPartialAssistantMessage（type: 'stream_event'）
      // SDK Via includePartialMessages Return的流式Event
      // 放宽识别条件：只要Yes stream_event 类型就TryHandle
      if (streamingEnabled && msg.type === 'stream_event') {
        hasStreamEvents = true;
        const event = msg.event;

        if (event) {
          // content_block_delta: 文本或 JSON Incremental
          if (event.type === 'content_block_delta' && event.delta) {
            if (event.delta.type === 'text_delta' && event.delta.text) {
              // 🔧 Use JSON Encode，保留换行符等特殊chars
              console.log('[CONTENT_DELTA]', JSON.stringify(event.delta.text));
              // Sync累积，Avoid后续 fallback diff 重复Output
              lastAssistantContent += event.delta.text;
            } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
              // 🔧 Use JSON Encode，保留换行符等特殊chars
              console.log('[THINKING_DELTA]', JSON.stringify(event.delta.thinking));
              lastThinkingContent += event.delta.thinking;
            }
            // input_json_delta 用于ToolCall，暂不Handle
          }

          // content_block_start: 新Content块Start（可用于识别 thinking 块）
          if (event.type === 'content_block_start' && event.content_block) {
            if (event.content_block.type === 'thinking') {
              console.log('[THINKING_START]');
            }
          }
        }

        // 🔧 关键修复：stream_event 不Output [MESSAGE]，Avoid污染 Java 侧Parse链路
        // console.log('[STREAM_DEBUG]', JSON.stringify(msg));
        continue; // 流式Event已Handle，Skip后续逻辑
      }

      // Output原始Message（方便 Java Parse）
      // 🔧 Streaming mode下，assistant MessageNeed特殊Handle
      // - If包含 tool_use，NeedOutput让前端ShowTool块
      // - 纯文本 assistant Message不Output，AvoidOverride流式Status
      let shouldOutputMessage = true;
      if (streamingEnabled && msg.type === 'assistant') {
        const msgContent = msg.message?.content;
        const hasToolUse = Array.isArray(msgContent) && msgContent.some(block => block.type === 'tool_use');
        if (!hasToolUse) {
          shouldOutputMessage = false;
        }
      }
      if (shouldOutputMessage) {
        console.log('[MESSAGE]', JSON.stringify(msg));
      }

      // 实时Output助手Content（非流式或完整Message）
      if (msg.type === 'assistant') {
        const content = msg.message?.content;

        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              const currentText = block.text || '';
              // 🔧 流式 fallback: IfEnable流式但 SDK 没给 stream_event，则用 diff 计算 delta
              if (streamingEnabled && !hasStreamEvents && currentText.length > lastAssistantContent.length) {
                const delta = currentText.substring(lastAssistantContent.length);
                if (delta) {
                  console.log('[CONTENT_DELTA]', delta);
                }
                lastAssistantContent = currentText;
              } else if (streamingEnabled && hasStreamEvents) {
                // 已Via stream_event Output过Incremental，Avoid重复；仅做Status对齐
                if (currentText.length > lastAssistantContent.length) {
                  lastAssistantContent = currentText;
                }
              } else if (!streamingEnabled) {
                // 非Streaming mode：Output完整Content
                console.log('[CONTENT]', currentText);
              }
            } else if (block.type === 'thinking') {
              // Output思考过程
              const thinkingText = block.thinking || block.text || '';
              // 🔧 流式 fallback: thinking 也用 diff
              if (streamingEnabled && !hasStreamEvents && thinkingText.length > lastThinkingContent.length) {
                const delta = thinkingText.substring(lastThinkingContent.length);
                if (delta) {
                  console.log('[THINKING_DELTA]', delta);
                }
                lastThinkingContent = thinkingText;
              } else if (streamingEnabled && hasStreamEvents) {
                if (thinkingText.length > lastThinkingContent.length) {
                  lastThinkingContent = thinkingText;
                }
              } else if (!streamingEnabled) {
                console.log('[THINKING]', thinkingText);
              }
            } else if (block.type === 'tool_use') {
              console.log('[DEBUG] Tool use payload:', JSON.stringify(block));
            }
          }
        } else if (typeof content === 'string') {
          // 🔧 流式 fallback: chars串Content也用 diff
          if (streamingEnabled && !hasStreamEvents && content.length > lastAssistantContent.length) {
            const delta = content.substring(lastAssistantContent.length);
            if (delta) {
              console.log('[CONTENT_DELTA]', delta);
            }
            lastAssistantContent = content;
          } else if (streamingEnabled && hasStreamEvents) {
            if (content.length > lastAssistantContent.length) {
              lastAssistantContent = content;
            }
          } else if (!streamingEnabled) {
            console.log('[CONTENT]', content);
          }
        }
      }

      // 实时OutputToolCall结果（user Message中的 tool_result）
      if (msg.type === 'user') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              // OutputToolCall结果，前端Can实时UpdateToolStatus
              console.log('[TOOL_RESULT]', JSON.stringify(block));
            }
          }
        }
      }

      // 捕获并Save session_id
      if (msg.type === 'system' && msg.session_id) {
        currentSessionId = msg.session_id;
        console.log('[SESSION_ID]', msg.session_id);

        // Store the query result for rewind operations
        activeQueryResults.set(msg.session_id, result);
        console.log('[REWIND_DEBUG] Stored query result for session:', msg.session_id);

        // Output slash_commands（IfExists）
        if (msg.subtype === 'init' && Array.isArray(msg.slash_commands)) {
          // console.log('[SLASH_COMMANDS]', JSON.stringify(msg.slash_commands));
        }
      }

      // CheckYesNo收到Incorrect结果Message（FastDetect API Key Incorrect）
      if (msg.type === 'result' && msg.is_error) {
        console.error('[DEBUG] Received error result message:', JSON.stringify(msg));
        const errorText = msg.result || msg.message || 'API request failed';
        throw new Error(errorText);
      }
    }
    } catch (loopError) {
      // 捕获 for await Loop中的Incorrect（Including SDK 内部 spawn 子进程Failed等）
      console.error('[DEBUG] Error in message loop:', loopError.message);
      console.error('[DEBUG] Error name:', loopError.name);
      console.error('[DEBUG] Error stack:', loopError.stack);
      // CheckYesNoYes子进程RelatedIncorrect
      if (loopError.code) {
        console.error('[DEBUG] Error code:', loopError.code);
      }
      if (loopError.errno) {
        console.error('[DEBUG] Error errno:', loopError.errno);
      }
      if (loopError.syscall) {
        console.error('[DEBUG] Error syscall:', loopError.syscall);
      }
      if (loopError.path) {
        console.error('[DEBUG] Error path:', loopError.path);
      }
      if (loopError.spawnargs) {
        console.error('[DEBUG] Error spawnargs:', JSON.stringify(loopError.spawnargs));
      }
      throw loopError; // 重新抛出让外层 catch Handle
    }

    console.log(`[DEBUG] Message loop completed. Total messages: ${messageCount}`);

    // 🔧 Streaming：Output流式EndMark
    if (streamingEnabled && streamStarted) {
      console.log('[STREAM_END]');
      streamEnded = true;
    }

	    console.log('[MESSAGE_END]');
	    console.log(JSON.stringify({
	      success: true,
	      sessionId: currentSessionId
	    }));

	  } catch (error) {
	    // 🔧 Streaming：Exception时也要End流式，Avoid前端卡在 streaming Status
	    if (streamingEnabled && streamStarted && !streamEnded) {
	      console.log('[STREAM_END]');
	      streamEnded = true;
	    }
	    const payload = buildConfigErrorPayload(error);
	    console.error('[SEND_ERROR]', JSON.stringify(payload));
	    console.log(JSON.stringify(payload));
	  } finally {
	    if (timeoutId) clearTimeout(timeoutId);
	  }
	}

/**
 * Use Anthropic SDK SendMessage（用于第三方 API Proxy的回退方案）
 */
export async function sendMessageWithAnthropicSDK(message, resumeSessionId, cwd, permissionMode, model, apiKey, baseUrl, authType) {
  try {
    const workingDirectory = selectWorkingDirectory(cwd);
    try { process.chdir(workingDirectory); } catch {}

    const sessionId = (resumeSessionId && resumeSessionId !== '') ? resumeSessionId : randomUUID();
    const modelId = model || 'claude-sonnet-4-5';

    // According toAuth类型UseCorrect的 SDK Parameter
    // authType = 'auth_token': Use authToken Parameter（Bearer Auth）
    // authType = 'api_key': Use apiKey Parameter（x-api-key Auth）
    let client;
    if (authType === 'auth_token') {
      console.log('[DEBUG] Using Bearer authentication (ANTHROPIC_AUTH_TOKEN)');
      // Use authToken Parameter（Bearer Auth）并Clear apiKey
      client = new Anthropic({
        authToken: apiKey,
        apiKey: null,  // 明确Set为 null AvoidUse x-api-key header
        baseURL: baseUrl || undefined
      });
      // 优先Use Bearer（ANTHROPIC_AUTH_TOKEN），Avoid继续Send x-api-key
      delete process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    } else if (authType === 'aws_bedrock') {
        console.log('[DEBUG] Using AWS_BEDROCK authentication (AWS_BEDROCK)');
        client = new AnthropicBedrock();
    } else {
      console.log('[DEBUG] Using API Key authentication (ANTHROPIC_API_KEY)');
      // Use apiKey Parameter（x-api-key Auth）
      client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined
      });
    }

    console.log('[MESSAGE_START]');
    console.log('[SESSION_ID]', sessionId);
    console.log('[DEBUG] Using Anthropic SDK fallback for custom Base URL (non-streaming)');
    console.log('[DEBUG] Model:', modelId);
    console.log('[DEBUG] Base URL:', baseUrl);
    console.log('[DEBUG] Auth type:', authType || 'api_key (default)');

    const userContent = [{ type: 'text', text: message }];

    persistJsonlMessage(sessionId, cwd, {
      type: 'user',
      message: { content: userContent }
    });

    let messagesForApi = [{ role: 'user', content: userContent }];
    if (resumeSessionId && resumeSessionId !== '') {
      const historyMessages = loadSessionHistory(sessionId, cwd);
      if (historyMessages.length > 0) {
        messagesForApi = [...historyMessages, { role: 'user', content: userContent }];
        console.log('[DEBUG] Loaded', historyMessages.length, 'history messages for session continuity');
      }
    }

    const systemMsg = {
      type: 'system',
      subtype: 'init',
      cwd: workingDirectory,
      session_id: sessionId,
      tools: [],
      mcp_servers: [],
      model: modelId,
      permissionMode: permissionMode || 'default',
      apiKeySource: 'ANTHROPIC_API_KEY',
      uuid: randomUUID()
    };
    console.log('[MESSAGE]', JSON.stringify(systemMsg));

    console.log('[DEBUG] Calling messages.create() with non-streaming API...');

    const response = await client.messages.create({
      model: modelId,
      max_tokens: 8192,
      messages: messagesForApi
    });

    console.log('[DEBUG] API response received');

    if (response.error || response.type === 'error') {
      const errorMsg = response.error?.message || response.message || 'Unknown API error';
      console.error('[API_ERROR]', errorMsg);

      const errorContent = [{
        type: 'text',
        text: `API Incorrect: ${errorMsg}\n\nMaybe的原因:\n1. API Key Config不Correct\n2. 第三方ProxyServiceConfigIssue\n3. 请Check ~/.claude/settings.json 中的Config`
      }];

      const assistantMsg = {
        type: 'assistant',
        message: {
          id: randomUUID(),
          model: modelId,
          role: 'assistant',
          stop_reason: 'error',
          type: 'message',
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: errorContent
        },
        session_id: sessionId,
        uuid: randomUUID()
      };
      console.log('[MESSAGE]', JSON.stringify(assistantMsg));
      console.log('[CONTENT]', errorContent[0].text);

      const resultMsg = {
        type: 'result',
        subtype: 'error',
        is_error: true,
        duration_ms: 0,
        num_turns: 1,
        result: errorContent[0].text,
        session_id: sessionId,
        total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        uuid: randomUUID()
      };
      console.log('[MESSAGE]', JSON.stringify(resultMsg));
      console.log('[MESSAGE_END]');
      console.log(JSON.stringify({ success: false, error: errorMsg }));
      return;
    }

    const respContent = response.content || [];
    const usage = response.usage || {};

    const assistantMsg = {
      type: 'assistant',
      message: {
        id: response.id || randomUUID(),
        model: response.model || modelId,
        role: 'assistant',
        stop_reason: response.stop_reason || 'end_turn',
        type: 'message',
        usage: {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        },
        content: respContent
      },
      session_id: sessionId,
      uuid: randomUUID()
    };
    console.log('[MESSAGE]', JSON.stringify(assistantMsg));

    persistJsonlMessage(sessionId, cwd, {
      type: 'assistant',
      message: { content: respContent }
    });

    for (const block of respContent) {
      if (block.type === 'text') {
        console.log('[CONTENT]', block.text);
      }
    }

    const resultMsg = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 0,
      num_turns: 1,
      result: respContent.map(b => b.type === 'text' ? b.text : '').join(''),
      session_id: sessionId,
      total_cost_usd: 0,
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      uuid: randomUUID()
    };
    console.log('[MESSAGE]', JSON.stringify(resultMsg));

    console.log('[MESSAGE_END]');
    console.log(JSON.stringify({ success: true, sessionId }));

  } catch (error) {
    console.error('[SEND_ERROR]', error.message);
    if (error.response) {
      console.error('[ERROR_DETAILS] Status:', error.response.status);
      console.error('[ERROR_DETAILS] Data:', JSON.stringify(error.response.data));
    }
    console.log(JSON.stringify({ success: false, error: error.message }));
  }
}

/**
 * Use Claude Agent SDK Send带附件的Message（多模态）
 */
export async function sendMessageWithAttachments(message, resumeSessionId = null, cwd = null, permissionMode = null, model = null, stdinData = null) {
	  let timeoutId;
	  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key and get config info (including auth type)
    const { baseUrl, authType } = setupApiKey();

    console.log('[MESSAGE_START]');

    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Load附件
    const attachments = await loadAttachments(stdinData);

    // 提取Open的FileList和AgentTip词（从 stdinData）
    const openedFiles = stdinData?.openedFiles || null;
    const agentPrompt = stdinData?.agentPrompt || null;
    console.log('[Agent] message-service.sendMessageWithAttachments received agentPrompt:', agentPrompt ? `✓ (${agentPrompt.length} chars)` : '✗ null');

    // Build systemPrompt.append content (for adding opened files context and agent prompt)
    // Build IDE context prompt using unified prompt management module
    const systemPromptAppend = buildIDEContextPrompt(openedFiles, agentPrompt);
    console.log('[Agent] systemPromptAppend built (with attachments):', systemPromptAppend ? `✓ (${systemPromptAppend.length} chars)` : '✗ empty');

    // 构建UserMessageContent块
    const contentBlocks = buildContentBlocks(attachments, message);

    // 构建 SDKUserMessage Format
    const userMessage = {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: contentBlocks
      }
    };

    const sdkModelName = mapModelIdToSdkName(model);
    // 不再FindSystem CLI，Use SDK 内置 cli.js
    console.log('[DEBUG] (withAttachments) Using SDK built-in Claude CLI (cli.js)');

    // Create输入流并放入UserMessage
    const inputStream = new AsyncStream();
    inputStream.enqueue(userMessage);
    inputStream.done();

    // 规范化 permissionMode：Emptychars串或 null 都视为 'default'
    // 参见 docs/multimodal-permission-bug.md
    const normalizedPermissionMode = (!permissionMode || permissionMode === '') ? 'default' : permissionMode;
    console.log('[PERM_DEBUG] (withAttachments) permissionMode:', permissionMode);
    console.log('[PERM_DEBUG] (withAttachments) normalizedPermissionMode:', normalizedPermissionMode);

    // PreToolUse hook 用于Permission控制（替代 canUseTool，Because在 AsyncIterable Mode下 canUseTool 不被Call）
    // 参见 docs/multimodal-permission-bug.md
    const preToolUseHook = createPreToolUseHook(normalizedPermissionMode);

    // Note：According to SDK Doc，If不指定 matcher，则该 Hook 会MatchAllTool
    // Here统一Use一个全局 PreToolUse Hook，由 Hook 内部决定哪些ToolAuto放行

    // 🔧 Read Extended Thinking config from settings.json
    const settings = loadClaudeSettings();
    const alwaysThinkingEnabled = settings?.alwaysThinkingEnabled ?? true;
    const configuredMaxThinkingTokens = settings?.maxThinkingTokens
      || parseInt(process.env.MAX_THINKING_TOKENS || '0', 10)
      || 10000;

    // 🔧 从 stdinData 或 settings.json ReadStreamingConfig
    // Note：Use != null MeanwhileHandle null 和 undefined
    const streamingParam = stdinData?.streaming;
    const streamingEnabled = streamingParam != null
      ? streamingParam
      : (settings?.streamingEnabled ?? false);
    console.log('[STREAMING_DEBUG] (withAttachments) stdinData.streaming:', streamingParam);
    console.log('[STREAMING_DEBUG] (withAttachments) settings.streamingEnabled:', settings?.streamingEnabled);
    console.log('[STREAMING_DEBUG] (withAttachments) streamingEnabled (final):', streamingEnabled);

    // Enable Extended Thinking based on config
    // - If alwaysThinkingEnabled is true, use configured maxThinkingTokens
    // - If false, dont set maxThinkingTokens (let SDK use default)
    const maxThinkingTokens = alwaysThinkingEnabled ? configuredMaxThinkingTokens : undefined;

    console.log('[THINKING_DEBUG] (withAttachments) alwaysThinkingEnabled:', alwaysThinkingEnabled);
    console.log('[THINKING_DEBUG] (withAttachments) maxThinkingTokens:', maxThinkingTokens);

    const options = {
      cwd: workingDirectory,
      permissionMode: normalizedPermissionMode,
      model: sdkModelName,
      maxTurns: 100,
      // Enable file checkpointing for rewind feature
      enableFileCheckpointing: true,
      // Extended Thinking config (based on settings.json alwaysThinkingEnabled)
      // Thinking content output via [THINKING] tag for frontend
      ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
      // 🔧 Streaming config: enable includePartialMessages for incremental content
      ...(streamingEnabled && { includePartialMessages: true }),
      additionalDirectories: Array.from(
        new Set(
          [workingDirectory, process.env.IDEA_PROJECT_PATH, process.env.PROJECT_PATH].filter(Boolean)
        )
      ),
      // MeanwhileSet canUseTool 和 hooks，Ensure至少一个生效
      // 在 AsyncIterable Mode下 canUseTool Maybe不被Call，SoMustConfig PreToolUse hook
      canUseTool: normalizedPermissionMode === 'default' ? canUseTool : undefined,
      hooks: {
        PreToolUse: [{
          hooks: [preToolUseHook]
        }]
      },
      // Dont pass pathToClaudeCodeExecutable, SDK uses built-in cli.js
      settingSources: ['user', 'project', 'local'],
      // Use Claude Code preset system prompt so Claude knows current working directory
      // Key fix for path issues: without systemPrompt Claude doesnt know cwd
      // If openedFiles exists, add context via append field
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        ...(systemPromptAppend && { append: systemPromptAppend })
      }
    };
    console.log('[PERM_DEBUG] (withAttachments) options.canUseTool:', options.canUseTool ? 'SET' : 'NOT SET');
    console.log('[PERM_DEBUG] (withAttachments) options.hooks:', options.hooks ? 'SET (PreToolUse)' : 'NOT SET');
    console.log('[PERM_DEBUG] (withAttachments) options.permissionMode:', options.permissionMode);
    console.log('[STREAMING_DEBUG] (withAttachments) options.includePartialMessages:', options.includePartialMessages ? 'SET' : 'NOT SET');

	    // BeforeHereVia AbortController + 30 秒AutoTimeout来Interrupt带附件的Request
	    // 这会导致在ConfigCorrect的情况下仍然出现 "Claude Code process aborted by user" 的误导性Incorrect
	    // 为保持与纯文本 sendMessage 一致，Here暂时DisableAutoTimeout逻辑，改由 IDE 侧Interrupt控制
	    // const abortController = new AbortController();
	    // options.abortController = abortController;

	    if (resumeSessionId && resumeSessionId !== '') {
	      options.resume = resumeSessionId;
	      console.log('[RESUMING]', resumeSessionId);
	    }

		    const result = query({
		      prompt: inputStream,
		      options
		    });

	    // 如需再次EnableAutoTimeout，可在此处Via AbortController Implementation，并Ensure给出Clear的"ResponseTimeout"Tip
	    // timeoutId = setTimeout(() => {
	    //   console.log('[DEBUG] Query with attachments timeout after 30 seconds, aborting...');
	    //   abortController.abort();
	    // }, 30000);

		    let currentSessionId = resumeSessionId;
		    // 🔧 StreamingStatus追踪
		    let streamStarted = false;
		    let streamEnded = false;
		    let hasStreamEvents = false;
		    // 🔧 diff fallback: 追踪上次的 assistant Content，用于计算Incremental
		    let lastAssistantContent = '';
		    let lastThinkingContent = '';

		    try {
		    for await (const msg of result) {
		      // 🔧 Streaming：Output流式StartMark（仅首次）
		      if (streamingEnabled && !streamStarted) {
		        console.log('[STREAM_START]');
		        streamStarted = true;
		      }

		      // 🔧 Streaming：Handle SDKPartialAssistantMessage（type: 'stream_event'）
		      // 放宽识别条件：只要Yes stream_event 类型就TryHandle
		      if (streamingEnabled && msg.type === 'stream_event') {
		        hasStreamEvents = true;
		        const event = msg.event;

		        if (event) {
		          // content_block_delta: 文本或 JSON Incremental
		          if (event.type === 'content_block_delta' && event.delta) {
		            if (event.delta.type === 'text_delta' && event.delta.text) {
		              console.log('[CONTENT_DELTA]', event.delta.text);
		              lastAssistantContent += event.delta.text;
		            } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
		              console.log('[THINKING_DELTA]', event.delta.thinking);
		              lastThinkingContent += event.delta.thinking;
		            }
		          }

		          // content_block_start: 新Content块Start
		          if (event.type === 'content_block_start' && event.content_block) {
		            if (event.content_block.type === 'thinking') {
		              console.log('[THINKING_START]');
		            }
		          }
		        }

		        // 🔧 关键修复：stream_event 不Output [MESSAGE]
		        // console.log('[STREAM_DEBUG]', JSON.stringify(msg));
		        continue;
		      }

	    	      // 🔧 Streaming mode下，assistant MessageNeed特殊Handle
	    	      let shouldOutputMessage2 = true;
	    	      if (streamingEnabled && msg.type === 'assistant') {
	    	        const msgContent2 = msg.message?.content;
	    	        const hasToolUse2 = Array.isArray(msgContent2) && msgContent2.some(block => block.type === 'tool_use');
	    	        if (!hasToolUse2) {
	    	          shouldOutputMessage2 = false;
	    	        }
	    	      }
	    	      if (shouldOutputMessage2) {
	    	        console.log('[MESSAGE]', JSON.stringify(msg));
	    	      }

	    	      // Handle完整的助手Message
	    	      if (msg.type === 'assistant') {
	    	        const content = msg.message?.content;

	    	        if (Array.isArray(content)) {
	    	          for (const block of content) {
	    	            if (block.type === 'text') {
	    	              const currentText = block.text || '';
	    	              // 🔧 流式 fallback: IfEnable流式但 SDK 没给 stream_event，则用 diff 计算 delta
	    	              if (streamingEnabled && !hasStreamEvents && currentText.length > lastAssistantContent.length) {
	    	                const delta = currentText.substring(lastAssistantContent.length);
	    	                if (delta) {
	    	                  console.log('[CONTENT_DELTA]', delta);
	    	                }
	    	                lastAssistantContent = currentText;
	    	              } else if (streamingEnabled && hasStreamEvents) {
	    	                if (currentText.length > lastAssistantContent.length) {
	    	                  lastAssistantContent = currentText;
	    	                }
	    	              } else if (!streamingEnabled) {
	    	                console.log('[CONTENT]', currentText);
	    	              }
	    	            } else if (block.type === 'thinking') {
	    	              const thinkingText = block.thinking || block.text || '';
	    	              // 🔧 流式 fallback: thinking 也用 diff
	    	              if (streamingEnabled && !hasStreamEvents && thinkingText.length > lastThinkingContent.length) {
	    	                const delta = thinkingText.substring(lastThinkingContent.length);
	    	                if (delta) {
	    	                  console.log('[THINKING_DELTA]', delta);
	    	                }
	    	                lastThinkingContent = thinkingText;
	    	              } else if (streamingEnabled && hasStreamEvents) {
	    	                if (thinkingText.length > lastThinkingContent.length) {
	    	                  lastThinkingContent = thinkingText;
	    	                }
	    	              } else if (!streamingEnabled) {
	    	                console.log('[THINKING]', thinkingText);
	    	              }
	    	            } else if (block.type === 'tool_use') {
	    	              console.log('[DEBUG] Tool use payload (withAttachments):', JSON.stringify(block));
	    	            } else if (block.type === 'tool_result') {
	    	              console.log('[DEBUG] Tool result payload (withAttachments):', JSON.stringify(block));
	    	            }
	    	          }
	    	        } else if (typeof content === 'string') {
	    	          // 🔧 流式 fallback: chars串Content也用 diff
	    	          if (streamingEnabled && !hasStreamEvents && content.length > lastAssistantContent.length) {
	    	            const delta = content.substring(lastAssistantContent.length);
	    	            if (delta) {
	    	              console.log('[CONTENT_DELTA]', delta);
	    	            }
	    	            lastAssistantContent = content;
	    	          } else if (streamingEnabled && hasStreamEvents) {
	    	            if (content.length > lastAssistantContent.length) {
	    	              lastAssistantContent = content;
	    	            }
	    	          } else if (!streamingEnabled) {
	    	            console.log('[CONTENT]', content);
	    	          }
	    	        }
	    	      }

	    	      // 实时OutputToolCall结果（user Message中的 tool_result）
	    	      if (msg.type === 'user') {
	    	        const content = msg.message?.content;
	    	        if (Array.isArray(content)) {
	    	          for (const block of content) {
	    	            if (block.type === 'tool_result') {
	    	              // OutputToolCall结果，前端Can实时UpdateToolStatus
	    	              console.log('[TOOL_RESULT]', JSON.stringify(block));
	    	            }
	    	          }
	    	        }
	    	      }

	    	      if (msg.type === 'system' && msg.session_id) {
	    	        currentSessionId = msg.session_id;
	    	        console.log('[SESSION_ID]', msg.session_id);

	    	        // Store the query result for rewind operations
	    	        activeQueryResults.set(msg.session_id, result);
	    	        console.log('[REWIND_DEBUG] (withAttachments) Stored query result for session:', msg.session_id);
	    	      }

	    	      // CheckYesNo收到Incorrect结果Message（FastDetect API Key Incorrect）
	    	      if (msg.type === 'result' && msg.is_error) {
	    	        console.error('[DEBUG] (withAttachments) Received error result message:', JSON.stringify(msg));
	    	        const errorText = msg.result || msg.message || 'API request failed';
	    	        throw new Error(errorText);
	    	      }
	    	    }
	    	    } catch (loopError) {
	    	      // 捕获 for await Loop中的Incorrect
	    	      console.error('[DEBUG] Error in message loop (withAttachments):', loopError.message);
	    	      console.error('[DEBUG] Error name:', loopError.name);
	    	      console.error('[DEBUG] Error stack:', loopError.stack);
	    	      if (loopError.code) console.error('[DEBUG] Error code:', loopError.code);
	    	      if (loopError.errno) console.error('[DEBUG] Error errno:', loopError.errno);
	    	      if (loopError.syscall) console.error('[DEBUG] Error syscall:', loopError.syscall);
	    	      if (loopError.path) console.error('[DEBUG] Error path:', loopError.path);
	    	      if (loopError.spawnargs) console.error('[DEBUG] Error spawnargs:', JSON.stringify(loopError.spawnargs));
	    	      throw loopError;
	    	    }

	    // 🔧 Streaming：Output流式EndMark
	    if (streamingEnabled && streamStarted) {
	      console.log('[STREAM_END]');
	      streamEnded = true;
	    }

	    console.log('[MESSAGE_END]');
	    console.log(JSON.stringify({
	      success: true,
	      sessionId: currentSessionId
	    }));

	  } catch (error) {
	    // 🔧 Streaming：Exception时也要End流式，Avoid前端卡在 streaming Status
	    if (streamingEnabled && streamStarted && !streamEnded) {
	      console.log('[STREAM_END]');
	      streamEnded = true;
	    }
	    const payload = buildConfigErrorPayload(error);
	    console.error('[SEND_ERROR]', JSON.stringify(payload));
	    console.log(JSON.stringify(payload));
	  } finally {
	    if (timeoutId) clearTimeout(timeoutId);
	  }
	}

/**
 * Get斜杠命令List
 * Via SDK 的 supportedCommands() MethodGet完整的命令List
 * 这个Method不NeedSendMessage，Can在Plugin启动时Call
 */
export async function getSlashCommands(cwd = null) {
  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Set API Key
    setupApiKey();

    // Ensure HOME EnvironmentVariableSetCorrect
    if (!process.env.HOME) {
      const os = await import('os');
      process.env.HOME = os.homedir();
    }

    // Smart working directory detection
    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Create一个Empty的输入流
    const inputStream = new AsyncStream();

    // Call query Function，UseEmpty输入流
    // 这样不会SendAnyMessage，只YesInitialize SDK 以GetConfig
    const result = query({
      prompt: inputStream,
      options: {
        cwd: workingDirectory,
        permissionMode: 'default',
        maxTurns: 0,  // 不Need进行Any轮次
        canUseTool: async () => ({
          behavior: 'deny',
          message: 'Config loading only'
        }),
        // 明确EnableDefaultTool集
        tools: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        // 捕获 SDK stderr DebugLog，帮助定位 CLI InitializeIssue
        stderr: (data) => {
          if (data && data.trim()) {
            console.log(`[SDK-STDERR] ${data.trim()}`);
          }
        }
      }
    });

    // 立即Close输入流，告诉 SDK 我们NoneMessage要Send
    inputStream.done();

    // GetSupport的命令List
    // SDK Return的FormatYes SlashCommand[]，包含 name 和 description
    const slashCommands = await result.supportedCommands?.() || [];

    // 清理资源
    await result.return?.();

    // Output命令List（包含 name 和 description）
    console.log('[SLASH_COMMANDS]', JSON.stringify(slashCommands));

    console.log(JSON.stringify({
      success: true,
      commands: slashCommands
    }));

  } catch (error) {
    console.error('[GET_SLASH_COMMANDS_ERROR]', error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      commands: []
    }));
  }
}

/**
 * Get MCP Service器ConnectStatus
 * Via SDK 的 mcpServerStatus() MethodGetAllConfig的 MCP Service器的ConnectStatus
 * @param {string} cwd - Working directory（Optional）
 */
export async function getMcpServerStatus(cwd = null) {
  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Set API Key
    setupApiKey();

    // Ensure HOME EnvironmentVariableSetCorrect
    if (!process.env.HOME) {
      const os = await import('os');
      process.env.HOME = os.homedir();
    }

    // Smart working directory detection
    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Create一个Empty的输入流
    const inputStream = new AsyncStream();

    // Call query Function，UseEmpty输入流
    const result = query({
      prompt: inputStream,
      options: {
        cwd: workingDirectory,
        permissionMode: 'default',
        maxTurns: 0,
        canUseTool: async () => ({
          behavior: 'deny',
          message: 'Config loading only'
        }),
        tools: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        stderr: (data) => {
          if (data && data.trim()) {
            console.log(`[SDK-STDERR] ${data.trim()}`);
          }
        }
      }
    });

    // 立即Close输入流
    inputStream.done();

    // Get MCP Service器Status
    // SDK Return的FormatYes McpServerStatus[]，包含 name, status, serverInfo
    const mcpStatus = await result.mcpServerStatus?.() || [];

    // 清理资源
    await result.return?.();

    // Output MCP Service器Status
    console.log('[MCP_SERVER_STATUS]', JSON.stringify(mcpStatus));

    console.log(JSON.stringify({
      success: true,
      servers: mcpStatus
    }));

  } catch (error) {
    console.error('[GET_MCP_SERVER_STATUS_ERROR]', error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      servers: []
    }));
  }
}

/**
 * Rewind files to a specific user message state
 * Uses the SDK's rewindFiles() API to restore files to their state at a given message
 * @param {string} sessionId - Session ID
 * @param {string} userMessageId - User message UUID to rewind to
 */
export async function rewindFiles(sessionId, userMessageId, cwd = null) {
  let result = null;
  try {
    console.log('[REWIND] ========== REWIND OPERATION START ==========');
    console.log('[REWIND] Session ID:', sessionId);
    console.log('[REWIND] Target message ID:', userMessageId);
    console.log('[REWIND] CWD:', cwd);
    console.log('[REWIND] Active sessions in memory:', Array.from(activeQueryResults.keys()));

    // Get the stored query result for this session
    result = activeQueryResults.get(sessionId);
    console.log('[REWIND] Result found in memory:', !!result);

    // If result not in memory, try to resume the session to get a fresh query result
    if (!result) {
      console.log('[REWIND] Session not in memory, attempting to resume...');

      try {
        process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

        setupApiKey();

        if (!process.env.HOME) {
          const os = await import('os');
          process.env.HOME = os.homedir();
        }

        const workingDirectory = selectWorkingDirectory(cwd);
        try {
          process.chdir(workingDirectory);
        } catch (chdirError) {
          console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
        }

        const options = {
          resume: sessionId,
          cwd: workingDirectory,
          permissionMode: 'default',
          enableFileCheckpointing: true,
          maxTurns: 1,
          tools: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user', 'project', 'local'],
          additionalDirectories: Array.from(
            new Set(
              [workingDirectory, process.env.IDEA_PROJECT_PATH, process.env.PROJECT_PATH].filter(Boolean)
            )
          ),
          canUseTool: async () => ({
            behavior: 'deny',
            message: 'Rewind operation'
          }),
          stderr: (data) => {
            if (data && data.trim()) {
              console.log(`[SDK-STDERR] ${data.trim()}`);
            }
          }
        };

        console.log('[REWIND] Resuming session with options:', JSON.stringify(options));
        result = query({ prompt: '', options });

      } catch (resumeError) {
        const errorMsg = `Failed to resume session ${sessionId}: ${resumeError.message}`;
        console.error('[REWIND_ERROR]', errorMsg);
        console.log(JSON.stringify({
          success: false,
          error: errorMsg
        }));
        return;
      }
    }

    // Check if rewindFiles method exists on the result object
    if (typeof result.rewindFiles !== 'function') {
      const errorMsg = 'rewindFiles method not available. File checkpointing may not be enabled or SDK version too old.';
      console.error('[REWIND_ERROR]', errorMsg);
      console.log(JSON.stringify({
        success: false,
        error: errorMsg
      }));
      return;
    }

    const timeoutMs = 45000;

    const attemptRewind = async (targetUserMessageId) => {
      console.log('[REWIND] Calling result.rewindFiles()...', JSON.stringify({ targetUserMessageId }));
      await Promise.race([
        result.rewindFiles(targetUserMessageId),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Rewind timeout (${timeoutMs}ms)`)), timeoutMs))
      ]);
      return targetUserMessageId;
    };

    let usedMessageId = null;
    try {
      usedMessageId = await attemptRewind(userMessageId);
    } catch (primaryError) {
      const msg = primaryError?.message || String(primaryError);
      if (!msg.includes('No file checkpoint found for message')) {
        throw primaryError;
      }

      console.log('[REWIND] No checkpoint for requested message, attempting to resolve alternative user message id...');

      const candidateIds = await resolveRewindCandidateMessageIds(sessionId, cwd, userMessageId);
      console.log('[REWIND] Candidate message ids:', JSON.stringify(candidateIds));

      let lastError = primaryError;
      for (const candidateId of candidateIds) {
        if (!candidateId || candidateId === userMessageId) continue;
        try {
          usedMessageId = await attemptRewind(candidateId);
          lastError = null;
          break;
        } catch (candidateError) {
          lastError = candidateError;
          const candidateMsg = candidateError?.message || String(candidateError);
          if (!candidateMsg.includes('No file checkpoint found for message')) {
            throw candidateError;
          }
        }
      }

      if (!usedMessageId) {
        throw lastError;
      }
    }

    console.log('[REWIND] Files rewound successfully');

    console.log(JSON.stringify({
      success: true,
      message: 'Files restored successfully',
      sessionId,
      targetMessageId: usedMessageId
    }));

  } catch (error) {
    console.error('[REWIND_ERROR]', error.message);
    console.error('[REWIND_ERROR_STACK]', error.stack);
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
  } finally {
    try {
      await result?.return?.();
    } catch {
    }
  }
}

async function resolveRewindCandidateMessageIds(sessionId, cwd, providedMessageId) {
  const messages = await readClaudeProjectSessionMessages(sessionId, cwd);
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const byId = new Map();
  for (const m of messages) {
    if (m && typeof m === 'object' && typeof m.uuid === 'string') {
      byId.set(m.uuid, m);
    }
  }

  const isUserTextMessage = (m) => {
    if (!m || m.type !== 'user') return false;
    const content = m.message?.content;
    if (!content) return false;
    if (typeof content === 'string') {
      return content.trim().length > 0;
    }
    if (Array.isArray(content)) {
      return content.some((b) => b && b.type === 'text' && String(b.text || '').trim().length > 0);
    }
    return false;
  };

  const candidates = [];
  const visited = new Set();

  let current = providedMessageId ? byId.get(providedMessageId) : null;
  while (current && current.uuid && !visited.has(current.uuid)) {
    visited.add(current.uuid);
    if (typeof current.uuid === 'string') {
      candidates.push(current.uuid);
    }
    if (isUserTextMessage(current) && typeof current.uuid === 'string') {
      candidates.push(current.uuid);
      break;
    }
    const parent = current.parentUuid ? byId.get(current.parentUuid) : null;
    current = parent || null;
  }

  const lastUserText = [...messages].reverse().find(isUserTextMessage);
  if (lastUserText?.uuid) {
    candidates.push(lastUserText.uuid);
  }

  const unique = [];
  const seen = new Set();
  for (const id of candidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  const maxCandidates = 8;
  if (unique.length <= maxCandidates) return unique;
  return unique.slice(0, maxCandidates);
}

async function readClaudeProjectSessionMessages(sessionId, cwd) {
  try {
    const projectsDir = join(homedir(), '.claude', 'projects');
    const sanitizedCwd = (cwd || process.cwd()).replace(/[^a-zA-Z0-9]/g, '-');
    const sessionFile = join(projectsDir, sanitizedCwd, `${sessionId}.jsonl`);
    if (!existsSync(sessionFile)) {
      return [];
    }
    const content = await readFile(sessionFile, 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get active session IDs for debugging
 * @returns {string[]} Array of active session IDs
 */
export function getActiveSessionIds() {
  return Array.from(activeQueryResults.keys());
}

/**
 * Check if a session has an active query result for rewind operations
 * @param {string} sessionId - Session ID to check
 * @returns {boolean} True if session has active query result
 */
export function hasActiveSession(sessionId) {
  return activeQueryResults.has(sessionId);
}

/**
 * Remove a session from the active query results map
 * Should be called when a session ends to free up memory
 * @param {string} sessionId - Session ID to remove
 */
export function removeSession(sessionId) {
  if (activeQueryResults.has(sessionId)) {
    activeQueryResults.delete(sessionId);
    console.log('[REWIND_DEBUG] Removed session from active queries:', sessionId);
    return true;
  }
  return false;
}
