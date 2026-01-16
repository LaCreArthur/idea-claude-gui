#!/usr/bin/env node
/**
 * Minimal Claude SDK Bridge
 *
 * Simple stdin/stdout JSON line protocol for Java <-> Node.js communication.
 * Replaces the complex file-based IPC with direct process I/O.
 *
 * Protocol:
 *   Java -> Node: Initial command (first line), then permission responses
 *   Node -> Java: Events, permission requests, errors
 *
 * Message types (Node -> Java):
 *   { type: "event", event: {...} }           - SDK message event
 *   { type: "permission_request", id, toolName, toolInput } - Needs user approval
 *   { type: "ask_user_question", id, questions } - AskUserQuestion tool
 *   { type: "session_id", sessionId }         - Session identifier
 *   { type: "content", text }                 - Assistant text content
 *   { type: "content_delta", delta }          - Streaming text delta
 *   { type: "thinking", text }                - Thinking content
 *   { type: "thinking_delta", delta }         - Streaming thinking delta
 *   { type: "tool_use", tool }                - Tool invocation
 *   { type: "tool_result", result }           - Tool execution result
 *   { type: "done", sessionId }               - Query complete
 *   { type: "error", message }                - Error occurred
 *
 * Message types (Java -> Node):
 *   { type: "command", ... }                  - Initial query command
 *   { type: "response", id, allow, message?, updatedInput? } - Permission response
 */

import { createInterface } from 'readline';
import { homedir, platform } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// ============================================================================
// JSON Line Protocol
// ============================================================================

const send = (msg) => {
  try {
    console.log(JSON.stringify(msg));
  } catch (e) {
    console.log(JSON.stringify({ type: 'error', message: 'Failed to serialize message: ' + e.message }));
  }
};

const sendError = (message) => send({ type: 'error', message });

// ============================================================================
// Pending Response Management
// ============================================================================

const pendingResponses = new Map();
let responseId = 0;

function waitForResponse(id) {
  return new Promise((resolve) => {
    pendingResponses.set(id, resolve);
  });
}

// ============================================================================
// Stdin Line Reader
// ============================================================================

const rl = createInterface({
  input: process.stdin,
  terminal: false
});

// Handle incoming responses from Java
rl.on('line', (line) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line);

    // Handle permission responses
    if (msg.type === 'response' && pendingResponses.has(msg.id)) {
      const resolve = pendingResponses.get(msg.id);
      pendingResponses.delete(msg.id);
      resolve(msg);
    }
  } catch (e) {
    // Silently ignore parse errors for non-JSON lines (e.g., the initial command)
  }
});

// ============================================================================
// Authentication
// ============================================================================

function loadClaudeSettings() {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      return JSON.parse(readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

function readMacKeychainCredentials() {
  try {
    const serviceNames = ['Claude Code-credentials', 'Claude Code'];
    for (const serviceName of serviceNames) {
      try {
        const result = execSync(
          `security find-generic-password -s "${serviceName}" -w 2>/dev/null`,
          { encoding: 'utf8', timeout: 5000 }
        );
        if (result?.trim()) {
          return JSON.parse(result.trim());
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

function readFileCredentials() {
  try {
    const credentialsPath = join(homedir(), '.claude', '.credentials.json');
    if (existsSync(credentialsPath)) {
      return JSON.parse(readFileSync(credentialsPath, 'utf8'));
    }
  } catch {
    // Ignore
  }
  return null;
}

function setupAuthentication() {
  const settings = loadClaudeSettings();

  // Priority 1: ANTHROPIC_AUTH_TOKEN (Bearer auth)
  if (settings?.env?.ANTHROPIC_AUTH_TOKEN) {
    process.env.ANTHROPIC_AUTH_TOKEN = settings.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    return { authType: 'auth_token', source: 'settings.json' };
  }

  // Priority 2: ANTHROPIC_API_KEY (x-api-key auth)
  if (settings?.env?.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = settings.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    return { authType: 'api_key', source: 'settings.json' };
  }

  // Priority 3: AWS Bedrock
  if (settings?.env?.CLAUDE_CODE_USE_BEDROCK) {
    return { authType: 'aws_bedrock', source: 'settings.json' };
  }

  // Priority 4: CLI session (Keychain on macOS, file elsewhere)
  let credentials = null;
  if (platform() === 'darwin') {
    credentials = readMacKeychainCredentials() || readFileCredentials();
  } else {
    credentials = readFileCredentials();
  }

  if (credentials?.claudeAiOauth?.accessToken) {
    // Clear any API keys to let SDK use CLI session
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    return { authType: 'cli_session', source: platform() === 'darwin' ? 'Keychain' : 'credentials.json' };
  }

  // Set base URL if configured
  if (settings?.env?.ANTHROPIC_BASE_URL) {
    process.env.ANTHROPIC_BASE_URL = settings.env.ANTHROPIC_BASE_URL;
  }

  throw new Error('No authentication configured. Run "claude login" or set ANTHROPIC_API_KEY in ~/.claude/settings.json');
}

// ============================================================================
// Permission Handling (canUseTool callback)
// ============================================================================

// Read-only tools that can be auto-approved
const AUTO_ALLOW_TOOLS = new Set(['Read', 'Glob', 'Grep']);

// Tools that require user interaction (never auto-approve)
const INTERACTIVE_TOOLS = new Set(['AskUserQuestion']);

// Tools that can be auto-approved in acceptEdits mode
const ACCEPT_EDITS_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'CreateDirectory', 'MoveFile', 'CopyFile', 'Rename'
]);

async function canUseTool(toolName, toolInput, permissionMode) {
  // AskUserQuestion - special handling
  if (toolName === 'AskUserQuestion') {
    const id = ++responseId;
    send({
      type: 'ask_user_question',
      id,
      questions: toolInput.questions || []
    });

    const response = await waitForResponse(id);

    if (response.allow && response.answers) {
      return {
        behavior: 'allow',
        updatedInput: {
          questions: toolInput.questions || [],
          answers: response.answers
        }
      };
    }
    return { behavior: 'deny', message: response.message || 'User did not provide answers' };
  }

  // Auto-allow read-only tools
  if (AUTO_ALLOW_TOOLS.has(toolName)) {
    return { behavior: 'allow', updatedInput: toolInput };
  }

  // bypassPermissions mode - allow everything except interactive tools
  if (permissionMode === 'bypassPermissions') {
    return { behavior: 'allow', updatedInput: toolInput };
  }

  // acceptEdits mode - allow edit tools
  if (permissionMode === 'acceptEdits' && ACCEPT_EDITS_TOOLS.has(toolName)) {
    return { behavior: 'allow', updatedInput: toolInput };
  }

  // Request permission from Java
  const id = ++responseId;
  send({
    type: 'permission_request',
    id,
    toolName,
    toolInput
  });

  const response = await waitForResponse(id);

  if (response.allow) {
    return {
      behavior: 'allow',
      updatedInput: response.updatedInput || toolInput
    };
  }
  return { behavior: 'deny', message: response.message || `Permission denied for ${toolName}` };
}

// ============================================================================
// SDK Loading
// ============================================================================

async function loadClaudeSdk() {
  const errors = [];
  const SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

  // 1. Try standard import (works if in local node_modules or NODE_PATH)
  try {
    const sdk = await import(SDK_PACKAGE);
    return sdk;
  } catch (e) {
    errors.push(`${SDK_PACKAGE}: ${e.message}`);
  }

  // 2. Try loading from ~/.codemoss/dependencies/ (plugin's SDK directory)
  const sdkPath = join(homedir(), '.codemoss', 'dependencies', 'claude-sdk', 'node_modules', '@anthropic-ai', 'claude-agent-sdk');

  try {
    if (existsSync(sdkPath)) {
      const pkgJsonPath = join(sdkPath, 'package.json');
      if (existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        const entry = pkg.exports?.['.']?.import || pkg.exports?.import || pkg.module || pkg.main || 'sdk.mjs' || 'index.js';
        const entryPath = join(sdkPath, entry);
        if (existsSync(entryPath)) {
          const { pathToFileURL } = await import('url');
          const sdk = await import(pathToFileURL(entryPath).href);
          return sdk;
        }
      }
    }
  } catch (e) {
    errors.push(`${sdkPath}: ${e.message}`);
  }

  throw new Error(`Claude Agent SDK not installed. Tried:\n${errors.join('\n')}\n\nInstall with: npm install -g @anthropic-ai/claude-agent-sdk`);
}

// ============================================================================
// Main Query Execution
// ============================================================================

async function main() {
  try {
    // Wait for initial command from Java
    const initialLine = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for initial command')), 30000);

      rl.once('line', (line) => {
        clearTimeout(timeout);
        resolve(line);
      });
    });

    let input;
    try {
      input = JSON.parse(initialLine);
    } catch (e) {
      sendError('Invalid initial command JSON: ' + e.message);
      process.exit(1);
    }

    // Set up authentication
    setupAuthentication();

    // Load SDK
    const sdk = await loadClaudeSdk();
    const query = sdk.query;

    if (typeof query !== 'function') {
      sendError('Claude SDK query function not available');
      process.exit(1);
    }

    // Extract parameters
    const {
      message,
      sessionId,
      cwd,
      permissionMode = 'default',
      model,
      openedFiles,
      agentPrompt,
      streaming = false
    } = input;

    // Change to working directory
    const workingDirectory = cwd || process.cwd();
    try {
      process.chdir(workingDirectory);
    } catch {
      // Ignore if can't change directory
    }

    // Build system prompt append
    let systemPromptAppend = '';
    if (agentPrompt) {
      systemPromptAppend = agentPrompt;
    }
    if (openedFiles?.files?.length > 0) {
      const filesInfo = openedFiles.files.map(f => `- ${f.path}`).join('\n');
      systemPromptAppend += `\n\nCurrently open files in IDE:\n${filesInfo}`;
    }

    // Build query options
    const options = {
      cwd: workingDirectory,
      permissionMode: permissionMode === '' ? 'default' : permissionMode,
      model: model || undefined,
      maxTurns: 100,
      enableFileCheckpointing: true,
      ...(streaming && { includePartialMessages: true }),
      additionalDirectories: [workingDirectory].filter(Boolean),
      canUseTool: (toolName, toolInput) => canUseTool(toolName, toolInput, permissionMode),
      settingSources: ['user', 'project', 'local'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        ...(systemPromptAppend && { append: systemPromptAppend })
      }
    };

    // Resume session if provided
    if (sessionId && sessionId !== '') {
      options.resume = sessionId;
    }

    // Execute query
    const result = query({ prompt: message, options });

    // Stream events
    let currentSessionId = sessionId;

    for await (const msg of result) {
      // Handle stream events (for streaming mode)
      if (streaming && msg.type === 'stream_event') {
        const event = msg.event;
        if (event?.type === 'content_block_delta' && event.delta) {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            send({ type: 'content_delta', delta: event.delta.text });
          } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
            send({ type: 'thinking_delta', delta: event.delta.thinking });
          }
        }
        continue;
      }

      // Forward all messages as events
      send({ type: 'event', event: msg });

      // Extract specific message types for convenience
      if (msg.type === 'system' && msg.session_id) {
        currentSessionId = msg.session_id;
        send({ type: 'session_id', sessionId: msg.session_id });
      }

      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              send({ type: 'content', text: block.text });
            } else if (block.type === 'thinking') {
              send({ type: 'thinking', text: block.thinking || block.text });
            } else if (block.type === 'tool_use') {
              send({ type: 'tool_use', tool: block });
            }
          }
        }
      }

      if (msg.type === 'user') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              send({ type: 'tool_result', result: block });
            }
          }
        }
      }

      // Check for errors
      if (msg.type === 'result' && msg.is_error) {
        sendError(msg.result || 'Query failed');
      }
    }

    // Query complete
    send({ type: 'done', sessionId: currentSessionId });

  } catch (error) {
    sendError(error.message || String(error));
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((e) => {
  sendError('Unhandled error: ' + (e.message || String(e)));
  process.exit(1);
});
