/**
 * Message sending service module
 * Handles message sending via Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

import { setupApiKey, isCustomBaseUrl, loadClaudeSettings, hasCliSessionAuth } from '../../config/api-config.js';
import { selectWorkingDirectory } from '../../utils/path-utils.js';
import { mapModelIdToSdkName } from '../../utils/model-utils.js';
import { AsyncStream } from '../../utils/async-stream.js';
import { canUseTool } from '../../permission-handler.js';
import { persistJsonlMessage, loadSessionHistory } from './session-service.js';
import { loadAttachments, buildContentBlocks } from './attachment-service.js';
import { buildIDEContextPrompt } from '../system-prompts.js';

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
 * Build error payload with configuration details for user-facing error messages
 */
function buildConfigErrorPayload(error) {
  try {
    const rawError = error?.message || String(error);
    const errorName = error?.name || 'Error';
    const errorStack = error?.stack || null;

    // Check for abort/timeout errors
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

    // Check CLI session auth status
    const hasCliSession = hasCliSessionAuth();
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
    } else if (hasCliSession) {
      keySource = 'CLI session (~/.claude/.credentials.json)';
    }

    const keyPreview = rawKey && rawKey.length > 0
      ? `${rawKey.substring(0, 10)}... (${rawKey.length} chars)`
      : hasCliSession
        ? 'CLI session auth (auto-detected)'
        : 'Not configured (empty or missing)';

    let baseUrl = settingsBaseUrl || 'https://api.anthropic.com';
    let baseUrlSource;
    if (settingsBaseUrl) {
      baseUrlSource = '~/.claude/settings.json: ANTHROPIC_BASE_URL';
    } else {
      baseUrlSource = 'Default (https://api.anthropic.com)';
    }

    const heading = isAbortError
      ? 'Claude Code was interrupted (response timeout or user cancellation):'
      : 'Claude Code error:';

    const userMessage = [
      heading,
      `- Error: ${rawError}`,
      `- API Key source: ${keySource}`,
      `- API Key preview: ${keyPreview}`,
      `- Base URL: ${baseUrl} (source: ${baseUrlSource})`,
      `- Tip: You can authenticate by: 1) Running \`claude login\` in terminal for CLI session auth; 2) Configuring API Key in plugin settings - Provider Management`,
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
        baseUrlSource,
        hasCliSession
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

// Default timeout in milliseconds (2 minutes)
const DEFAULT_QUERY_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Send message with session resume support
 * @param {string} message - Message to send
 * @param {string} resumeSessionId - Session ID to resume
 * @param {string} cwd - Working directory
 * @param {string} permissionMode - Permission mode (optional)
 * @param {string} model - Model name (optional)
 */
export async function sendMessage(message, resumeSessionId = null, cwd = null, permissionMode = null, model = null, openedFiles = null, agentPrompt = null) {
  // Create AbortController for timeout support
  const abortController = new AbortController();
  let timeoutId;

  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key and get configuration info
    const { baseUrl, authType, apiKeySource, baseUrlSource } = setupApiKey();

    console.log('[MESSAGE_START]');

    // Determine working directory
    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Map model ID to SDK name
    const sdkModelName = mapModelIdToSdkName(model);

    // Build systemPrompt.append content (for adding opened files context and agent prompt)
    const systemPromptAppend = buildIDEContextPrompt(openedFiles, agentPrompt);

    // Prepare options
    // Note: We don't pass pathToClaudeCodeExecutable, let SDK use built-in cli.js
    // This avoids Windows CLI path issues (ENOENT errors)
    const effectivePermissionMode = (!permissionMode || permissionMode === '') ? 'default' : permissionMode;
    const shouldUseCanUseTool = effectivePermissionMode === 'default';
    console.log('[PERM_DEBUG] permissionMode:', permissionMode);
    console.log('[PERM_DEBUG] effectivePermissionMode:', effectivePermissionMode);
    console.log('[PERM_DEBUG] shouldUseCanUseTool:', shouldUseCanUseTool);

    // Read Extended Thinking configuration from settings.json
    const settings = loadClaudeSettings();
    const alwaysThinkingEnabled = settings?.alwaysThinkingEnabled ?? true;
    const configuredMaxThinkingTokens = settings?.maxThinkingTokens
      || parseInt(process.env.MAX_THINKING_TOKENS || '0', 10)
      || 10000;

    // Enable Extended Thinking based on configuration
    const maxThinkingTokens = alwaysThinkingEnabled ? configuredMaxThinkingTokens : undefined;

    // Read timeout configuration from settings (default: 2 minutes)
    const queryTimeoutMs = settings?.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

    const options = {
      cwd: workingDirectory,
      permissionMode: effectivePermissionMode,
      model: sdkModelName,
      maxTurns: 100,
      // Extended Thinking configuration (based on settings.json alwaysThinkingEnabled)
      ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
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
      // Don't pass pathToClaudeCodeExecutable, SDK will use built-in cli.js
      settingSources: ['user', 'project', 'local'],
      // Use Claude Code preset system prompt so Claude knows current working directory
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        ...(systemPromptAppend && { append: systemPromptAppend })
      },
      // AbortController must be inside options (not at top level) per SDK documentation
      abortController
    };
    console.log('[PERM_DEBUG] options.canUseTool:', options.canUseTool ? 'SET' : 'NOT SET');
    console.log('[PERM_DEBUG] options.hooks:', options.hooks ? 'SET (PreToolUse)' : 'NOT SET');

    // Resume session if sessionId is provided
    if (resumeSessionId && resumeSessionId !== '') {
      options.resume = resumeSessionId;
      console.log('[RESUMING]', resumeSessionId);
    }

    // Set up timeout - abort after configured duration
    if (queryTimeoutMs > 0) {
      timeoutId = setTimeout(() => {
        console.error('[TIMEOUT] Query timeout after ' + (queryTimeoutMs / 1000) + 's, aborting...');
        abortController.abort();
      }, queryTimeoutMs);
    }

    // Call query function
    const result = query({
      prompt: message,
      options
    });

    let currentSessionId = resumeSessionId;

    // Stream output
    let messageCount = 0;
    try {
      for await (const msg of result) {
        messageCount++;

        // Output raw message for Java parsing
        console.log('[MESSAGE]', JSON.stringify(msg));

        // Real-time output of assistant content
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                console.log('[CONTENT]', block.text);
              } else if (block.type === 'thinking') {
                const thinkingText = block.thinking || block.text || '';
                console.log('[THINKING]', thinkingText);
              }
            }
          } else if (typeof content === 'string') {
            console.log('[CONTENT]', content);
          }
        }

        // Real-time output of tool results
        if (msg.type === 'user') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                console.log('[TOOL_RESULT]', JSON.stringify(block));
              }
            }
          }
        }

        // Capture and save session_id
        if (msg.type === 'system' && msg.session_id) {
          currentSessionId = msg.session_id;
          console.log('[SESSION_ID]', msg.session_id);
        }

        // Check for error result messages
        if (msg.type === 'result' && msg.is_error) {
          const errorText = msg.result || msg.message || 'API request failed';
          throw new Error(errorText);
        }
      }
    } catch (loopError) {
      // Capture errors in the for await loop
      console.error('[ERROR] Message loop error:', loopError.message);
      throw loopError;
    }

    console.log('[MESSAGE_END]');
    console.log(JSON.stringify({
      success: true,
      sessionId: currentSessionId
    }));

  } catch (error) {
    const payload = buildConfigErrorPayload(error);
    console.error('[SEND_ERROR]', JSON.stringify(payload));
    console.log(JSON.stringify(payload));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Send message using Anthropic SDK (fallback for third-party API proxies)
 */
export async function sendMessageWithAnthropicSDK(message, resumeSessionId, cwd, permissionMode, model, apiKey, baseUrl, authType) {
  try {
    const workingDirectory = selectWorkingDirectory(cwd);
    try { process.chdir(workingDirectory); } catch {}

    const sessionId = (resumeSessionId && resumeSessionId !== '') ? resumeSessionId : randomUUID();
    const modelId = model || 'claude-sonnet-4-5';

    // Use correct SDK parameters based on auth type
    let client;
    if (authType === 'auth_token') {
      client = new Anthropic({
        authToken: apiKey,
        apiKey: null,
        baseURL: baseUrl || undefined
      });
      delete process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    } else {
      client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined
      });
    }

    console.log('[MESSAGE_START]');
    console.log('[SESSION_ID]', sessionId);

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

    const response = await client.messages.create({
      model: modelId,
      max_tokens: 8192,
      messages: messagesForApi
    });

    if (response.error || response.type === 'error') {
      const errorMsg = response.error?.message || response.message || 'Unknown API error';
      console.error('[API_ERROR]', errorMsg);

      const errorContent = [{
        type: 'text',
        text: `API Error: ${errorMsg}\n\nPossible causes:\n1. API Key not configured correctly\n2. Third-party proxy configuration issue\n3. Check ~/.claude/settings.json configuration`
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
 * Send message with attachments using Claude Agent SDK (multimodal)
 */
export async function sendMessageWithAttachments(message, resumeSessionId = null, cwd = null, permissionMode = null, model = null, stdinData = null) {
  // Create AbortController for timeout support
  const abortController = new AbortController();
  let timeoutId;

  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key and get configuration info
    const { baseUrl, authType } = setupApiKey();

    console.log('[MESSAGE_START]');

    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Load attachments
    const attachments = await loadAttachments(stdinData);

    // Extract opened files list and agent prompt from stdinData
    const openedFiles = stdinData?.openedFiles || null;
    const agentPrompt = stdinData?.agentPrompt || null;

    // Build systemPrompt.append content
    const systemPromptAppend = buildIDEContextPrompt(openedFiles, agentPrompt);

    // Build user message content blocks
    const contentBlocks = buildContentBlocks(attachments, message);

    // Build SDKUserMessage format
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

    // Create input stream and enqueue user message
    const inputStream = new AsyncStream();
    inputStream.enqueue(userMessage);
    inputStream.done();

    // Normalize permissionMode: empty string or null treated as 'default'
    const normalizedPermissionMode = (!permissionMode || permissionMode === '') ? 'default' : permissionMode;

    // PreToolUse hook for permission control (replaces canUseTool in AsyncIterable mode)
    // See docs/multimodal-permission-bug.md
    const preToolUseHook = createPreToolUseHook(normalizedPermissionMode);

    // Read Extended Thinking configuration from settings.json
    const settings = loadClaudeSettings();
    const alwaysThinkingEnabled = settings?.alwaysThinkingEnabled ?? true;
    const configuredMaxThinkingTokens = settings?.maxThinkingTokens
      || parseInt(process.env.MAX_THINKING_TOKENS || '0', 10)
      || 10000;

    // Enable Extended Thinking based on configuration
    const maxThinkingTokens = alwaysThinkingEnabled ? configuredMaxThinkingTokens : undefined;

    // Read timeout configuration from settings (default: 2 minutes)
    const queryTimeoutMs = settings?.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

    const options = {
      cwd: workingDirectory,
      permissionMode: normalizedPermissionMode,
      model: sdkModelName,
      maxTurns: 100,
      ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
      additionalDirectories: Array.from(
        new Set(
          [workingDirectory, process.env.IDEA_PROJECT_PATH, process.env.PROJECT_PATH].filter(Boolean)
        )
      ),
      // Set both canUseTool and hooks to ensure at least one takes effect
      canUseTool: normalizedPermissionMode === 'default' ? canUseTool : undefined,
      hooks: {
        PreToolUse: [{
          hooks: [preToolUseHook]
        }]
      },
      // Don't pass pathToClaudeCodeExecutable, SDK will use built-in cli.js
      settingSources: ['user', 'project', 'local'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        ...(systemPromptAppend && { append: systemPromptAppend })
      },
      // AbortController must be inside options (not at top level) per SDK documentation
      abortController
    };

    if (resumeSessionId && resumeSessionId !== '') {
      options.resume = resumeSessionId;
      console.log('[RESUMING]', resumeSessionId);
    }

    // Set up timeout - abort after configured duration
    if (queryTimeoutMs > 0) {
      timeoutId = setTimeout(() => {
        console.error('[TIMEOUT] Query timeout after ' + (queryTimeoutMs / 1000) + 's, aborting...');
        abortController.abort();
      }, queryTimeoutMs);
    }

    const result = query({
      prompt: inputStream,
      options
    });

    let currentSessionId = resumeSessionId;

    try {
      for await (const msg of result) {
        console.log('[MESSAGE]', JSON.stringify(msg));

        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                console.log('[CONTENT]', block.text);
              }
            }
          } else if (typeof content === 'string') {
            console.log('[CONTENT]', content);
          }
        }

        // Real-time output of tool results
        if (msg.type === 'user') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                console.log('[TOOL_RESULT]', JSON.stringify(block));
              }
            }
          }
        }

        if (msg.type === 'system' && msg.session_id) {
          currentSessionId = msg.session_id;
          console.log('[SESSION_ID]', msg.session_id);
        }

        // Check for error result messages
        if (msg.type === 'result' && msg.is_error) {
          const errorText = msg.result || msg.message || 'API request failed';
          throw new Error(errorText);
        }
      }
    } catch (loopError) {
      console.error('[ERROR] Message loop error:', loopError.message);
      throw loopError;
    }

    console.log('[MESSAGE_END]');
    console.log(JSON.stringify({
      success: true,
      sessionId: currentSessionId
    }));

  } catch (error) {
    const payload = buildConfigErrorPayload(error);
    console.error('[SEND_ERROR]', JSON.stringify(payload));
    console.log(JSON.stringify(payload));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Get slash commands list
 * Uses SDK's supportedCommands() method to get complete command list
 */
export async function getSlashCommands(cwd = null) {
  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key
    setupApiKey();

    // Ensure HOME environment variable is set
    if (!process.env.HOME) {
      const os = await import('os');
      process.env.HOME = os.homedir();
    }

    // Determine working directory
    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Create empty input stream
    const inputStream = new AsyncStream();

    // Call query function with empty input stream to initialize SDK
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

    // Close input stream immediately
    inputStream.done();

    // Get supported commands list
    const slashCommands = await result.supportedCommands?.() || [];

    // Clean up resources
    await result.return?.();

    // Output commands list
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
 * Get MCP server connection status
 * Uses SDK's mcpServerStatus() method to get status of all configured MCP servers
 * @param {string} cwd - Working directory (optional)
 */
export async function getMcpServerStatus(cwd = null) {
  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key
    setupApiKey();

    // Ensure HOME environment variable is set
    if (!process.env.HOME) {
      const os = await import('os');
      process.env.HOME = os.homedir();
    }

    // Determine working directory
    const workingDirectory = selectWorkingDirectory(cwd);
    try {
      process.chdir(workingDirectory);
    } catch (chdirError) {
      console.error('[WARNING] Failed to change process.cwd():', chdirError.message);
    }

    // Create empty input stream
    const inputStream = new AsyncStream();

    // Call query function with empty input stream
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

    // Close input stream immediately
    inputStream.done();

    // Get MCP server status
    const mcpStatus = await result.mcpServerStatus?.() || [];

    // Clean up resources
    await result.return?.();

    // Output MCP server status
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
