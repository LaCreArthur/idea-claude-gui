import type { ClaudeMessage } from '../types';

export const findLastAssistantIndex = (list: ClaudeMessage[]): number => {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.type === 'assistant') return i;
  }
  return -1;
};

export const extractRawBlocks = (raw: unknown): any[] => {
  if (!raw || typeof raw !== 'object') return [];
  const rawObj = raw as Record<string, unknown>;
  const messageContent = rawObj.message as Record<string, unknown> | undefined;
  const blocks = rawObj.content ?? messageContent?.content;
  return Array.isArray(blocks) ? blocks : [];
};

export interface StreamingRefs {
  streamingTextSegmentsRef: React.MutableRefObject<string[]>;
  streamingThinkingSegmentsRef: React.MutableRefObject<string[]>;
  streamingContentRef: React.MutableRefObject<string>;
  streamingMessageIndexRef: React.MutableRefObject<number>;
}

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
      const normalizedThinking = thinking
        .replace(/\r\n?/g, '\n')
        .replace(/\n[ \t]*\n+/g, '\n')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '');
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
