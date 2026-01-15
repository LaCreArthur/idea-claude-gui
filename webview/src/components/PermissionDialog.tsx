import { useEffect, useState } from 'react';

export interface PermissionRequest {
  channelId: string;
  toolName: string;
  inputs: Record<string, any>;
  suggestions?: any;
}

interface PermissionDialogProps {
  isOpen: boolean;
  request: PermissionRequest | null;
  onApprove: (channelId: string) => void;
  onSkip: (channelId: string) => void;
  onApproveAlways: (channelId: string) => void;
}

// Tool display names mapping
const TOOL_TITLES: Record<string, string> = {
  Write: 'Write File',
  Edit: 'Edit File',
  Read: 'Read File',
  Bash: 'Execute Command',
  TodoWrite: 'Write Todo',
  TodoRead: 'Read Todo',
  WebSearch: 'Web Search',
  WebFetch: 'Fetch Web',
  readDirectory: 'Read Directory',
};

const PermissionDialog = ({
  isOpen,
  request,
  onApprove,
  onSkip,
  onApproveAlways,
}: PermissionDialogProps) => {
  const [showCommand, setShowCommand] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleApprove = () => {
    if (!request) return;
    onApprove(request.channelId);
  };

  const handleApproveAlways = () => {
    if (!request) return;
    onApproveAlways(request.channelId);
  };

  const handleSkip = () => {
    if (!request) return;
    onSkip(request.channelId);
  };

  useEffect(() => {
    if (isOpen && request) {
      setShowCommand(true);
      setSelectedIndex(0);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === '1') {
          handleApprove();
        } else if (e.key === '2') {
          handleApproveAlways();
        } else if (e.key === '3') {
          handleSkip();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(2, prev + 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setSelectedIndex(current => {
            if (current === 0) handleApprove();
            else if (current === 1) handleApproveAlways();
            else if (current === 2) handleSkip();
            return current;
          });
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, request, onApprove, onApproveAlways, onSkip]);

  if (!isOpen || !request) {
    return null;
  }

  // Format input value for display
  const formatInputValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  // Get command or main operation content
  const getCommandContent = (): string => {
    if (request.inputs.command) {
      return request.inputs.command;
    }
    if (request.inputs.content) {
      return request.inputs.content;
    }
    if (request.inputs.text) {
      return request.inputs.text;
    }
    return Object.entries(request.inputs)
      .map(([key, value]) => `${key}: ${formatInputValue(value)}`)
      .join('\n');
  };

  // Get working directory
  const getWorkingDirectory = (): string => {
    if (request.inputs.cwd) {
      return request.inputs.cwd;
    }
    if (request.inputs.file_path) {
      return request.inputs.file_path;
    }
    if (request.inputs.path) {
      return request.inputs.path;
    }
    return '~';
  };

  // Get tool display title
  const getToolTitle = (toolName: string): string => {
    return TOOL_TITLES[toolName] || `Execute ${toolName}`;
  };

  const commandContent = getCommandContent();
  const workingDirectory = getWorkingDirectory();

  return (
    <div className="permission-dialog-overlay">
      <div className="permission-dialog-v3">
        <h3 className="permission-dialog-v3-title">{getToolTitle(request.toolName)}</h3>
        <p className="permission-dialog-v3-subtitle">Request from external process</p>

        <div className="permission-dialog-v3-command-box">
          <div className="permission-dialog-v3-command-header">
            <span className="command-path">
              <span className="command-arrow">→</span> ~ {workingDirectory}
            </span>
            <button
              className="command-toggle"
              onClick={() => setShowCommand(!showCommand)}
              title={showCommand ? 'Collapse' : 'Expand'}
            >
              <span className={`codicon codicon-chevron-${showCommand ? 'up' : 'down'}`} />
            </button>
          </div>

          {showCommand && (
            <div className="permission-dialog-v3-command-content">
              <pre>{commandContent}</pre>
            </div>
          )}
        </div>

        <div className="permission-dialog-v3-options">
          <button
            className={`permission-dialog-v3-option ${selectedIndex === 0 ? 'selected' : ''}`}
            onClick={handleApprove}
            onMouseEnter={() => setSelectedIndex(0)}
          >
            <span className="option-text">Allow Once</span>
            <span className="option-key">1</span>
          </button>
          <button
            className={`permission-dialog-v3-option ${selectedIndex === 1 ? 'selected' : ''}`}
            onClick={handleApproveAlways}
            onMouseEnter={() => setSelectedIndex(1)}
          >
            <span className="option-text">Always Allow</span>
            <span className="option-key">2</span>
          </button>
          <button
            className={`permission-dialog-v3-option ${selectedIndex === 2 ? 'selected' : ''}`}
            onClick={handleSkip}
            onMouseEnter={() => setSelectedIndex(2)}
          >
            <span className="option-text">Deny</span>
            <span className="option-key">3</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
