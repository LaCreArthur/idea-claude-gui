import { useMemo, useCallback } from 'react';
import type { RewindableMessage } from './useRewindDialog';
import type { ClaudeMessage, ToolResultBlock } from '../types';
import { getMessageText, shouldShowMessage, normalizeBlocks, getContentBlocks } from '../utils/messageUtils';
import { formatTime } from '../utils/helpers';
import type { ClaudeRawMessage } from '../types';

interface UseRewindLogicOptions {
  messages: ClaudeMessage[];
  currentProvider: string;
  currentSessionId: string | null;
  openRewindDialog: (request: {
    sessionId: string;
    userMessageId: string;
    messageContent: string;
    messageTimestamp?: string;
    messagesAfterCount: number;
  }) => void;
  handleRewindSelectCancel: () => void;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

interface UseRewindLogicReturn {
  mergedMessages: ClaudeMessage[];
  rewindableMessages: RewindableMessage[];
  canRewindFromMessageIndex: (userMessageIndex: number) => boolean;
  prepareRewindRequest: (messageIndex: number, message: ClaudeMessage) => void;
  handleRewindSelect: (item: RewindableMessage) => void;
  findToolResult: (toolUseId?: string, messageIndex?: number) => ToolResultBlock | null;
  sessionTitle: string;
}

export function useRewindLogic({
  messages,
  currentProvider,
  currentSessionId,
  openRewindDialog,
  handleRewindSelectCancel,
  addToast,
}: UseRewindLogicOptions): UseRewindLogicReturn {
  const mergedMessages = useMemo(() => {
    const visible = messages.filter(shouldShowMessage);
    if (visible.length === 0) return [];

    const result: ClaudeMessage[] = [];
    let current: ClaudeMessage | null = null;

    for (const msg of visible) {
      if (!current) {
        current = msg;
        continue;
      }

      if (current.type === 'assistant' && msg.type === 'assistant') {
        const blocks1 = normalizeBlocks(current.raw) || [];
        const blocks2 = normalizeBlocks(msg.raw) || [];
        const combinedBlocks = [...blocks1, ...blocks2];

        const newRaw: ClaudeRawMessage = {
          ...(typeof current.raw === 'object' ? current.raw : {}),
          content: combinedBlocks
        };

        if (newRaw.message && newRaw.message.content) {
            newRaw.message.content = combinedBlocks;
        }

        const content1: string = current.content || '';
        const content2: string = msg.content || '';
        const newContent: string = (content1 && content2) ? `${content1}\n${content2}` : (content1 || content2);

        current = {
          ...current,
          content: newContent,
          raw: newRaw,
        };
      } else {
        result.push(current);
        current = msg;
      }
    }
    if (current) result.push(current);
    return result;
  }, [messages]);

  const canRewindFromMessageIndex = useCallback((userMessageIndex: number) => {
    if (userMessageIndex < 0 || userMessageIndex >= mergedMessages.length) {
      return false;
    }

    const current = mergedMessages[userMessageIndex];
    if (current.type !== 'user') return false;
    if ((current.content || '').trim() === '[tool_result]') return false;
    const raw = current.raw;
    if (raw && typeof raw !== 'string') {
      const content = (raw as any).content ?? (raw as any).message?.content;
      if (Array.isArray(content) && content.some((block: any) => block && block.type === 'tool_result')) {
        return false;
      }
    }

    for (let i = userMessageIndex + 1; i < mergedMessages.length; i += 1) {
      const msg = mergedMessages[i];
      if (msg.type === 'user') {
        break;
      }
      const blocks = getContentBlocks(msg);
      for (const block of blocks) {
        if (block.type !== 'tool_use') {
          continue;
        }
        const toolName = (block.name ?? '').toLowerCase();
        if (['write', 'edit', 'edit_file', 'replace_string', 'write_to_file', 'notebookedit', 'create_file'].includes(toolName)) {
          return true;
        }
      }
    }

    return false;
  }, [mergedMessages]);

  const rewindableMessages = useMemo((): RewindableMessage[] => {
    if (currentProvider !== 'claude') {
      return [];
    }

    const result: RewindableMessage[] = [];

    for (let i = 0; i < mergedMessages.length - 1; i++) {
      if (!canRewindFromMessageIndex(i)) {
        continue;
      }

      const message = mergedMessages[i];
      const content = message.content || getMessageText(message);
      const timestamp = message.timestamp ? formatTime(message.timestamp) : undefined;
      const messagesAfterCount = mergedMessages.length - i - 1;

      result.push({
        messageIndex: i,
        message,
        displayContent: content,
        timestamp,
        messagesAfterCount,
      });
    }

    return result;
  }, [mergedMessages, currentProvider, canRewindFromMessageIndex]);

  const isToolResultOnlyUserMessage = useCallback((msg: ClaudeMessage) => {
    if (msg.type !== 'user') return false;
    if ((msg.content || '').trim() === '[tool_result]') return true;
    const raw = msg.raw;
    if (!raw || typeof raw === 'string') return false;
    const content = (raw as any).content ?? (raw as any).message?.content;
    if (!Array.isArray(content)) return false;
    return content.some((block: any) => block && block.type === 'tool_result');
  }, []);

  const prepareRewindRequest = useCallback((messageIndex: number, message: ClaudeMessage) => {
    if (!currentSessionId) {
      addToast('Rewind not available for this session', 'warning');
      return;
    }

    let targetIndex = messageIndex;
    let targetMessage: ClaudeMessage = message;
    if (isToolResultOnlyUserMessage(message)) {
      for (let i = messageIndex - 1; i >= 0; i -= 1) {
        const candidate = mergedMessages[i];
        if (candidate.type !== 'user') continue;
        if (isToolResultOnlyUserMessage(candidate)) continue;
        targetIndex = i;
        targetMessage = candidate;
        break;
      }
    }

    const raw = targetMessage.raw;
    const uuid = typeof raw === 'object' ? (raw as any)?.uuid : undefined;
    if (!uuid) {
      addToast('Rewind not available for this session', 'warning');
      console.warn('[Rewind] No UUID found in message:', targetMessage);
      return;
    }

    const messagesAfterCount = mergedMessages.length - targetIndex - 1;

    const content = targetMessage.content || getMessageText(targetMessage);
    const timestamp = targetMessage.timestamp ? formatTime(targetMessage.timestamp) : undefined;

    openRewindDialog({
      sessionId: currentSessionId,
      userMessageId: uuid,
      messageContent: content,
      messageTimestamp: timestamp,
      messagesAfterCount,
    });
  }, [currentSessionId, mergedMessages, addToast, openRewindDialog, isToolResultOnlyUserMessage]);

  const handleRewindSelect = useCallback((item: RewindableMessage) => {
    handleRewindSelectCancel();
    prepareRewindRequest(item.messageIndex, item.message);
  }, [handleRewindSelectCancel, prepareRewindRequest]);

  const findToolResult = useCallback((toolUseId?: string, messageIndex?: number): ToolResultBlock | null => {
    if (!toolUseId || typeof messageIndex !== 'number') {
      return null;
    }

    for (let i = 0; i < messages.length; i += 1) {
      const candidate = messages[i];
      const raw = candidate.raw;

      if (!raw || typeof raw === 'string') {
        continue;
      }
      const content = raw.content ?? raw.message?.content;

      if (!Array.isArray(content)) {
        continue;
      }

      const resultBlock = content.find(
        (block): block is ToolResultBlock =>
          Boolean(block) && block.type === 'tool_result' && block.tool_use_id === toolUseId,
      );
      if (resultBlock) {
        return resultBlock;
      }
    }

    return null;
  }, [messages]);

  const sessionTitle = useMemo(() => {
    if (messages.length === 0) {
      return 'New Session';
    }
    const firstUserMessage = messages.find((message) => message.type === 'user');
    if (!firstUserMessage) {
      return 'New Session';
    }
    const text = getMessageText(firstUserMessage);
    return text.length > 15 ? `${text.substring(0, 15)}...` : text;
  }, [messages]);

  return {
    mergedMessages,
    rewindableMessages,
    canRewindFromMessageIndex,
    prepareRewindRequest,
    handleRewindSelect,
    findToolResult,
    sessionTitle,
  };
}
