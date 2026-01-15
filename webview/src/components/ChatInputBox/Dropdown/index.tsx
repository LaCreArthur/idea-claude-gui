import { useCallback, useEffect, useRef } from 'react';
import type { DropdownProps, DropdownItemData } from '../types';
import { DropdownItem } from './DropdownItem';

interface CompletionDropdownProps extends Omit<DropdownProps, 'children'> {
  items: DropdownItemData[];
  loading?: boolean;
  emptyText?: string;
  onSelect?: (item: DropdownItemData, index: number) => void;
  onMouseEnter?: (index: number) => void;
}

/**
 * Dropdown - Generic dropdown menu component
 */
export const Dropdown = ({
  isVisible,
  position,
  width = 300,
  offsetY = 4,
  offsetX = 0,
  selectedIndex: _selectedIndex = 0,
  onClose,
  children,
}: DropdownProps) => {
  void _selectedIndex;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  if (!isVisible || !position) {
    return null;
  }

  let left = position.left + offsetX;
  const windowWidth = window.innerWidth;
  const rightPadding = 10;

  if (left + width + rightPadding > windowWidth) {
    left = windowWidth - width - rightPadding;
  }

  if (left < rightPadding) {
    left = rightPadding;
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: `calc(100vh - ${position.top}px + ${offsetY}px)`,
    left,
    width,
    zIndex: 1001,
  };

  return (
    <div
      ref={dropdownRef}
      className="completion-dropdown"
      style={style}
    >
      {children}
    </div>
  );
};

/**
 * CompletionDropdown - Completion dropdown menu
 */
export const CompletionDropdown = ({
  isVisible,
  position,
  width = 300,
  offsetY = 4,
  offsetX = 0,
  selectedIndex = 0,
  items,
  loading = false,
  emptyText,
  onClose,
  onSelect,
  onMouseEnter,
}: CompletionDropdownProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;

    const activeItem = listRef.current.querySelector('.dropdown-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((item: DropdownItemData, index: number) => {
    onSelect?.(item, index);
  }, [onSelect]);

  const handleMouseEnter = useCallback((index: number) => {
    onMouseEnter?.(index);
  }, [onMouseEnter]);

  const selectableItems = items.filter(
    item => item.type !== 'separator' && item.type !== 'section-header'
  );

  return (
    <Dropdown
      isVisible={isVisible}
      position={position}
      width={width}
      offsetY={offsetY}
      offsetX={offsetX}
      selectedIndex={selectedIndex}
      onClose={onClose}
    >
      <div ref={listRef}>
        {loading ? (
          <div className="dropdown-loading">Loading...</div>
        ) : items.length === 0 ? (
          <div className="dropdown-empty">{emptyText || 'Loading...'}</div>
        ) : (
          items.map((item) => {
            const selectableIndex = selectableItems.findIndex(i => i.id === item.id);
            const isActive = selectableIndex === selectedIndex;

            return (
              <DropdownItem
                key={item.id}
                item={item}
                isActive={isActive}
                onClick={() => handleSelect(item, selectableIndex)}
                onMouseEnter={() => {
                  if (item.type !== 'separator' && item.type !== 'section-header') {
                    handleMouseEnter(selectableIndex);
                  }
                }}
              />
            );
          })
        )}
      </div>
    </Dropdown>
  );
};

export { DropdownItem };
export default Dropdown;
