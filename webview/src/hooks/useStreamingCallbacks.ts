import { useEffect } from 'react';
import type { ClaudeMessage } from '../types';
import {
  findLastAssistantIndex,
  extractRawBlocks,
  getOrCreateStreamingAssistantIndex,
  patchAssistantForStreaming,
  type StreamingRefs,
} from '../utils/streamingHelpers';
import { THROTTLE_INTERVAL } from './useStreamingState';

/**
 * Parameters for the useStreamingCallbacks hook
 */
export interface UseStreamingCallbacksParams {
  // Streaming refs from useStreamingState
  streamingContentRef: React.MutableRefObject<string>;
  isStreamingRef: React.MutableRefObject<boolean>;
  useBackendStreamingRenderRef: React.MutableRefObject<boolean>;
  streamingTextSegmentsRef: React.MutableRefObject<string[]>;
  activeTextSegmentIndexRef: React.MutableRefObject<number>;
  streamingThinkingSegmentsRef: React.MutableRefObject<string[]>;
  activeThinkingSegmentIndexRef: React.MutableRefObject<number>;
  seenToolUseCountRef: React.MutableRefObject<number>;
  streamingMessageIndexRef: React.MutableRefObject<number>;
  contentUpdateTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  thinkingUpdateTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastContentUpdateRef: React.MutableRefObject<number>;
  lastThinkingUpdateRef: React.MutableRefObject<number>;
  autoExpandedThinkingKeysRef: React.MutableRefObject<Set<string>>;

  // Provider ref
  currentProviderRef: React.MutableRefObject<string>;

  // State setters
  setMessages: React.Dispatch<React.SetStateAction<ClaudeMessage[]>>;
  setStreamingActive: (active: boolean) => void;
  setExpandedThinking: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setIsThinking: (thinking: boolean) => void;

  // User scroll ref
  isUserAtBottomRef: React.MutableRefObject<boolean>;
}

/**
 * Custom hook to set up streaming window callbacks.
 * Handles onStreamStart, onContentDelta, onThinkingDelta, and onStreamEnd.
 */
export function useStreamingCallbacks(params: UseStreamingCallbacksParams): void {
  const {
    streamingContentRef,
    isStreamingRef,
    useBackendStreamingRenderRef,
    streamingTextSegmentsRef,
    activeTextSegmentIndexRef,
    streamingThinkingSegmentsRef,
    activeThinkingSegmentIndexRef,
    seenToolUseCountRef,
    streamingMessageIndexRef,
    contentUpdateTimeoutRef,
    thinkingUpdateTimeoutRef,
    lastContentUpdateRef,
    lastThinkingUpdateRef,
    autoExpandedThinkingKeysRef,
    currentProviderRef,
    setMessages,
    setStreamingActive,
    setExpandedThinking,
    setIsThinking,
    isUserAtBottomRef,
  } = params;

  useEffect(() => {
    // Create refs object to pass to streaming helper functions
    const streamingRefs: StreamingRefs = {
      streamingTextSegmentsRef,
      streamingThinkingSegmentsRef,
      streamingContentRef,
      streamingMessageIndexRef,
    };

    // Stream start callback
    window.onStreamStart = () => {
      streamingContentRef.current = '';
      isStreamingRef.current = true;
      // Claude streaming: backend drives rendering via updateMessages with raw blocks
      useBackendStreamingRenderRef.current = currentProviderRef.current === 'claude';
      autoExpandedThinkingKeysRef.current.clear();
      setStreamingActive(true);
      isUserAtBottomRef.current = true;
      streamingTextSegmentsRef.current = [];
      activeTextSegmentIndexRef.current = -1;
      streamingThinkingSegmentsRef.current = [];
      activeThinkingSegmentIndexRef.current = -1;
      seenToolUseCountRef.current = 0;

      // Claude streaming is driven by backend via updateMessages, no frontend placeholder needed
      if (useBackendStreamingRenderRef.current) {
        return;
      }
      // Add a placeholder assistant message for streaming updates
      setMessages((prev) => {
        // Check if last message is already a streaming assistant message
        const last = prev[prev.length - 1];
        if (last?.type === 'assistant' && last?.isStreaming) {
          // Record streaming message index
          streamingMessageIndexRef.current = prev.length - 1;
          return prev; // Already exists, don't add duplicate
        }
        // Record new streaming message index
        streamingMessageIndexRef.current = prev.length;
        return [...prev, {
          type: 'assistant',
          content: '',
          isStreaming: true,
          timestamp: new Date().toISOString()
        }];
      });
    };

    // Content delta callback - use index to locate streaming message
    window.onContentDelta = (delta: string) => {
      if (!isStreamingRef.current) return;
      streamingContentRef.current += delta;
      // Content output means current thinking segment ends (subsequent thinking_delta starts new segment)
      activeThinkingSegmentIndexRef.current = -1;

      // Calculate/create current text segment (starts new segment after tool calls)
      if (activeTextSegmentIndexRef.current < 0) {
        activeTextSegmentIndexRef.current = streamingTextSegmentsRef.current.length;
        streamingTextSegmentsRef.current.push('');
      }
      streamingTextSegmentsRef.current[activeTextSegmentIndexRef.current] += delta;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastContentUpdateRef.current;

      // Real throttling: if threshold exceeded, update immediately
      if (timeSinceLastUpdate >= THROTTLE_INTERVAL) {
        lastContentUpdateRef.current = now;
        const currentContent = streamingContentRef.current;
        setMessages((prev) => {
          const newMessages = [...prev];
          // Use index to locate, not isStreaming flag (avoids being overwritten by updateMessages)
          const idx = getOrCreateStreamingAssistantIndex(newMessages, streamingRefs);
          if (idx >= 0 && newMessages[idx]?.type === 'assistant') {
            newMessages[idx] = patchAssistantForStreaming({
              ...newMessages[idx],
              content: currentContent,
              isStreaming: true,
            }, streamingRefs);
          }
          return newMessages;
        });
      } else {
        // If threshold not reached, ensure update happens when threshold expires
        if (!contentUpdateTimeoutRef.current) {
          const remainingTime = THROTTLE_INTERVAL - timeSinceLastUpdate;
          contentUpdateTimeoutRef.current = setTimeout(() => {
            contentUpdateTimeoutRef.current = null;
            lastContentUpdateRef.current = Date.now();
            const currentContent = streamingContentRef.current;
            setMessages((prev) => {
              const newMessages = [...prev];
              const idx = getOrCreateStreamingAssistantIndex(newMessages, streamingRefs);
              if (idx >= 0 && newMessages[idx]?.type === 'assistant') {
                newMessages[idx] = patchAssistantForStreaming({
                  ...newMessages[idx],
                  content: currentContent,
                  isStreaming: true,
                }, streamingRefs);
              }
              return newMessages;
            });
          }, remainingTime);
        }
      }
    };

    // Thinking delta callback - use index to locate streaming message
    window.onThinkingDelta = (delta: string) => {
      if (!isStreamingRef.current) return;
      // Normalize line endings, but don't over-clean here (unified cleanup in buildStreamingBlocks)
      const normalizedDelta = delta.replace(/\r\n/g, '\n');
      // Multi-segment thinking: aggregate by "phase" (before/after tool calls go into different segments)
      if (activeThinkingSegmentIndexRef.current < 0) {
        const phaseIndex = activeTextSegmentIndexRef.current >= 0
          ? activeTextSegmentIndexRef.current
          : streamingTextSegmentsRef.current.length; // After tool call but text not started yet, should go to next segment
        while (streamingThinkingSegmentsRef.current.length <= phaseIndex) {
          streamingThinkingSegmentsRef.current.push('');
        }
        activeThinkingSegmentIndexRef.current = phaseIndex;
      }
      streamingThinkingSegmentsRef.current[activeThinkingSegmentIndexRef.current] += normalizedDelta;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastThinkingUpdateRef.current;

      // Function to update thinking UI
      const updateThinkingUI = () => {
        setMessages((prev) => {
          const newMessages = [...prev];
          const idx = getOrCreateStreamingAssistantIndex(newMessages, streamingRefs);
          if (idx >= 0 && newMessages[idx]?.type === 'assistant') {
            newMessages[idx] = patchAssistantForStreaming({
              ...newMessages[idx],
              isStreaming: true,
            }, streamingRefs);

            const rawBlocks = extractRawBlocks(newMessages[idx].raw);
            let lastThinkingIndex = -1;
            for (let i = rawBlocks.length - 1; i >= 0; i -= 1) {
              if (rawBlocks[i]?.type === 'thinking') {
                lastThinkingIndex = i;
                break;
              }
            }
            if (lastThinkingIndex >= 0) {
              const thinkingKey = `${idx}_${lastThinkingIndex}`;
              setExpandedThinking((prevExpanded) => ({ ...prevExpanded, [thinkingKey]: true }));
            }
          }
          return newMessages;
        });
        setIsThinking(true);
      };

      // Real throttling: if threshold exceeded, update immediately
      if (timeSinceLastUpdate >= THROTTLE_INTERVAL) {
        lastThinkingUpdateRef.current = now;
        updateThinkingUI();
      } else {
        // If threshold not reached, ensure update happens when threshold expires
        if (!thinkingUpdateTimeoutRef.current) {
          const remainingTime = THROTTLE_INTERVAL - timeSinceLastUpdate;
          thinkingUpdateTimeoutRef.current = setTimeout(() => {
            thinkingUpdateTimeoutRef.current = null;
            lastThinkingUpdateRef.current = Date.now();
            updateThinkingUI();
          }, remainingTime);
        }
      }
    };

    // Stream end callback
    window.onStreamEnd = () => {
      const useBackendRender = useBackendStreamingRenderRef.current;
      isStreamingRef.current = false;
      useBackendStreamingRenderRef.current = false;
      setStreamingActive(false);
      activeThinkingSegmentIndexRef.current = -1;
      activeTextSegmentIndexRef.current = -1;
      seenToolUseCountRef.current = 0;

      // Clear throttle timers
      if (contentUpdateTimeoutRef.current) {
        clearTimeout(contentUpdateTimeoutRef.current);
        contentUpdateTimeoutRef.current = null;
      }
      if (thinkingUpdateTimeoutRef.current) {
        clearTimeout(thinkingUpdateTimeoutRef.current);
        thinkingUpdateTimeoutRef.current = null;
      }

      if (useBackendRender) {
        const keysToCollapse = Array.from(autoExpandedThinkingKeysRef.current);
        autoExpandedThinkingKeysRef.current.clear();
        if (keysToCollapse.length > 0) {
          setExpandedThinking((prevExpanded) => {
            let changed = false;
            const next = { ...prevExpanded };
            for (const key of keysToCollapse) {
              if (next[key]) {
                next[key] = false;
                changed = true;
              }
            }
            return changed ? next : prevExpanded;
          });
        }

        streamingContentRef.current = '';
        streamingTextSegmentsRef.current = [];
        streamingThinkingSegmentsRef.current = [];
        streamingMessageIndexRef.current = -1;
        setIsThinking(false);
        return;
      }

      // Ensure final content is written
      const finalContent = streamingContentRef.current;
      // Capture current index value
      const targetIdx = streamingMessageIndexRef.current;

      setMessages((prev) => {
        const newMessages = [...prev];
        const idx = targetIdx >= 0 && targetIdx < prev.length ? targetIdx : findLastAssistantIndex(newMessages);
        if (idx >= 0 && newMessages[idx]?.type === 'assistant') {
          const patched = patchAssistantForStreaming(newMessages[idx], streamingRefs);
          const rawBlocks = extractRawBlocks(patched.raw);
          for (let blockIndex = 0; blockIndex < rawBlocks.length; blockIndex += 1) {
            if (rawBlocks[blockIndex]?.type === 'thinking') {
              const thinkingKey = `${idx}_${blockIndex}`;
              setExpandedThinking((prevExpanded) => ({ ...prevExpanded, [thinkingKey]: false }));
            }
          }
          newMessages[idx] = { ...patched, content: finalContent, isStreaming: false };
        }
        return newMessages;
      });

      // Reset streaming state
      streamingContentRef.current = '';
      streamingTextSegmentsRef.current = [];
      streamingThinkingSegmentsRef.current = [];
      // Reset index
      streamingMessageIndexRef.current = -1;
      setIsThinking(false);
    };
  }, []); // Empty deps - refs are stable
}
