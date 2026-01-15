import { useEffect, useState, useMemo } from 'react';
import { marked } from 'marked';
import './PlanApprovalDialog.css';

export interface PlanApprovalRequest {
  requestId: string;
  plan: string;
}

export type ExecutionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

interface PlanApprovalDialogProps {
  isOpen: boolean;
  request: PlanApprovalRequest | null;
  onApprove: (requestId: string, newMode: ExecutionMode) => void;
  onReject: (requestId: string) => void;
}

const PlanApprovalDialog = ({
  isOpen,
  request,
  onApprove,
  onReject,
}: PlanApprovalDialogProps) => {
  const [selectedMode, setSelectedMode] = useState<ExecutionMode>('default');

  const renderedPlan = useMemo(() => {
    if (!request?.plan) return '';
    return marked.parse(request.plan) as string;
  }, [request?.plan]);

  useEffect(() => {
    if (isOpen && request) {
      // Reset to default mode when dialog opens
      setSelectedMode('default');

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleReject();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  if (!isOpen || !request) {
    return null;
  }

  const handleApprove = () => {
    onApprove(request.requestId, selectedMode);
  };

  const handleReject = () => {
    onReject(request.requestId);
  };

  const modeOptions: { id: ExecutionMode; label: string }[] = [
    {
      id: 'default',
      label: 'Default (confirm each action)',
    },
    {
      id: 'acceptEdits',
      label: 'Accept Edits (auto-approve file changes)',
    },
    {
      id: 'bypassPermissions',
      label: 'Full Auto (bypass all permissions)',
    },
  ];

  return (
    <div className="permission-dialog-overlay">
      <div className="plan-approval-dialog">
        {/* Header */}
        <div className="plan-approval-dialog-header">
          <span className="codicon codicon-tasklist plan-approval-icon"></span>
          <h3 className="plan-approval-dialog-title">
            Plan Ready for Review
          </h3>
        </div>

        {/* Subtitle */}
        <div className="plan-approval-dialog-subtitle">
          Claude has created a plan. Review and approve to start execution.
        </div>

        {/* Plan content */}
        <div className="plan-approval-dialog-content">
          <div
            className="plan-content-wrapper markdown-content"
            dangerouslySetInnerHTML={{ __html: renderedPlan }}
          />
        </div>

        {/* Mode selector */}
        <div className="plan-approval-dialog-mode-section">
          <div className="plan-approval-mode-label">
            Execute with mode:
          </div>
          <div className="plan-approval-mode-options">
            {modeOptions.map((option) => (
              <button
                key={option.id}
                className={`plan-approval-mode-option ${selectedMode === option.id ? 'selected' : ''}`}
                onClick={() => setSelectedMode(option.id)}
              >
                <span className={`codicon codicon-${selectedMode === option.id ? 'circle-filled' : 'circle-outline'}`} />
                <span className="mode-option-text">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="plan-approval-dialog-actions">
          <button
            className="action-button secondary"
            onClick={handleReject}
          >
            Reject
          </button>

          <button
            className="action-button primary"
            onClick={handleApprove}
          >
            <span className="codicon codicon-play"></span>
            Execute Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanApprovalDialog;
