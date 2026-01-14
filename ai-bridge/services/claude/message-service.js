/**
 * Message sending service module
 * Handles message sending via Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

import { setupApiKey, isCustomBaseUrl, loadClaudeSettings, hasCliSessionAuth } from '../../config/api-config.js';
import { selectWorkingDirectory } from '../../utils/path-utils.js';
import { mapModelIdToSdkName } from '../../utils/model-utils.js';
import { AsyncStream } from '../../utils/async-stream.js';
import { canUseTool } from '../../permission-handler.js';
import { persistJsonlMessage, loadSessionHistory } from './session-service.js';
import { loadAttachments, buildContentBlocks } from './attachment-service.js';
import { buildIDEContextPrompt } from '../system-prompts.js';
import { getEffectiveMode, clearModeOverride } from '../../session-state.js';

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

/**
 * Create PreToolUse hook with dynamic mode reading from session state
 * @param {string} initialMode - Initial permission mode
 * @param {Object} sessionRef - Mutable session reference { sessionId: string | null }
 *                              Updated when we receive session_id from SDK
 */
function createPreToolUseHook(initialMode, sessionRef) {
  const normalizedInitialMode = (!initialMode || initialMode === '') ? 'default' : initialMode;

  return async (input) => {
    // Read current effective mode from session state (may have been updated by ExitPlanMode)
    const currentMode = sessionRef.sessionId
      ? getEffectiveMode(sessionRef.sessionId, normalizedInitialMode)
      : normalizedInitialMode;

    console.log('[PERM_DEBUG] PreToolUse hook called:', input?.tool_name);
    console.log('[PERM_DEBUG] Effective mode:', currentMode, '(initial:', normalizedInitialMode, ', sessionId:', sessionRef.sessionId, ')');

    // In plan mode, block all tools EXCEPT ExitPlanMode (which is used to approve the plan)
    if (currentMode === 'plan') {
      if (input?.tool_name === 'ExitPlanMode') {
        console.log('[PERM_DEBUG] Allowing ExitPlanMode through in plan mode');
        // Let ExitPlanMode go through to canUseTool for plan approval dialog
      } else {
        return {
          decision: 'block',
          reason: 'Permission mode is plan (no execution)'
        };
      }
    }

    if (shouldAutoApproveTool(currentMode, input?.tool_name)) {
      console.log('[PERM_DEBUG] Auto-approve tool:', input?.tool_name, 'mode:', currentMode);
      return { decision: 'approve' };
    }

    console.log('[PERM_DEBUG] Calling canUseTool...');
    try {
      // Pass sessionId to canUseTool for mode switching after ExitPlanMode approval
      const result = await canUseTool(input?.tool_name, input?.tool_input, { sessionId: sessionRef.sessionId });
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

    // IMPORTANT: SDK does NOT support 'plan' mode natively
    // (See https://platform.claude.com/docs/en/agent-sdk/permissions - "Not currently supported in SDK")
    // We implement plan mode ourselves via PreToolUse hook, but pass 'default' to SDK
    const sdkPermissionMode = effectivePermissionMode === 'plan' ? 'default' : effectivePermissionMode;
    const shouldUseCanUseTool = sdkPermissionMode === 'default';

    console.log('[PERM_DEBUG] permissionMode:', permissionMode);
    console.log('[PERM_DEBUG] effectivePermissionMode:', effectivePermissionMode);
    console.log('[PERM_DEBUG] sdkPermissionMode:', sdkPermissionMode, effectivePermissionMode === 'plan' ? '(plan mode handled by PreToolUse hook)' : '');
    console.log('[PERM_DEBUG] shouldUseCanUseTool:', shouldUseCanUseTool);

    // Create session reference for dynamic mode switching (Phase 4 of Plan Mode)
    // This is a mutable object that gets updated when we receive the session_id
    const sessionRef = { sessionId: resumeSessionId || null };

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
      permissionMode: sdkPermissionMode,  // Use SDK-compatible mode (not 'plan')
      model: sdkModelName,
      maxTurns: 100,
      // Enable file checkpointing for rewind feature
      enableFileCheckpointing: true,
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
          // Pass effectivePermissionMode (including 'plan') to hook for our custom handling
          hooks: [createPreToolUseHook(effectivePermissionMode, sessionRef)]
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
          // Update session reference for dynamic mode switching in PreToolUse hook
          sessionRef.sessionId = msg.session_id;
          console.log('[SESSION_ID]', msg.session_id);
        }

        // Store the query result for rewind operations
        if (msg.type === 'system' && msg.session_id) {
          activeQueryResults.set(msg.session_id, result);
          console.log('[REWIND_DEBUG] Stored query result for session:', msg.session_id);
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
    // Clear mode override when session ends (optional - keeps state clean)
    // Note: We intentionally do NOT clear here to allow resuming sessions with the same mode
    // The override will be cleared when a new session with the same ID starts
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

    // IMPORTANT: SDK does NOT support 'plan' mode natively
    // (See https://platform.claude.com/docs/en/agent-sdk/permissions - "Not currently supported in SDK")
    // We implement plan mode ourselves via PreToolUse hook, but pass 'default' to SDK
    const sdkPermissionMode = normalizedPermissionMode === 'plan' ? 'default' : normalizedPermissionMode;

    // Create session reference for dynamic mode switching (Phase 4 of Plan Mode)
    const sessionRef = { sessionId: resumeSessionId || null };

    // PreToolUse hook for permission control (replaces canUseTool in AsyncIterable mode)
    // See docs/multimodal-permission-bug.md
    // Pass normalizedPermissionMode (including 'plan') to hook for our custom handling
    const preToolUseHook = createPreToolUseHook(normalizedPermissionMode, sessionRef);

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
      permissionMode: sdkPermissionMode,  // Use SDK-compatible mode (not 'plan')
      model: sdkModelName,
      maxTurns: 100,
      // Enable file checkpointing for rewind feature
      enableFileCheckpointing: true,
      // Extended Thinking configuration (based on settings.json alwaysThinkingEnabled)
      ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
      additionalDirectories: Array.from(
        new Set(
          [workingDirectory, process.env.IDEA_PROJECT_PATH, process.env.PROJECT_PATH].filter(Boolean)
        )
      ),
      // Set both canUseTool and hooks to ensure at least one takes effect
      canUseTool: sdkPermissionMode === 'default' ? canUseTool : undefined,
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
          // Update session reference for dynamic mode switching in PreToolUse hook
          sessionRef.sessionId = msg.session_id;
          console.log('[SESSION_ID]', msg.session_id);
        }

        // Store the query result for rewind operations
        if (msg.type === 'system' && msg.session_id) {
          activeQueryResults.set(msg.session_id, result);
          console.log('[REWIND_DEBUG] (withAttachments) Stored query result for session:', msg.session_id);
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
    // Clear mode override when session ends (optional - keeps state clean)
    // Note: We intentionally do NOT clear here to allow resuming sessions with the same mode
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
