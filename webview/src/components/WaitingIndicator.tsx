import { useState, useEffect } from 'react';

interface WaitingIndicatorProps {
  size?: number;
  /** Start time timestamp (ms), used to maintain timing across view switches */
  startTime?: number;
}

export const WaitingIndicator = ({ size = 18, startTime }: WaitingIndicatorProps) => {
  const [dotCount, setDotCount] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    // If start time provided, calculate elapsed seconds
    if (startTime) {
      return Math.floor((Date.now() - startTime) / 1000);
    }
    return 0;
  });

  // Ellipsis animation
  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount(prev => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Timer: record seconds elapsed in current thinking round
  useEffect(() => {
    const timer = setInterval(() => {
      if (startTime) {
        // Use externally provided start time to calculate, avoid reset on view switch
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      } else {
        setElapsedSeconds(prev => prev + 1);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [startTime]);

  const dots = '.'.repeat(dotCount);

  // Format time display: under 60s show "Xs", over 60s show "Xm Ys"
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="waiting-indicator">
      <span className="waiting-spinner" style={{ width: size, height: size }} />
      <span className="waiting-text">
        Generating response<span className="waiting-dots">{dots}</span>
        <span className="waiting-seconds">(Elapsed {formatElapsedTime(elapsedSeconds)})</span>
      </span>
    </div>
  );
};

export default WaitingIndicator;
