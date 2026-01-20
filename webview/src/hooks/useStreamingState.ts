import { useState, useRef, useEffect } from 'react';

export const THROTTLE_INTERVAL = 50;

export interface UseStreamingStateReturn {
  streamingActive: boolean;
  setStreamingActive: (active: boolean) => void;

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

  isAutoScrollingRef: React.MutableRefObject<boolean>;
  autoExpandedThinkingKeysRef: React.MutableRefObject<Set<string>>;

  THROTTLE_INTERVAL: number;

  resetStreamingState: () => void;
}

export function useStreamingState(): UseStreamingStateReturn {
  const [streamingActive, setStreamingActive] = useState(false);

  const streamingContentRef = useRef('');
  const isStreamingRef = useRef(false);
  const useBackendStreamingRenderRef = useRef(false);

  const streamingTextSegmentsRef = useRef<string[]>([]);
  const activeTextSegmentIndexRef = useRef<number>(-1);

  const streamingThinkingSegmentsRef = useRef<string[]>([]);
  const activeThinkingSegmentIndexRef = useRef<number>(-1);

  const seenToolUseCountRef = useRef(0);

  const streamingMessageIndexRef = useRef<number>(-1);

  const contentUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentUpdateRef = useRef(0);
  const lastThinkingUpdateRef = useRef(0);

  const isAutoScrollingRef = useRef(false);
  const autoExpandedThinkingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isStreamingRef.current = streamingActive;
  }, [streamingActive]);

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
    streamingActive,
    setStreamingActive,

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

    isAutoScrollingRef,
    autoExpandedThinkingKeysRef,

    THROTTLE_INTERVAL,

    resetStreamingState,
  };
}
