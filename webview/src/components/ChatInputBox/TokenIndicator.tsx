import type { TokenIndicatorProps } from './types';

/**
 * TokenIndicator - Usage ring progress component
 */
export const TokenIndicator = ({
  percentage,
  size = 14,
  usedTokens,
  maxTokens,
}: TokenIndicatorProps) => {
  const radius = (size - 3) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - percentage / 100);

  const rounded = Math.round(percentage * 10) / 10;
  const formattedPercentage = Number.isInteger(rounded)
    ? `${Math.round(rounded)}%`
    : `${rounded.toFixed(1)}%`;

  const formatTokens = (value?: number) => {
    if (typeof value !== 'number' || !isFinite(value)) return undefined;
    if (value >= 1_000) {
      const kValue = value / 1_000;
      return Number.isInteger(kValue) ? `${kValue}k` : `${kValue.toFixed(1)}k`;
    }
    return `${value}`;
  };

  const usedText = formatTokens(usedTokens);
  const maxText = formatTokens(maxTokens);
  const tooltip = usedText && maxText
    ? `${formattedPercentage} · ${usedText} / ${maxText} context`
    : `Usage: ${formattedPercentage}`;

  return (
    <div className="token-indicator">
      <div className="token-indicator-wrap">
        <svg
          className="token-indicator-ring"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            className="token-indicator-bg"
            cx={center}
            cy={center}
            r={radius}
          />
          <circle
            className="token-indicator-fill"
            cx={center}
            cy={center}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        <div className="token-tooltip">
          {tooltip}
        </div>
      </div>
      <span className="token-percentage-label">{formattedPercentage}</span>
    </div>
  );
};

export default TokenIndicator;
