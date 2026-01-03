#!/usr/bin/env node

/**
 * AI Bridge Channel Manager
 * Unified entry point for Claude and Codex SDK bridging
 *
 * Command format:
 *   node channel-manager.js <provider> <command> [args...]
 *
 * Provider:
 *   claude - Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
 *   codex  - Codex SDK (@openai/codex-sdk)
 *
 * Commands:
 *   send                - Send message (parameters via stdin JSON)
 *   sendWithAttachments - Send message with attachments (claude only)
 *   getSession          - Get session history messages (claude only)
 */

// Shared utilities
import { readStdinData } from './utils/stdin-utils.js';

// Claude services
let claudeSendMessage, claudeSendMessageWithAttachments, claudeGetSlashCommands, claudeGetMcpServerStatus, claudeGetSessionMessages;
try {
  const messageService = await import('./services/claude/message-service.js');
  claudeSendMessage = messageService.sendMessage;
  claudeSendMessageWithAttachments = messageService.sendMessageWithAttachments;
  claudeGetSlashCommands = messageService.getSlashCommands;
  claudeGetMcpServerStatus = messageService.getMcpServerStatus;

  const sessionService = await import('./services/claude/session-service.js');
  claudeGetSessionMessages = sessionService.getSessionMessages;
} catch (importError) {
  console.error('[STARTUP_ERROR] Module loading failed:', importError.message);
  if (importError.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('[STARTUP_ERROR] Dependencies missing - run: npm install');
  }
  console.log(JSON.stringify({
    success: false,
    error: 'Module loading failed: ' + importError.message
  }));
  process.exit(1);
}

// Command line argument parsing
const provider = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT_ERROR]', error.message);
  console.log(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
  console.log(JSON.stringify({
    success: false,
    error: String(reason)
  }));
  process.exit(1);
});

/**
 * Claude command handler
 */
async function handleClaudeCommand(command, args, stdinData) {
  switch (command) {
    case 'send': {
      if (stdinData && stdinData.message !== undefined) {
        const { message, sessionId, cwd, permissionMode, model, openedFiles, agentPrompt } = stdinData;
        await claudeSendMessage(message, sessionId || '', cwd || '', permissionMode || '', model || '', openedFiles || null, agentPrompt || null);
      } else {
        await claudeSendMessage(args[0], args[1], args[2], args[3], args[4]);
      }
      break;
    }

    case 'sendWithAttachments': {
      if (stdinData && stdinData.message !== undefined) {
        const { message, sessionId, cwd, permissionMode, model, attachments, openedFiles, agentPrompt } = stdinData;
        await claudeSendMessageWithAttachments(
          message,
          sessionId || '',
          cwd || '',
          permissionMode || '',
          model || '',
          attachments ? { attachments, openedFiles, agentPrompt } : { openedFiles, agentPrompt }
        );
      } else {
        await claudeSendMessageWithAttachments(args[0], args[1], args[2], args[3], args[4], stdinData);
      }
      break;
    }

    case 'getSession':
      await claudeGetSessionMessages(args[0], args[1]);
      break;

    case 'getSlashCommands': {
      const cwd = stdinData?.cwd || args[0] || null;
      await claudeGetSlashCommands(cwd);
      break;
    }

    case 'getMcpServerStatus': {
      const cwd = stdinData?.cwd || args[0] || null;
      await claudeGetMcpServerStatus(cwd);
      break;
    }

    default:
      throw new Error(`Unknown Claude command: ${command}`);
  }
}

/**
 * Codex command handler (temporarily disabled - SDK not installed)
 */
async function handleCodexCommand(command, args, stdinData) {
  throw new Error('Codex support is temporarily disabled. SDK not installed.');
}

// Execute command
(async () => {
  try {
    // Validate provider
    if (!provider || !['claude', 'codex'].includes(provider)) {
      console.error('Invalid provider. Use "claude" or "codex"');
      console.log(JSON.stringify({
        success: false,
        error: 'Invalid provider: ' + provider
      }));
      process.exit(1);
    }

    // Validate command
    if (!command) {
      console.error('No command specified');
      console.log(JSON.stringify({
        success: false,
        error: 'No command specified'
      }));
      process.exit(1);
    }

    // Read stdin data
    const stdinData = await readStdinData(provider);

    // Dispatch based on provider
    if (provider === 'claude') {
      await handleClaudeCommand(command, args, stdinData);
    } else if (provider === 'codex') {
      await handleCodexCommand(command, args, stdinData);
    }

  } catch (error) {
    console.error('[COMMAND_ERROR]', error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  }
})();
