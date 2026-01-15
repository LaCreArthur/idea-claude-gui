import { useCallback, useEffect, useRef, useState } from 'react';
import { AVAILABLE_MODES, type PermissionMode } from '../types';

interface ModeSelectProps {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
}

const MODE_LABELS: Record<string, string> = {
  default: 'Default',
  plan: 'Plan',
  agent: 'Agent',
  bypassPermissions: 'Auto-accept',
  acceptEdits: 'Accept Edits',
};

const MODE_TOOLTIPS: Record<string, string> = {
  default: 'Default mode - manual approval for all operations',
  plan: 'Plan mode - think before acting',
  agent: 'Agent mode - agentic autonomous execution',
  bypassPermissions: 'Auto-accept - automatically approve all operations',
  acceptEdits: 'Accept Edits - auto-approve edits only',
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  default: 'Ask permission for each operation',
  plan: 'Plan first, then execute',
  agent: 'Autonomous task completion',
  bypassPermissions: 'No confirmations needed',
  acceptEdits: 'Auto-approve file edits',
};

/**
 * ModeSelect - Permission mode selector
 */
export const ModeSelect = ({ value, onChange }: ModeSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = AVAILABLE_MODES.find(m => m.id === value) || AVAILABLE_MODES[0];

  const getModeLabel = (modeId: PermissionMode): string => {
    return MODE_LABELS[modeId] || modeId;
  };

  const getModeTooltip = (modeId: PermissionMode): string => {
    return MODE_TOOLTIPS[modeId] || '';
  };

  const getModeDescription = (modeId: PermissionMode): string => {
    return MODE_DESCRIPTIONS[modeId] || '';
  };

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  }, [isOpen]);

  const handleSelect = useCallback((mode: PermissionMode, disabled?: boolean) => {
    if (disabled) return;
    onChange(mode);
    setIsOpen(false);
  }, [onChange]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className="selector-button"
        onClick={handleToggle}
        title={getModeTooltip(currentMode.id) || `Current mode: ${getModeLabel(currentMode.id)}`}
      >
        <span className={`codicon ${currentMode.icon}`} />
        <span className="selector-button-text">{getModeLabel(currentMode.id)}</span>
        <span className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', marginLeft: '2px' }} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="selector-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            zIndex: 10000,
          }}
        >
          {AVAILABLE_MODES.map((mode) => (
            <div
              key={mode.id}
              className={`selector-option ${mode.id === value ? 'selected' : ''} ${mode.disabled ? 'disabled' : ''}`}
              onClick={() => handleSelect(mode.id, mode.disabled)}
              title={getModeTooltip(mode.id)}
              style={{
                opacity: mode.disabled ? 0.5 : 1,
                cursor: mode.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span className={`codicon ${mode.icon}`} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span>{getModeLabel(mode.id)}</span>
                <span className="mode-description">{getModeDescription(mode.id)}</span>
              </div>
              {mode.id === value && (
                <span className="codicon codicon-check check-mark" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModeSelect;
