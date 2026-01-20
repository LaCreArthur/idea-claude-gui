import { useEffect, useState, useCallback, useRef } from 'react';

interface ScrollControlProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputAreaRef?: React.RefObject<HTMLDivElement | null>;
}

export const ScrollControl = ({ containerRef, inputAreaRef }: ScrollControlProps) => {
  const [visible, setVisible] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [bottomOffset, setBottomOffset] = useState(120);
  const hideTimerRef = useRef<number | null>(null);

  const THRESHOLD = 100;
  const HIDE_DELAY = 1500;

  const updatePosition = useCallback(() => {
    if (inputAreaRef?.current) {
      const inputRect = inputAreaRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const newBottom = windowHeight - inputRect.top + 20;
      setBottomOffset(newBottom);
    }
  }, [inputAreaRef]);

  const checkScrollPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    if (scrollHeight <= clientHeight) {
      setVisible(false);
      return;
    }

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < THRESHOLD) {
      setVisible(false);
    }
  }, [containerRef]);

  const handleWheel = useCallback((e: WheelEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    if (scrollHeight <= clientHeight) {
      return;
    }

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < THRESHOLD) {
      setVisible(false);
      return;
    }

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    if (e.deltaY > 0) {
      setDirection('down');
    } else if (e.deltaY < 0) {
      setDirection('up');
    }

    setVisible(true);

    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_DELAY);
  }, [containerRef]);

  const scrollToTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [containerRef]);

  const handleClick = useCallback(() => {
    if (direction === 'up') {
      scrollToTop();
    } else {
      scrollToBottom();
    }
    setVisible(false);
  }, [direction, scrollToTop, scrollToBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    checkScrollPosition();
    updatePosition();

    container.addEventListener('scroll', checkScrollPosition);

    container.addEventListener('wheel', handleWheel, { passive: true });

    const handleResize = () => {
      checkScrollPosition();
      updatePosition();
    };
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (inputAreaRef?.current) {
      resizeObserver = new ResizeObserver(updatePosition);
      resizeObserver.observe(inputAreaRef.current);
    }

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [containerRef, inputAreaRef, checkScrollPosition, handleWheel, updatePosition]);

  if (!visible) return null;

  return (
    <button
      className="scroll-control-button"
      style={{ bottom: `${bottomOffset}px` }}
      onClick={handleClick}
      aria-label={direction === 'up' ? 'Back to top' : 'Back to bottom'}
      title={direction === 'up' ? 'Back to top' : 'Back to bottom'}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: direction === 'up' ? 'rotate(180deg)' : 'none' }}
      >
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    </button>
  );
};
