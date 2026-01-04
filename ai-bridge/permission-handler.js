#!/usr/bin/env node

/**
 * Permission Handler
 * Provides interactive permission handling for Claude SDK
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

// Communication directory for permission requests
const PERMISSION_DIR = process.env.CLAUDE_PERMISSION_DIR
  ? process.env.CLAUDE_PERMISSION_DIR
  : join(tmpdir(), 'claude-permission');

// Ensure directory exists
try {
  mkdirSync(PERMISSION_DIR, { recursive: true });
} catch (e) {
  console.error('[PermissionHandler] Failed to create permission dir:', e.message);
}

const TEMP_PATH_PREFIXES = ['/tmp', '/var/tmp', '/private/tmp'];

function getProjectRoot() {
  return process.env.IDEA_PROJECT_PATH || process.env.PROJECT_PATH || process.cwd();
}

function rewriteToolInputPaths(toolName, input) {
  const projectRoot = getProjectRoot();
  if (!projectRoot || !input || typeof input !== 'object') {
    return { changed: false };
  }

  const prefixes = [...TEMP_PATH_PREFIXES];
  if (process.env.TMPDIR) {
    prefixes.push(process.env.TMPDIR);
  }

  const rewrites = [];

  const rewritePath = (pathValue) => {
    if (typeof pathValue !== 'string') return pathValue;
    const matchedPrefix = prefixes.find(prefix => prefix && pathValue.startsWith(prefix));
    if (!matchedPrefix) return pathValue;

    let relative = pathValue.slice(matchedPrefix.length).replace(/^\/+/, '');
    if (!relative) {
      relative = basename(pathValue);
    }
    const sanitized = join(projectRoot, relative);
    rewrites.push({ from: pathValue, to: sanitized });
    return sanitized;
  };

  const traverse = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (typeof value === 'object') {
      if (typeof value.file_path === 'string') {
        value.file_path = rewritePath(value.file_path);
      }
      for (const key of Object.keys(value)) {
        const child = value[key];
        if (child && typeof child === 'object') {
          traverse(child);
        }
      }
    }
  };

  traverse(input);

  return { changed: rewrites.length > 0 };
}

/**
 * Request permission from Java process via filesystem communication
 * @param {string} toolName - Tool name
 * @param {Object} input - Tool parameters
 * @returns {Promise<boolean>} - Whether allowed
 */
export async function requestPermissionFromJava(toolName, input) {
  const requestStartTime = Date.now();

  try {
    // Reject obviously dangerous operations
    const userHomeDir = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
    const dangerousPatterns = [
      '/etc/',
      '/System/',
      '/usr/',
      '/bin/',
      `${userHomeDir}/.ssh/`,
      `${userHomeDir}/.aws/`
    ];

    // Check if file path contains dangerous patterns
    if (input.file_path || input.path) {
      const path = input.file_path || input.path;
      for (const pattern of dangerousPatterns) {
        if (path.includes(pattern)) {
          console.warn('[PermissionHandler] Dangerous path detected, denying:', path);
          return false;
        }
      }
    }

    // Generate request ID
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create request file
    const requestFile = join(PERMISSION_DIR, `request-${requestId}.json`);
    const responseFile = join(PERMISSION_DIR, `response-${requestId}.json`);

    const requestData = {
      requestId,
      toolName,
      inputs: input,
      timestamp: new Date().toISOString()
    };

    try {
      writeFileSync(requestFile, JSON.stringify(requestData, null, 2));
    } catch (writeError) {
      console.error('[PermissionHandler] Failed to write request file:', writeError.message);
      return false;
    }

    // Wait for response file (max 60 seconds) - slightly longer than IDE frontend timeout
    const timeout = 60000;
    const pollInterval = 100;

    while (Date.now() - requestStartTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      if (existsSync(responseFile)) {
        try {
          const responseContent = readFileSync(responseFile, 'utf-8');
          const responseData = JSON.parse(responseContent);
          const result = responseData.allow;

          // Clean up response file
          try {
            unlinkSync(responseFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          return result;
        } catch (e) {
          console.error('[PermissionHandler] Error reading response:', e.message);
          return false;
        }
      }
    }

    // Timeout - deny by default
    console.warn('[PermissionHandler] Timeout waiting for response');
    return false;

  } catch (error) {
    console.error('[PermissionHandler] Unexpected error:', error.message);
    return false;
  }
}

/**
 * Request user answers for AskUserQuestion tool via filesystem communication
 * @param {Object} input - AskUserQuestion tool parameters (questions array)
 * @returns {Promise<Object|null>} - Answers object or null on failure/timeout
 */
export async function requestAskUserQuestionAnswers(input) {
  const requestStartTime = Date.now();

  try {
    // Generate request ID
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create request file (different prefix from permission requests)
    const requestFile = join(PERMISSION_DIR, `ask-user-question-${requestId}.json`);
    const responseFile = join(PERMISSION_DIR, `ask-user-question-response-${requestId}.json`);

    const requestData = {
      requestId,
      questions: input.questions,
      timestamp: new Date().toISOString()
    };

    try {
      writeFileSync(requestFile, JSON.stringify(requestData, null, 2));
    } catch (writeError) {
      console.error('[PermissionHandler] Failed to write ask-user-question request file:', writeError.message);
      return null;
    }

    // Wait for response file (max 60 seconds)
    const timeout = 60000;
    const pollInterval = 100;

    while (Date.now() - requestStartTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      if (existsSync(responseFile)) {
        try {
          const responseContent = readFileSync(responseFile, 'utf-8');
          const responseData = JSON.parse(responseContent);

          // Clean up response file
          try {
            unlinkSync(responseFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          // Return the answers object if user submitted, null if cancelled
          if (responseData.cancelled) {
            return null;
          }
          return responseData.answers || null;
        } catch (e) {
          console.error('[PermissionHandler] Error reading ask-user-question response:', e.message);
          return null;
        }
      }
    }

    // Timeout
    console.warn('[PermissionHandler] Timeout waiting for ask-user-question response');
    return null;

  } catch (error) {
    console.error('[PermissionHandler] Unexpected error in requestAskUserQuestionAnswers:', error.message);
    return null;
  }
}

/**
 * canUseTool callback function for Claude SDK
 * Signature: (toolName, input, options) => Promise<PermissionResult>
 * Expected return format: { behavior: 'allow' | 'deny', updatedInput?: object, message?: string }
 */
export async function canUseTool(toolName, input, options = {}) {
  // Rewrite /tmp paths to project root directory
  rewriteToolInputPaths(toolName, input);

  // Deny if no tool name provided
  if (!toolName) {
    return {
      behavior: 'deny',
      message: 'Tool name is required'
    };
  }

  // Auto-allow read-only tools
  const autoAllowedTools = ['Read', 'Glob', 'Grep'];
  if (autoAllowedTools.includes(toolName)) {
    return {
      behavior: 'allow',
      updatedInput: input
    };
  }

  // Special handling for AskUserQuestion tool
  if (toolName === 'AskUserQuestion') {
    const answers = await requestAskUserQuestionAnswers(input);
    if (answers) {
      // Return with updated input containing the answers
      return {
        behavior: 'allow',
        updatedInput: {
          questions: input.questions,
          answers: answers
        }
      };
    } else {
      return {
        behavior: 'deny',
        message: 'User cancelled or timed out on AskUserQuestion dialog'
      };
    }
  }

  // Other tools need permission
  const allowed = await requestPermissionFromJava(toolName, input);

  if (allowed) {
    return {
      behavior: 'allow',
      updatedInput: input
    };
  } else {
    return {
      behavior: 'deny',
      message: `User denied permission for ${toolName} tool`
    };
  }
}
