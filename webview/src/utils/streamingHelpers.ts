import type { ClaudeMessage } from '../types';

/**
 * Find the index of the last assistant message in the list.
 * Returns -1 if not found.
 */
export const findLastAssistantIndex = (list: ClaudeMessage[]): number => {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.type === 'assistant') return i;
  }
  return -1;
};

/**
 * Extract content blocks from a raw message object.
 * Handles both formats: raw.content and raw.message.content
 */
export const extractRawBlocks = (raw: unknown): any[] => {
  if (!raw || typeof raw !== 'object') return [];
  const rawObj = raw as Record<string, unknown>;
  const messageContent = rawObj.message as Record<string, unknown> | undefined;
  const blocks = rawObj.content ?? messageContent?.content;
  return Array.isArray(blocks) ? blocks : [];
};

/**
 * Refs container for streaming state - passed to functions that need access
 */
export interface StreamingRefs {
  streamingTextSegmentsRef: React.MutableRefObject<string[]>;
  streamingThinkingSegmentsRef: React.MutableRefObject<string[]>;
  streamingContentRef: React.MutableRefObject<string>;
  streamingMessageIndexRef: React.MutableRefObject<number>;
}

/**
 * Build streaming blocks from segments.
 * Interleaves thinking and text segments with tool_use blocks.
 */
export const buildStreamingBlocks = (
  existingBlocks: any[],
  refs: Pick<StreamingRefs, 'streamingTextSegmentsRef' | 'streamingThinkingSegmentsRef'>
): any[] => {
  const toolUseBlocks = existingBlocks.filter((b) => b?.type === 'tool_use');
  const otherBlocks = existingBlocks.filter(
    (b) => b && b.type !== 'text' && b.type !== 'thinking' && b.type !== 'tool_use',
  );

  const textSegments = refs.streamingTextSegmentsRef.current;
  const thinkingSegments = refs.streamingThinkingSegmentsRef.current;
  const phasesCount = Math.max(textSegments.length, thinkingSegments.length, toolUseBlocks.length + 1);

  const blocks: any[] = [];
  for (let phase = 0; phase < phasesCount; phase += 1) {
    const thinking = thinkingSegments[phase];
    if (typeof thinking === 'string' && thinking.length > 0) {
      // Clean up newlines: merge consecutive blank lines, trim whitespace
      const normalizedThinking = thinking
        .replace(/\r\n?/g, '\n')          // Normalize line endings
        .replace(/\n[ \t]*\n+/g, '\n')    // Remove blank lines (including whitespace-only)
        .replace(/^\n+/, '')              // Trim leading newlines
        .replace(/\n+$/, '');             // Trim trailing newlines
      if (normalizedThinking.length > 0) {
        blocks.push({ type: 'thinking', thinking: normalizedThinking });
      }
    }
    const text = textSegments[phase];
    if (typeof text === 'string' && text.length > 0) {
      blocks.push({ type: 'text', text });
    }
    if (phase < toolUseBlocks.length) {
      blocks.push(toolUseBlocks[phase]);
    }
  }

  if (otherBlocks.length > 0) {
    blocks.push(...otherBlocks);
  }
  return blocks;
};

/**
 * Get the current streaming assistant message index, or create a new one if needed.
 * Mutates the list by appending a placeholder assistant message if none exists.
 */
export const getOrCreateStreamingAssistantIndex = (
  list: ClaudeMessage[],
  refs: Pick<StreamingRefs, 'streamingMessageIndexRef'>
): number => {
  const currentIdx = refs.streamingMessageIndexRef.current;
  if (currentIdx >= 0 && currentIdx < list.length && list[currentIdx]?.type === 'assistant') {
    return currentIdx;
  }
  const lastAssistantIdx = findLastAssistantIndex(list);
  if (lastAssistantIdx >= 0) {
    refs.streamingMessageIndexRef.current = lastAssistantIdx;
    return lastAssistantIdx;
  }
  // No assistant found: append a placeholder
  refs.streamingMessageIndexRef.current = list.length;
  list.push({
    type: 'assistant',
    content: '',
    isStreaming: true,
    timestamp: new Date().toISOString(),
    raw: { message: { content: [] } } as unknown,
  } as ClaudeMessage);
  return refs.streamingMessageIndexRef.current;
};

/**
 * Patch an assistant message for streaming by rebuilding its content blocks.
 */
export const patchAssistantForStreaming = (
  assistant: ClaudeMessage,
  refs: StreamingRefs
): ClaudeMessage => {
  const existingRaw = (assistant.raw && typeof assistant.raw === 'object')
    ? (assistant.raw as Record<string, unknown>)
    : { message: { content: [] } };
  const existingBlocks = extractRawBlocks(existingRaw);
  const newBlocks = buildStreamingBlocks(existingBlocks, refs);

  const messageObj = existingRaw.message as Record<string, unknown> | undefined;
  const rawPatched = messageObj
    ? { ...existingRaw, message: { ...messageObj, content: newBlocks } }
    : { ...existingRaw, content: newBlocks };

  return {
    ...assistant,
    content: refs.streamingContentRef.current,
    raw: rawPatched,
    isStreaming: true,
  } as ClaudeMessage;
};
