import { useEffect, useCallback } from 'react';

interface PromptEnhancerDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  originalPrompt: string;
  enhancedPrompt: string;
  onUseEnhanced: () => void;
  onKeepOriginal: () => void;
  onClose: () => void;
}

/**
 * PromptEnhancerDialog - Prompt enhancement dialog
 */
export const PromptEnhancerDialog = ({
  isOpen,
  isLoading,
  originalPrompt,
  enhancedPrompt,
  onUseEnhanced,
  onKeepOriginal,
  onClose,
}: PromptEnhancerDialogProps) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !isLoading && enhancedPrompt) {
      e.preventDefault();
      onUseEnhanced();
    }
  }, [onClose, onUseEnhanced, isLoading, enhancedPrompt]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="prompt-enhancer-overlay" onClick={handleOverlayClick}>
      <div className="prompt-enhancer-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-enhancer-header">
          <div className="prompt-enhancer-title">
            <span className="codicon codicon-sparkle" />
            <h3>Enhance Prompt</h3>
          </div>
          <button className="prompt-enhancer-close" onClick={onClose}>
            <span className="codicon codicon-close" />
          </button>
        </div>

        <div className="prompt-enhancer-content">
          <div className="prompt-section">
            <div className="prompt-section-header">
              <span className="codicon codicon-edit" />
              <span>Original Prompt</span>
            </div>
            <div className="prompt-text original-prompt">
              {originalPrompt}
            </div>
          </div>

          <div className="prompt-section">
            <div className="prompt-section-header">
              <span className="codicon codicon-sparkle" />
              <span>Enhanced Prompt</span>
            </div>
            <div className="prompt-text enhanced-prompt">
              {isLoading ? (
                <div className="prompt-loading">
                  <span className="codicon codicon-loading codicon-modifier-spin" />
                  <span>Enhancing...</span>
                </div>
              ) : (
                enhancedPrompt || 'Enhancing...'
              )}
            </div>
          </div>
        </div>

        <div className="prompt-enhancer-footer">
          <button
            className="prompt-enhancer-btn secondary"
            onClick={onKeepOriginal}
            disabled={isLoading}
          >
            <span className="codicon codicon-close" />
            Keep Original
          </button>
          <button
            className="prompt-enhancer-btn primary"
            onClick={onUseEnhanced}
            disabled={isLoading || !enhancedPrompt}
          >
            <span className="codicon codicon-check" />
            Use Enhanced
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptEnhancerDialog;
