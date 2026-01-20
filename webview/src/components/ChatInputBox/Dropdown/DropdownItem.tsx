import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DropdownItemProps } from '../types';

export const DropdownItem = ({
  item,
  isActive = false,
  onClick,
  onMouseEnter,
}: DropdownItemProps) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom'
  });

  const handleMouseEnterItem = () => {
    if (!itemRef.current || !item.description) return;

    const rect = itemRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const tooltipEstimatedHeight = 100;

    const placement = spaceBelow < tooltipEstimatedHeight ? 'top' : 'bottom';

    setTooltipPosition({
      top: placement === 'bottom' ? rect.bottom + 8 : rect.top - 8,
      left: rect.left + rect.width / 2,
      placement
    });
    setShowTooltip(true);
  };

  const handleMouseLeaveItem = () => {
    setShowTooltip(false);
  };

  const renderIcon = () => {
    if (item.icon?.startsWith('<svg')) {
      return (
        <span
          className="dropdown-item-icon"
          dangerouslySetInnerHTML={{ __html: item.icon }}
          style={{
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        />
      );
    }

    const iconClass = item.icon || getDefaultIconClass(item.type);
    return <span className={`dropdown-item-icon codicon ${iconClass}`} />;
  };

  const getDefaultIconClass = (type?: string): string => {
    switch (type) {
      case 'file':
        return 'codicon-file';
      case 'directory':
        return 'codicon-folder';
      case 'command':
        return 'codicon-terminal';
      default:
        return 'codicon-symbol-misc';
    }
  };

  const renderTooltip = () => {
    if (!showTooltip || !item.description) return null;

    const tooltipStyle: React.CSSProperties = {
      position: 'fixed',
      left: tooltipPosition.left,
      transform: 'translateX(-50%)',
      ...(tooltipPosition.placement === 'bottom'
        ? { top: tooltipPosition.top }
        : { bottom: window.innerHeight - tooltipPosition.top, transform: 'translateX(-50%)' }
      ),
      zIndex: 9999,
      maxWidth: '400px',
      minWidth: '200px',
      width: 'max-content',
      background: 'var(--dropdown-bg)',
      color: 'var(--text-primary)',
      border: '1px solid var(--dropdown-border)',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '12px',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      pointerEvents: 'none',
      animation: 'tooltip-fade-in 0.2s forwards'
    };

    const arrowStyle: React.CSSProperties = {
      position: 'fixed',
      left: tooltipPosition.left,
      transform: 'translateX(-50%)',
      ...(tooltipPosition.placement === 'bottom'
        ? {
            top: tooltipPosition.top - 6,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '6px solid var(--dropdown-border)'
          }
        : {
            bottom: window.innerHeight - tooltipPosition.top - 6,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--dropdown-border)'
          }
      ),
      width: 0,
      height: 0,
      zIndex: 9999,
      pointerEvents: 'none'
    };

    return createPortal(
      <>
        <div style={arrowStyle} />
        <div style={tooltipStyle}>
          {item.description}
        </div>
      </>,
      document.body
    );
  };

  if (item.type === 'separator') {
    return <div className="dropdown-separator" />;
  }

  if (item.type === 'section-header') {
    return (
      <div className="dropdown-section-header">
        {item.label}
      </div>
    );
  }

  const isDisabled = item.id === '__loading__';

  return (
    <>
      <div
        ref={itemRef}
        className={`dropdown-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
        onClick={isDisabled ? undefined : onClick}
        onMouseEnter={() => {
          onMouseEnter?.();
          handleMouseEnterItem();
        }}
        onMouseLeave={handleMouseLeaveItem}
        style={isDisabled ? { cursor: 'default' } : undefined}
      >
        {renderIcon()}
        <div className="dropdown-item-content">
          <div className="dropdown-item-label">{item.label}</div>
          {item.description && (
            <div className="dropdown-item-description">{item.description}</div>
          )}
        </div>
      </div>
      {renderTooltip()}
    </>
  );
};

export default DropdownItem;
