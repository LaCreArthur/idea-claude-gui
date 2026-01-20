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

export interface UseStreamingCallbacksParams {
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

  currentProviderRef: React.MutableRefObject<string>;

  setMessages: React.Dispatch<React.SetStateAction<ClaudeMessage[]>>;
  setStreamingActive: (active: boolean) => void;
  setExpandedThinking: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setIsThinking: (thinking: boolean) => void;

  isUserAtBottomRef: React.MutableRefObject<boolean>;
}

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
    const streamingRefs: StreamingRefs = {
      streamingTextSegmentsRef,
      streamingThinkingSegmentsRef,
      streamingContentRef,
      streamingMessageIndexRef,
    };

    window.onStreamStart = () => {
      streamingContentRef.current = '';
      isStreamingRef.current = true;
      useBackendStreamingRenderRef.current = currentProviderRef.current === 'claude';
      autoExpandedThinkingKeysRef.current.clear();
      setStreamingActive(true);
      isUserAtBottomRef.current = true;
      streamingTextSegmentsRef.current = [];
      activeTextSegmentIndexRef.current = -1;
      streamingThinkingSegmentsRef.current = [];
      activeThinkingSegmentIndexRef.current = -1;
      seenToolUseCountRef.current = 0;

      if (useBackendStreamingRenderRef.current) {
        return;
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === 'assistant' && last?.isStreaming) {
          streamingMessageIndexRef.current = prev.length - 1;
          return prev;
        }
        streamingMessageIndexRef.current = prev.length;
        return [...prev, {
          type: 'assistant',
          content: '',
          isStreaming: true,
          timestamp: new Date().toISOString()
        }];
      });
    };

    window.onContentDelta = (delta: string) => {
      if (!isStreamingRef.current) return;
      streamingContentRef.current += delta;
      activeThinkingSegmentIndexRef.current = -1;

      if (activeTextSegmentIndexRef.current < 0) {
        activeTextSegmentIndexRef.current = streamingTextSegmentsRef.current.length;
        streamingTextSegmentsRef.current.push('');
      }
      streamingTextSegmentsRef.current[activeTextSegmentIndexRef.current] += delta;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastContentUpdateRef.current;

      if (timeSinceLastUpdate >= THROTTLE_INTERVAL) {
        lastContentUpdateRef.current = now;
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
      } else {
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

    window.onThinkingDelta = (delta: string) => {
      if (!isStreamingRef.current) return;
      const normalizedDelta = delta.replace(/\r\n/g, '\n');
      if (activeThinkingSegmentIndexRef.current < 0) {
        const phaseIndex = activeTextSegmentIndexRef.current >= 0
          ? activeTextSegmentIndexRef.current
          : streamingTextSegmentsRef.current.length;
        while (streamingThinkingSegmentsRef.current.length <= phaseIndex) {
          streamingThinkingSegmentsRef.current.push('');
        }
        activeThinkingSegmentIndexRef.current = phaseIndex;
      }
      streamingThinkingSegmentsRef.current[activeThinkingSegmentIndexRef.current] += normalizedDelta;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastThinkingUpdateRef.current;

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

      if (timeSinceLastUpdate >= THROTTLE_INTERVAL) {
        lastThinkingUpdateRef.current = now;
        updateThinkingUI();
      } else {
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

    window.onStreamEnd = () => {
      const useBackendRender = useBackendStreamingRenderRef.current;
      isStreamingRef.current = false;
      useBackendStreamingRenderRef.current = false;
      setStreamingActive(false);
      activeThinkingSegmentIndexRef.current = -1;
      activeTextSegmentIndexRef.current = -1;
      seenToolUseCountRef.current = 0;

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

      const finalContent = streamingContentRef.current;
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

      streamingContentRef.current = '';
      streamingTextSegmentsRef.current = [];
      streamingThinkingSegmentsRef.current = [];
      streamingMessageIndexRef.current = -1;
      setIsThinking(false);
    };
  }, []);
}
