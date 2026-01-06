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
import { handleClaudeCommand } from './channels/claude-channel.js';
import { handleCodexCommand } from './channels/codex-channel.js';

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

const providerHandlers = {
  claude: handleClaudeCommand,
  codex: handleCodexCommand
};

// Execute command
(async () => {
  try {
    // Validate provider
    if (!provider || !providerHandlers[provider]) {
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
    const handler = providerHandlers[provider];
    await handler(command, args, stdinData);

  } catch (error) {
    console.error('[COMMAND_ERROR]', error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  }
})();
