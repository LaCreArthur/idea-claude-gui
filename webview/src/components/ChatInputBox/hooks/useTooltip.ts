import { useCallback, useState } from 'react';

export interface TooltipState {
  visible: boolean;
  text: string;
  top: number;
  left: number;
  tx?: string;
  arrowLeft?: string;
  width?: number;
  isBar?: boolean;
}

export interface UseTooltipReturn {
  tooltip: TooltipState | null;
  handleMouseOver: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
}

export function useTooltip(): UseTooltipReturn {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const fileTag = target.closest('.file-tag.has-tooltip');

    if (fileTag) {
      const text = fileTag.getAttribute('data-tooltip');
      if (text) {
        const rect = fileTag.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const tagCenterX = rect.left + rect.width / 2;

        const estimatedTooltipWidth = Math.min(text.length * 7 + 24, 400);
        const tooltipHalfWidth = estimatedTooltipWidth / 2;

        let tooltipLeft = tagCenterX;
        let tx = '-50%';
        let arrowLeft = '50%';

        if (tagCenterX - tooltipHalfWidth < 10) {
          tooltipLeft = 10;
          tx = '0';
          arrowLeft = `${tagCenterX - 10}px`;
        }
        else if (tagCenterX + tooltipHalfWidth > viewportWidth - 10) {
          tooltipLeft = viewportWidth - 10;
          tx = '-100%';
          arrowLeft = `${tagCenterX - (viewportWidth - 10) + estimatedTooltipWidth}px`;
        }
        else {
          arrowLeft = '50%';
        }

        setTooltip({
          visible: true,
          text,
          top: rect.top,
          left: tooltipLeft,
          tx,
          arrowLeft,
          isBar: false
        });
      }
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  return {
    tooltip,
    handleMouseOver,
    handleMouseLeave,
  };
}
