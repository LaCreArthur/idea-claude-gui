/**
 * Message processing utilities for App.tsx
 * Extracts text content and normalizes message blocks for display
 */

import type { ClaudeMessage, ClaudeRawMessage, ClaudeContentBlock } from '../types';

/**
 * Identity function for message text (i18n removed - English only)
 */
export const localizeMessage = (text: string): string => text;

/**
 * Extract displayable text from a ClaudeMessage
 */
export const getMessageText = (message: ClaudeMessage): string => {
  let text = '';

  if (message.content) {
    text = message.content;
  } else {
    const raw = message.raw;
    if (!raw) {
      return '(Empty message)';
    }
    if (typeof raw === 'string') {
      text = raw;
    } else if (typeof raw.content === 'string') {
      text = raw.content;
    } else if (Array.isArray(raw.content)) {
      text = raw.content
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
    } else if (raw.message?.content && Array.isArray(raw.message.content)) {
      text = raw.message.content
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
    } else {
      return '(Empty message)';
    }
  }

  return localizeMessage(text);
};

/**
 * Normalize raw message data into an array of content blocks
 */
export const normalizeBlocks = (raw?: ClaudeRawMessage | string): ClaudeContentBlock[] | null => {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'string') {
    return [{ type: 'text' as const, text: raw }];
  }

  const buildBlocksFromArray = (entries: unknown[]): ClaudeContentBlock[] => {
    const blocks: ClaudeContentBlock[] = [];
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const candidate = entry as Record<string, unknown>;
      const type = candidate.type as string | undefined;
      if (type === 'text') {
        const rawText = typeof candidate.text === 'string' ? candidate.text : '';
        // Skip placeholder text "(no content)"
        if (rawText.trim() === '(no content)') {
          return;
        }
        blocks.push({
          type: 'text',
          text: localizeMessage(rawText),
        });
      } else if (type === 'thinking') {
        const thinking =
          typeof candidate.thinking === 'string'
            ? (candidate.thinking as string)
            : typeof candidate.text === 'string'
              ? (candidate.text as string)
              : '';
        blocks.push({
          type: 'thinking',
          thinking,
          text: thinking,
        });
      } else if (type === 'tool_use') {
        blocks.push({
          type: 'tool_use',
          id: typeof candidate.id === 'string' ? (candidate.id as string) : undefined,
          name: typeof candidate.name === 'string' ? (candidate.name as string) : 'Unknown tool',
          input: (candidate.input as Record<string, unknown>) ?? {},
        });
      } else if (type === 'image') {
        const source = (candidate as any).source;
        let src: string | undefined;
        let mediaType: string | undefined;

        // Support two formats:
        // 1. Backend/history format: { type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }
        // 2. Frontend direct format: { type: 'image', src: 'data:...', mediaType: '...' }
        if (source && typeof source === 'object') {
          const st = source.type;
          if (st === 'base64' && typeof source.data === 'string') {
            const mt = typeof source.media_type === 'string' ? source.media_type : 'image/png';
            src = `data:${mt};base64,${source.data}`;
            mediaType = mt;
          } else if (st === 'url' && typeof source.url === 'string') {
            src = source.url;
            mediaType = source.media_type;
          }
        } else if (typeof candidate.src === 'string') {
          // Frontend direct format
          src = candidate.src as string;
          mediaType = candidate.mediaType as string | undefined;
        }

        if (src) {
          blocks.push({ type: 'image', src, mediaType });
        }
      }
    });
    return blocks;
  };

  const pickContent = (content: unknown): ClaudeContentBlock[] | null => {
    if (!content) {
      return null;
    }
    if (typeof content === 'string') {
      // Filter empty strings and command messages
      if (!content.trim() ||
          content.includes('<command-name>') ||
          content.includes('<local-command-stdout>')) {
        return null;
      }
      return [{ type: 'text' as const, text: localizeMessage(content) }];
    }
    if (Array.isArray(content)) {
      const result = buildBlocksFromArray(content);
      return result.length ? result : null;
    }
    return null;
  };

  const contentBlocks = pickContent(raw.message?.content ?? raw.content);

  // If content parsing fails, try other fields
  if (!contentBlocks) {
    if (typeof raw === 'object') {
      if ('text' in raw && typeof raw.text === 'string' && raw.text.trim()) {
        return [{ type: 'text' as const, text: localizeMessage(raw.text) }];
      }
      // Return null instead of error message - shouldShowMessage will filter this
    }
    return null;
  }

  return contentBlocks;
};

/**
 * Determine if a message should be displayed in the chat
 */
export const shouldShowMessage = (message: ClaudeMessage): boolean => {
  // Filter isMeta messages (e.g., "Caveat: The messages below were generated...")
  if (message.raw && typeof message.raw === 'object' && 'isMeta' in message.raw && message.raw.isMeta === true) {
    return false;
  }

  // Filter command messages (containing <command-name> or <local-command-stdout> tags)
  const text = getMessageText(message);
  if (text && (
    text.includes('<command-name>') ||
    text.includes('<local-command-stdout>') ||
    text.includes('<local-command-stderr>') ||
    text.includes('<command-message>') ||
    text.includes('<command-args>')
  )) {
    return false;
  }
  if (message.type === 'user' && text === '[tool_result]') {
    return false;
  }
  if (message.type === 'assistant') {
    return true;
  }
  if (message.type === 'user' || message.type === 'error') {
    // Check for valid text content
    if (text && text.trim() && text !== '(Empty message)' && text !== '(Failed to parse content)') {
      return true;
    }
    // Check for valid content blocks (like images)
    const rawBlocks = normalizeBlocks(message.raw);
    if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
      // Ensure at least one non-empty content block exists
      const hasValidBlock = rawBlocks.some(block => {
        if (block.type === 'text') {
          return block.text && block.text.trim().length > 0;
        }
        // Images, tool_use, and other block types should be shown
        return true;
      });
      return hasValidBlock;
    }
    return false;
  }
  return true;
};

/**
 * Get content blocks for rendering a message
 */
export const getContentBlocks = (message: ClaudeMessage): ClaudeContentBlock[] => {
  const rawBlocks = normalizeBlocks(message.raw);
  if (rawBlocks && rawBlocks.length > 0) {
    // Streaming/tool case: if raw has no text but message.content has text, still show it
    const hasTextBlock = rawBlocks.some(
      (block) => block.type === 'text' && typeof (block as any).text === 'string' && String((block as any).text).trim().length > 0,
    );
    if (!hasTextBlock && message.content && message.content.trim()) {
      return [...rawBlocks, { type: 'text', text: localizeMessage(message.content) }];
    }
    return rawBlocks;
  }
  if (message.content && message.content.trim()) {
    return [{ type: 'text', text: localizeMessage(message.content) }];
  }
  // Return empty array if no content - shouldShowMessage will filter these
  return [];
};
