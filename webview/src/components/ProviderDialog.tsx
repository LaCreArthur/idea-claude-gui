import { useState, useEffect } from 'react';
import type { ProviderConfig } from '../types/provider';

interface ProviderDialogProps {
  isOpen: boolean;
  provider?: ProviderConfig | null;
  onClose: () => void;
  onSave: (data: {
    providerName: string;
    remark: string;
    apiKey: string;
    apiUrl: string;
    jsonConfig: string;
  }) => void;
  onDelete?: (provider: ProviderConfig) => void;
  canDelete?: boolean;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function ProviderDialog({
  isOpen,
  provider,
  onClose,
  onSave,
  onDelete: _onDelete,
  canDelete: _canDelete = true,
  addToast: _addToast,
}: ProviderDialogProps) {
  const isEditing = !!provider;

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (provider) {
        setApiKey(provider.settingsConfig?.env?.ANTHROPIC_API_KEY || '');
      } else {
        setApiKey('');
      }
      setShowApiKey(false);
    }
  }, [isOpen, provider]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleSave = () => {
    const jsonConfig = JSON.stringify({
      env: {
        ANTHROPIC_API_KEY: apiKey.trim(),
      }
    }, null, 2);

    onSave({
      providerName: 'Claude API',
      remark: '',
      apiKey: apiKey.trim(),
      apiUrl: 'https://api.anthropic.com',
      jsonConfig,
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog provider-dialog" style={{ maxWidth: '480px' }}>
        <div className="dialog-header">
          <h3>{isEditing ? 'Edit API Key' : 'Configure API Key'}</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-body">
          <p className="dialog-desc" style={{ marginBottom: '16px' }}>
            Enter your Anthropic API key to use Claude. Alternatively, run <code>claude login</code> in terminal for subscription-based access.
          </p>

          <div className="form-group">
            <label htmlFor="apiKey">
              API Key
            </label>
            <div className="input-with-visibility">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="visibility-toggle"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide' : 'Show'}
              >
                <span className={`codicon ${showApiKey ? 'codicon-eye-closed' : 'codicon-eye'}`} />
              </button>
            </div>
            <small className="form-hint">
              Get your API key from{' '}
              <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
                platform.claude.com
              </a>
            </small>
          </div>
        </div>

        <div className="dialog-footer">
          <div className="footer-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!apiKey.trim()}
            >
              <span className="codicon codicon-check" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
