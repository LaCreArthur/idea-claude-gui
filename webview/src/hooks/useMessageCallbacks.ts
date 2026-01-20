import { useEffect, type RefObject } from 'react';
import type { ClaudeMessage, HistoryData } from '../types';
import type { PermissionRequest } from '../components/PermissionDialog';
import type { AskUserQuestionRequest } from '../components/AskUserQuestionDialog';
import { isTruthy } from '../utils/helpers';
import {
  findLastAssistantIndex,
  extractRawBlocks,
  getOrCreateStreamingAssistantIndex,
  patchAssistantForStreaming,
  type StreamingRefs,
} from '../utils/streamingHelpers';
import {
  setupSlashCommandsCallback,
  resetSlashCommandsState,
  resetFileReferenceState,
} from '../components/ChatInputBox/providers';
import type { SelectedAgent } from '../components/ChatInputBox/types';
import type { ToastMessage } from '../components/Toast';

interface UseMessageCallbacksParams {
  // Streaming refs
  streamingContentRef: RefObject<string>;
  isStreamingRef: RefObject<boolean>;
  useBackendStreamingRenderRef: RefObject<boolean>;
  streamingTextSegmentsRef: RefObject<string[]>;
  activeTextSegmentIndexRef: RefObject<number>;
  streamingThinkingSegmentsRef: RefObject<string[]>;
  activeThinkingSegmentIndexRef: RefObject<number>;
  seenToolUseCountRef: RefObject<number>;
  streamingMessageIndexRef: RefObject<number>;

  // Other refs
  suppressNextStatusToastRef: RefObject<boolean>;
  isUserAtBottomRef: RefObject<boolean>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;

  // Setters
  setMessages: React.Dispatch<React.SetStateAction<ClaudeMessage[]>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingStartTime: React.Dispatch<React.SetStateAction<number | null>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setHistoryData: React.Dispatch<React.SetStateAction<HistoryData | null>>;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setContextInfo: React.Dispatch<React.SetStateAction<{ file: string; startLine?: number; endLine?: number; raw: string } | null>>;
  setSelectedAgent: React.Dispatch<React.SetStateAction<SelectedAgent | null>>;

  // Queue handlers for dialogs
  queuePermissionRequest: (request: PermissionRequest) => void;
  queueAskUserQuestionRequest: (request: AskUserQuestionRequest) => void;

  // Toast helper
  addToast: (message: string, type?: ToastMessage['type']) => void;
}

/**
 * Hook that sets up all window.* message callbacks from the Java bridge.
 *
 * This includes:
 * - Message state callbacks (updateMessages, updateStatus, showLoading, etc.)
 * - Session callbacks (setSessionId, addHistoryMessage, addUserMessage)
 * - Toast/Export callbacks (addToast, onExportSessionData)
 * - Dialog callbacks (showPermissionDialog, showAskUserQuestionDialog)
 * - Context callbacks (addSelectionInfo, addCodeSnippet, clearSelectionInfo)
 * - Agent callbacks (onSelectedAgentReceived, onSelectedAgentChanged)
 * - Slash command initialization
 */
export function useMessageCallbacks({
  streamingContentRef,
  isStreamingRef,
  useBackendStreamingRenderRef,
  streamingTextSegmentsRef,
  activeTextSegmentIndexRef,
  streamingThinkingSegmentsRef,
  activeThinkingSegmentIndexRef,
  seenToolUseCountRef,
  streamingMessageIndexRef,
  suppressNextStatusToastRef,
  isUserAtBottomRef,
  messagesContainerRef,
  setMessages,
  setStatus,
  setLoading,
  setLoadingStartTime,
  setIsThinking,
  setHistoryData,
  setCurrentSessionId,
  setContextInfo,
  setSelectedAgent,
  queuePermissionRequest,
  queueAskUserQuestionRequest,
  addToast,
}: UseMessageCallbacksParams): void {
  useEffect(() => {
    // Create refs object to pass to streaming helper functions
    const streamingRefs: StreamingRefs = {
    streamingTextSegmentsRef,
    streamingThinkingSegmentsRef,
    streamingContentRef,
    streamingMessageIndexRef,
  };

  // === Message State Callbacks ===

  window.updateMessages = (json) => {
    try {
      const parsed = JSON.parse(json) as ClaudeMessage[];

      setMessages((prev) => {
        if (!isStreamingRef.current) {
          return parsed;
        }

        if (useBackendStreamingRenderRef.current) {
          return parsed;
        }

        const lastAssistantIdx = findLastAssistantIndex(parsed);
        if (lastAssistantIdx < 0) {
          return parsed;
        }

        const lastAssistant = parsed[lastAssistantIdx];
        const lastAssistantBlocks = extractRawBlocks(lastAssistant.raw);
        const toolUseCount = lastAssistantBlocks.filter((b) => b?.type === 'tool_use').length;
        if (toolUseCount < seenToolUseCountRef.current) {
          seenToolUseCountRef.current = toolUseCount;
        }
        const hasNewToolUse = toolUseCount > seenToolUseCountRef.current;
        const hasToolUse = toolUseCount > 0;

        // Tool use is a "phase" boundary: subsequent text/thinking should enter new segments
        if (hasNewToolUse) {
          seenToolUseCountRef.current = toolUseCount;
          activeTextSegmentIndexRef.current = -1;
          activeThinkingSegmentIndexRef.current = -1;
        }

        // During streaming: only skip when "no new messages and last is assistant without tool_use"
        const isAssistantOnlyRefresh =
          parsed.length === prev.length &&
          parsed[parsed.length - 1]?.type === 'assistant' &&
          !hasToolUse;
        if (isAssistantOnlyRefresh) {
          return prev;
        }

        const patched = [...parsed];
        const targetIdx = getOrCreateStreamingAssistantIndex(patched, streamingRefs);
        if (targetIdx >= 0 && patched[targetIdx]?.type === 'assistant') {
          patched[targetIdx] = patchAssistantForStreaming(patched[targetIdx], streamingRefs);
        }
        return patched;
      });
    } catch (error) {
      console.error('[Frontend] Failed to parse messages:', error);
      console.error('[Frontend] Raw JSON:', json?.substring(0, 500));
    }
  };

  window.updateStatus = (text) => {
    setStatus(text);
    // Check if toast should be suppressed (delete current session then auto-create new scenario)
    if (suppressNextStatusToastRef.current) {
      suppressNextStatusToastRef.current = false;
      return;
    }
    // Show toast notification for status changes
    addToast(text);
  };

  window.showLoading = (value) => {
    const isLoading = isTruthy(value);
    setLoading(isLoading);
    if (isLoading) {
      setLoadingStartTime(Date.now());
    } else {
      setLoadingStartTime(null);
    }
  };

  window.showThinkingStatus = (value) => setIsThinking(isTruthy(value));
  window.setHistoryData = (data) => setHistoryData(data);
  window.clearMessages = () => setMessages([]);
  window.addErrorMessage = (message) =>
    setMessages((prev) => [...prev, { type: 'error', content: message }]);

  // Add single history message (for session loading)
  window.addHistoryMessage = (message: ClaudeMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  // Add user message to chat (for external Quick Fix feature)
  // Backend now waits for frontend_ready signal before calling this
  window.addUserMessage = (content: string) => {
    const userMessage: ClaudeMessage = {
      type: 'user',
      content: content || '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    // Auto-scroll to bottom to show the user's message
    isUserAtBottomRef.current = true;
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
  };

  // Set current session ID (for rewind feature)
  window.setSessionId = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  // Check for pending sessionId (Java may call before React mounts)
  if ((window as any).__pendingSessionId) {
    setCurrentSessionId((window as any).__pendingSessionId);
    delete (window as any).__pendingSessionId;
  }

  // === Toast Callback ===

  window.addToast = (message, type) => {
    addToast(message, type);
  };

  // === Export Callback ===

  window.onExportSessionData = (json) => {
    try {
      // Parse backend data
      const exportData = JSON.parse(json);
      const conversationMessages = exportData.messages || [];
      const title = exportData.title || 'session';
      const sessionId = exportData.sessionId || 'unknown';

      // Convert to ClaudeMessage format
      const messages: ClaudeMessage[] = conversationMessages.map((msg: any) => {
        // Extract text content
        let contentText = '';
        if (msg.message?.content) {
          if (typeof msg.message.content === 'string') {
            contentText = msg.message.content;
          } else if (Array.isArray(msg.message.content)) {
            // Extract text from array
            contentText = msg.message.content
              .filter((block: any) => block && block.type === 'text')
              .map((block: any) => block.text || '')
              .join('\n');
          }
        }

        return {
          type: msg.type || 'assistant',
          content: contentText,
          timestamp: msg.timestamp,
          raw: msg // Keep original data
        };
      });

      // Dynamic import for export utilities
      import('../utils/exportMarkdown').then(({ convertMessagesToJSON, downloadJSON }) => {
        const json = convertMessagesToJSON(messages, title);
        const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${sessionId.slice(0, 8)}.json`;
        downloadJSON(json, filename);
        // Note: Don't show success toast here, wait for backend save to complete
      }).catch(error => {
        console.error('[Frontend] Failed to export session:', error);
        addToast('Export failed', 'error');
      });
    } catch (error) {
      console.error('[Frontend] Failed to parse export data:', error);
      addToast('Export failed', 'error');
    }
  };

  // === Slash Commands Initialization ===

  resetSlashCommandsState(); // Reset state to ensure first load triggers refresh
  resetFileReferenceState(); // Reset file reference state to prevent Promise leaks
  setupSlashCommandsCallback();

  // === Dialog Callbacks ===

  window.showPermissionDialog = (json) => {
    try {
      const request = JSON.parse(json) as PermissionRequest;
      queuePermissionRequest(request);
    } catch (error) {
      console.error('[Permission] Failed to parse request:', error);
    }
  };

  window.showAskUserQuestionDialog = (json) => {
    try {
      const request = JSON.parse(json) as AskUserQuestionRequest;
      queueAskUserQuestionRequest(request);
    } catch (error) {
      console.error('[AskUserQuestion] Failed to parse request:', error);
    }
  };

  // === Context Callbacks ===

  // Update ContextBar from auto-listener
  window.addSelectionInfo = (selectionInfo) => {
    if (selectionInfo) {
      // Parse format @path#Lstart-end or just @path
      const match = selectionInfo.match(/^@([^#]+)(?:#L(\d+)(?:-(\d+))?)?$/);
      if (match) {
        const file = match[1];
        const startLine = match[2] ? parseInt(match[2], 10) : undefined;
        const endLine = match[3] ? parseInt(match[3], 10) : (startLine !== undefined ? startLine : undefined);
        setContextInfo({ file, startLine, endLine, raw: selectionInfo });
      }
    }
  };

  // Add code snippet to input box from context menu
  window.addCodeSnippet = (selectionInfo) => {
    if (selectionInfo && window.insertCodeSnippetAtCursor) {
      window.insertCodeSnippetAtCursor(selectionInfo);
    }
  };

  // Clear selection info callback
  window.clearSelectionInfo = () => {
    setContextInfo(null);
  };

  // === Agent Callbacks ===

  window.onSelectedAgentReceived = (json) => {
    try {
      if (!json || json === 'null' || json === '{}') {
        setSelectedAgent(null);
        return;
      }
      const data = JSON.parse(json);
      const agentFromNewShape = data?.agent;
      const agentFromLegacyShape = data;

      const agentData = agentFromNewShape?.id ? agentFromNewShape : (agentFromLegacyShape?.id ? agentFromLegacyShape : null);
      if (!agentData) {
        setSelectedAgent(null);
        return;
      }

      setSelectedAgent({
        id: agentData.id,
        name: agentData.name || '',
        prompt: agentData.prompt,
      });
    } catch (error) {
      console.error('[Frontend] Failed to parse selected agent:', error);
      setSelectedAgent(null);
    }
  };

  window.onSelectedAgentChanged = (json) => {
    try {
      if (!json || json === 'null' || json === '{}') {
        setSelectedAgent(null);
        return;
      }

      const data = JSON.parse(json);
      if (data?.success === false) {
        return;
      }

      const agentData = data?.agent;
      if (!agentData || !agentData.id) {
        setSelectedAgent(null);
        return;
      }

      setSelectedAgent({
        id: agentData.id,
        name: agentData.name || '',
        prompt: agentData.prompt,
      });
    } catch (error) {
      console.error('[Frontend] Failed to parse selected agent changed:', error);
    }
  };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: refs are stable, setters are stable from useState, queue handlers are from hooks
}
