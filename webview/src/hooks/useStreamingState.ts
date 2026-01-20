import { useState, useRef, useEffect } from 'react';

/** Throttle interval for streaming updates in milliseconds */
export const THROTTLE_INTERVAL = 50;

export interface UseStreamingStateReturn {
  // State
  streamingActive: boolean;
  setStreamingActive: (active: boolean) => void;

  // Content streaming refs
  streamingContentRef: React.MutableRefObject<string>;
  isStreamingRef: React.MutableRefObject<boolean>;
  useBackendStreamingRenderRef: React.MutableRefObject<boolean>;

  // Text segment refs (for splitting content at tool call boundaries)
  streamingTextSegmentsRef: React.MutableRefObject<string[]>;
  activeTextSegmentIndexRef: React.MutableRefObject<number>;

  // Thinking segment refs (multiple thinking segments per response)
  streamingThinkingSegmentsRef: React.MutableRefObject<string[]>;
  activeThinkingSegmentIndexRef: React.MutableRefObject<number>;

  // Tool tracking
  seenToolUseCountRef: React.MutableRefObject<number>;

  // Message index tracking
  streamingMessageIndexRef: React.MutableRefObject<number>;

  // Throttling refs
  contentUpdateTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  thinkingUpdateTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastContentUpdateRef: React.MutableRefObject<number>;
  lastThinkingUpdateRef: React.MutableRefObject<number>;

  // UI refs
  isAutoScrollingRef: React.MutableRefObject<boolean>;
  autoExpandedThinkingKeysRef: React.MutableRefObject<Set<string>>;

  // Constants
  THROTTLE_INTERVAL: number;

  // Reset function
  resetStreamingState: () => void;
}

/**
 * Custom hook to manage streaming-related state and refs.
 * Consolidates all streaming state in one place for easier maintenance.
 */
export function useStreamingState(): UseStreamingStateReturn {
  // Main streaming active state (exposed to UI)
  const [streamingActive, setStreamingActive] = useState(false);

  // Content streaming refs
  const streamingContentRef = useRef('');
  const isStreamingRef = useRef(false);
  const useBackendStreamingRenderRef = useRef(false);

  // Text segment refs (for splitting content at tool call boundaries)
  const streamingTextSegmentsRef = useRef<string[]>([]);
  const activeTextSegmentIndexRef = useRef<number>(-1);

  // Thinking segment refs (multiple thinking segments per response)
  const streamingThinkingSegmentsRef = useRef<string[]>([]);
  const activeThinkingSegmentIndexRef = useRef<number>(-1);

  // Tool tracking
  const seenToolUseCountRef = useRef(0);

  // Message index tracking
  const streamingMessageIndexRef = useRef<number>(-1);

  // Throttling refs
  const contentUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentUpdateRef = useRef(0);
  const lastThinkingUpdateRef = useRef(0);

  // UI refs
  const isAutoScrollingRef = useRef(false);
  const autoExpandedThinkingKeysRef = useRef<Set<string>>(new Set());

  // Keep isStreamingRef in sync with streamingActive state
  useEffect(() => {
    isStreamingRef.current = streamingActive;
  }, [streamingActive]);

  // Reset all streaming state (useful when starting a new stream)
  const resetStreamingState = () => {
    streamingContentRef.current = '';
    isStreamingRef.current = false;
    useBackendStreamingRenderRef.current = false;
    streamingTextSegmentsRef.current = [];
    activeTextSegmentIndexRef.current = -1;
    streamingThinkingSegmentsRef.current = [];
    activeThinkingSegmentIndexRef.current = -1;
    seenToolUseCountRef.current = 0;
    streamingMessageIndexRef.current = -1;
    if (contentUpdateTimeoutRef.current) {
      clearTimeout(contentUpdateTimeoutRef.current);
      contentUpdateTimeoutRef.current = null;
    }
    if (thinkingUpdateTimeoutRef.current) {
      clearTimeout(thinkingUpdateTimeoutRef.current);
      thinkingUpdateTimeoutRef.current = null;
    }
    lastContentUpdateRef.current = 0;
    lastThinkingUpdateRef.current = 0;
    setStreamingActive(false);
  };

  return {
    // State
    streamingActive,
    setStreamingActive,

    // Content streaming refs
    streamingContentRef,
    isStreamingRef,
    useBackendStreamingRenderRef,

    // Text segment refs
    streamingTextSegmentsRef,
    activeTextSegmentIndexRef,

    // Thinking segment refs
    streamingThinkingSegmentsRef,
    activeThinkingSegmentIndexRef,

    // Tool tracking
    seenToolUseCountRef,

    // Message index tracking
    streamingMessageIndexRef,

    // Throttling refs
    contentUpdateTimeoutRef,
    thinkingUpdateTimeoutRef,
    lastContentUpdateRef,
    lastThinkingUpdateRef,

    // UI refs
    isAutoScrollingRef,
    autoExpandedThinkingKeysRef,

    // Constants
    THROTTLE_INTERVAL,

    // Reset function
    resetStreamingState,
  };
}
