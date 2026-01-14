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

    // 🔥 重要：不要使用 process.exit(0)，因为它会在 stdout 缓冲区刷新前终止进程
    // 导致大量 JSON 输出（如 getSession 返回的历史消息）被截断
    // 使用 process.exitCode 设置退出码，让进程自然退出，确保所有 I/O 完成
    process.exitCode = 0;

    // 🔥 对于 rewindFiles 命令，需要强制退出
    // 因为它会恢复 SDK 会话，会话的 MCP 连接可能保持打开状态，导致进程无法自然退出
    // rewindFiles 的输出很小，不会有截断问题
    if (command === 'rewindFiles') {
      // 给一点时间让 stdout 缓冲区刷新
      setTimeout(() => process.exit(0), 100);
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
