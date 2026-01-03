/**
 * Prompt Enhancement Service
 * Uses Claude Agent SDK to optimize and rewrite user prompts
 * Uses the same authentication method and configuration as normal conversations
 *
 * Supported context information:
 * - User selected code snippets
 * - Current open file info (path, content, language type)
 * - Cursor position and surrounding code
 * - Related file information
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { setupApiKey, loadClaudeSettings } from '../config/api-config.js';
import { mapModelIdToSdkName } from '../utils/model-utils.js';
import { homedir } from 'os';

// Context length limits (characters) to avoid exceeding model token limits
const MAX_SELECTED_CODE_LENGTH = 2000;      // Maximum selected code length
const MAX_CURSOR_CONTEXT_LENGTH = 1000;     // Maximum cursor context length
const MAX_CURRENT_FILE_LENGTH = 3000;       // Maximum current file content length
const MAX_RELATED_FILES_LENGTH = 2000;      // Related files total length limit
const MAX_SINGLE_RELATED_FILE_LENGTH = 500; // Single related file maximum length

/**
 * Read input from stdin
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Truncate text to specified length while maintaining integrity
 * @param {string} text - Original text
 * @param {number} maxLength - Maximum length
 * @param {boolean} fromEnd - Whether to truncate from end (default: from beginning)
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength, fromEnd = false) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  if (fromEnd) {
    return '...\n' + text.slice(-maxLength);
  }
  return text.slice(0, maxLength) + '\n...';
}

/**
 * Get language name from file extension
 * @param {string} filePath - File path
 * @returns {string} - Language name
 */
function getLanguageFromPath(filePath) {
  if (!filePath) return 'text';

  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'swift': 'swift',
    'scala': 'scala',
    'vue': 'vue',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
  };

  return langMap[ext] || 'text';
}

/**
 * Build complete prompt with context information
 * Integrates context by priority: selected code > cursor position > current file > related files
 *
 * @param {string} originalPrompt - Original prompt
 * @param {Object} context - Context information
 * @returns {string} - Built complete prompt
 */
function buildFullPrompt(originalPrompt, context) {
  let fullPrompt = `Please optimize the following prompt:\n\n${originalPrompt}`;

  // If no context information, return directly
  if (!context) {
    return fullPrompt;
  }

  const contextParts = [];

  // 1. Highest priority: User selected code
  if (context.selectedCode && context.selectedCode.trim()) {
    const truncatedCode = truncateText(context.selectedCode, MAX_SELECTED_CODE_LENGTH);
    const language = context.currentFile?.language || getLanguageFromPath(context.currentFile?.path) || 'text';
    contextParts.push(`【Selected Code】\n\`\`\`${language}\n${truncatedCode}\n\`\`\``);
  }

  // 2. Second priority: Cursor position context (only when no code is selected)
  if (!context.selectedCode && context.cursorContext && context.cursorContext.trim()) {
    const truncatedContext = truncateText(context.cursorContext, MAX_CURSOR_CONTEXT_LENGTH);
    const language = context.currentFile?.language || getLanguageFromPath(context.currentFile?.path) || 'text';
    const lineInfo = context.cursorPosition ? `(line ${context.cursorPosition.line})` : '';
    contextParts.push(`【Code Around Cursor ${lineInfo}】\n\`\`\`${language}\n${truncatedContext}\n\`\`\``);
  }

  // 3. Current file basic info (always included if available)
  if (context.currentFile) {
    const { path, language, content } = context.currentFile;
    let fileInfo = '';

    if (path) {
      const lang = language || getLanguageFromPath(path);
      fileInfo = `【Current File】${path}\n【Language】${lang}`;

      // If no selected code and cursor context, include partial file content
      if (!context.selectedCode && !context.cursorContext && content && content.trim()) {
        const truncatedContent = truncateText(content, MAX_CURRENT_FILE_LENGTH);
        fileInfo += `\n【File Content Preview】\n\`\`\`${lang}\n${truncatedContent}\n\`\`\``;
      }

      contextParts.push(fileInfo);
    }
  }

  // 4. Lowest priority: Related files info
  if (context.relatedFiles && Array.isArray(context.relatedFiles) && context.relatedFiles.length > 0) {
    let totalLength = 0;
    const relatedFilesInfo = [];

    for (const file of context.relatedFiles) {
      if (totalLength >= MAX_RELATED_FILES_LENGTH) {
        break;
      }

      if (file.path) {
        let fileEntry = `- ${file.path}`;
        if (file.content && file.content.trim()) {
          const remainingLength = MAX_RELATED_FILES_LENGTH - totalLength;
          const maxLength = Math.min(MAX_SINGLE_RELATED_FILE_LENGTH, remainingLength);
          const truncatedContent = truncateText(file.content, maxLength);
          const lang = getLanguageFromPath(file.path);
          fileEntry += `\n\`\`\`${lang}\n${truncatedContent}\n\`\`\``;
          totalLength += truncatedContent.length;
        }
        relatedFilesInfo.push(fileEntry);
      }
    }

    if (relatedFilesInfo.length > 0) {
      contextParts.push(`【Related Files】\n${relatedFilesInfo.join('\n')}`);
    }
  }

  // 5. Project type info
  if (context.projectType) {
    contextParts.push(`【Project Type】${context.projectType}`);
  }

  // Combine all context information
  if (contextParts.length > 0) {
    fullPrompt += '\n\n---\nHere is relevant context information for reference when optimizing the prompt:\n\n' + contextParts.join('\n\n');
  }

  return fullPrompt;
}

/**
 * Enhance prompt
 * @param {string} originalPrompt - Original prompt
 * @param {string} systemPrompt - System prompt
 * @param {string} model - Model to use (optional, frontend model ID)
 * @param {Object} context - Context information (optional)
 * @returns {Promise<string>} - Enhanced prompt
 */
async function enhancePrompt(originalPrompt, systemPrompt, model, context) {
  try {
    // Set environment variable (same as normal conversation)
    process.env.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts';

    // Setup API Key
    const config = setupApiKey();

    // Map model ID to SDK expected name
    const sdkModelName = mapModelIdToSdkName(model);

    // Use user home directory as working directory
    const workingDirectory = homedir();

    // Build complete prompt with context information
    const fullPrompt = buildFullPrompt(originalPrompt, context);

    // Prepare options
    // Note: Prompt optimization is simple task, no tool calls needed
    const options = {
      cwd: workingDirectory,
      permissionMode: 'bypassPermissions',  // Prompt enhancement doesn't need tool permissions
      model: sdkModelName,
      maxTurns: 1,  // Prompt optimization only needs single round, no tool calls
      systemPrompt: systemPrompt,
      settingSources: ['user', 'project', 'local'],
    };

    // Call query function
    const result = query({
      prompt: fullPrompt,
      options
    });

    // Collect response text
    let responseText = '';

    for await (const msg of result) {
      // Process assistant messages
      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        } else if (typeof content === 'string') {
          responseText += content;
        }
      }
    }

    if (responseText.trim()) {
      return responseText.trim();
    }

    throw new Error('AI response is empty');
  } catch (error) {
    console.error('[PromptEnhancer] Enhancement failed:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Read stdin input
    const input = await readStdin();
    const data = JSON.parse(input);

    const { prompt, systemPrompt, model, context } = data;

    if (!prompt) {
      console.log('[ENHANCED]');
      process.exit(0);
    }

    // Enhance prompt (pass context information)
    const enhancedPrompt = await enhancePrompt(prompt, systemPrompt, model, context);

    // Output result
    // Replace newlines with special marker to avoid Java readLine() only reading first line
    const encodedPrompt = enhancedPrompt.replace(/\n/g, '{{NEWLINE}}');
    console.log(`[ENHANCED]${encodedPrompt}`);
    process.exit(0);
  } catch (error) {
    console.error('[PromptEnhancer] Error:', error.message);
    console.log(`[ENHANCED]Enhancement failed: ${error.message}`);
    process.exit(1);
  }
}

main();
