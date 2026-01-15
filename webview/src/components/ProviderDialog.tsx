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
  const isAdding = !provider;

  const [providerName, setProviderName] = useState('');
  const [remark, setRemark] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');

  const [haikuModel, setHaikuModel] = useState('');
  const [sonnetModel, setSonnetModel] = useState('');
  const [opusModel, setOpusModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [jsonConfig, setJsonConfig] = useState('');
  const [jsonError, setJsonError] = useState('');

  const updateEnvField = (key: string, value: string) => {
    try {
      const config = jsonConfig ? JSON.parse(jsonConfig) : {};
      if (!config.env) config.env = {};
      const env = config.env as Record<string, any>;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        if (Object.prototype.hasOwnProperty.call(env, key)) {
          delete env[key];
        }
        if (Object.keys(env).length === 0) {
          delete config.env;
        }
      } else {
        env[key] = value;
      }
      setJsonConfig(JSON.stringify(config, null, 2));
      setJsonError('');
    } catch {
    }
  };

  // Format JSON
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonConfig);
      setJsonConfig(JSON.stringify(parsed, null, 2));
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON format');
    }
  };

  // Initialize form
  useEffect(() => {
    if (isOpen) {
      if (provider) {
        // Edit mode
        setProviderName(provider.name || '');
        setRemark(provider.remark || provider.websiteUrl || '');
        setApiKey(provider.settingsConfig?.env?.ANTHROPIC_AUTH_TOKEN || provider.settingsConfig?.env?.ANTHROPIC_API_KEY || '');
        setApiUrl(provider.settingsConfig?.env?.ANTHROPIC_BASE_URL || '');
        const env = provider.settingsConfig?.env || {};

        setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '');
        setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || '');
        setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL || '');

        const config = provider.settingsConfig || {
          env: {
            ANTHROPIC_AUTH_TOKEN: '',
            ANTHROPIC_BASE_URL: '',
            ANTHROPIC_MODEL: '',
            ANTHROPIC_DEFAULT_SONNET_MODEL: '',
            ANTHROPIC_DEFAULT_OPUS_MODEL: '',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
          }
        };
        setJsonConfig(JSON.stringify(config, null, 2));
      } else {
        // Add mode
        setProviderName('');
        setRemark('');
        setApiKey('');
        setApiUrl('');

        setHaikuModel('');
        setSonnetModel('');
        setOpusModel('');
        const config = {
          env: {
            ANTHROPIC_AUTH_TOKEN: '',
            ANTHROPIC_BASE_URL: '',
            ANTHROPIC_MODEL: '',
            ANTHROPIC_DEFAULT_SONNET_MODEL: '',
            ANTHROPIC_DEFAULT_OPUS_MODEL: '',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
          }
        };
        setJsonConfig(JSON.stringify(config, null, 2));
      }
      setShowApiKey(false);
      setJsonError('');
    }
  }, [isOpen, provider]);

  // ESC key to close
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

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value;
    setApiKey(newApiKey);
    updateEnvField('ANTHROPIC_AUTH_TOKEN', newApiKey);
  };

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiUrl = e.target.value;
    setApiUrl(newApiUrl);
    updateEnvField('ANTHROPIC_BASE_URL', newApiUrl);
  };

  const handleHaikuModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHaikuModel(value);
    updateEnvField('ANTHROPIC_DEFAULT_HAIKU_MODEL', value);
  };

  const handleSonnetModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSonnetModel(value);
    updateEnvField('ANTHROPIC_DEFAULT_SONNET_MODEL', value);
  };

  const handleOpusModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOpusModel(value);
    updateEnvField('ANTHROPIC_DEFAULT_OPUS_MODEL', value);
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJson = e.target.value;
    setJsonConfig(newJson);

    try {
      const config = JSON.parse(newJson);
      const env = config.env || {};

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_AUTH_TOKEN')) {
        setApiKey(env.ANTHROPIC_AUTH_TOKEN || '');
      } else if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_API_KEY')) {
        setApiKey(env.ANTHROPIC_API_KEY || '');
      } else {
        setApiKey('');
      }

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_BASE_URL')) {
        setApiUrl(env.ANTHROPIC_BASE_URL || '');
      } else {
        setApiUrl('');
      }

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_DEFAULT_HAIKU_MODEL')) {
        setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '');
      } else {
        setHaikuModel('');
      }

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_DEFAULT_SONNET_MODEL')) {
        setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || '');
      } else {
        setSonnetModel('');
      }

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_DEFAULT_OPUS_MODEL')) {
        setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL || '');
      } else {
        setOpusModel('');
      }
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON format');
    }
  };

  const handleSave = () => {
    onSave({
      providerName,
      remark,
      apiKey,
      apiUrl,
      jsonConfig,
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog provider-dialog">
        <div className="dialog-header">
          <h3>{isAdding ? 'Add Provider' : `Edit Provider: ${provider?.name}`}</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-body">
          <p className="dialog-desc">
            {isAdding ? 'Configure new provider information' : 'Changes will be applied immediately to the current provider.'}
          </p>

          <div className="form-group">
            <label htmlFor="providerName">
              Provider Name
              <span className="required">*</span>
            </label>
            <input
              id="providerName"
              type="text"
              className="form-input"
              placeholder="e.g., Claude Official"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="remark">Remark</label>
            <input
              id="remark"
              type="text"
              className="form-input"
              placeholder="Optional"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">
              API Key
            </label>
            <div className="input-with-visibility">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={handleApiKeyChange}
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
              Please enter your API Key. Optional if you've logged in via `claude login`.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="apiUrl">
              API Endpoint
              <span className="required">*</span>
            </label>
            <input
              id="apiUrl"
              type="text"
              className="form-input"
              placeholder="https://api.anthropic.com"
              value={apiUrl}
              onChange={handleApiUrlChange}
            />
            <small className="form-hint">
              <span className="codicon codicon-info" style={{ fontSize: '12px', marginRight: '4px' }} />
              Enter Claude API compatible service endpoint address
            </small>
          </div>

          <div className="form-group">
            <label>Model Mapping (will be injected into JSON env)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor="sonnetModel">Sonnet Default Model</label>
                <input
                  id="sonnetModel"
                  type="text"
                  className="form-input"
                  placeholder="e.g., claude-sonnet-4-5"
                  value={sonnetModel}
                  onChange={handleSonnetModelChange}
                />
              </div>
              <div>
                <label htmlFor="opusModel">Opus Default Model</label>
                <input
                  id="opusModel"
                  type="text"
                  className="form-input"
                  placeholder="e.g., claude-opus-4-5-20251101"
                  value={opusModel}
                  onChange={handleOpusModelChange}
                />
              </div>
              <div>
                <label htmlFor="haikuModel">Haiku Default Model</label>
                <input
                  id="haikuModel"
                  type="text"
                  className="form-input"
                  placeholder="e.g., claude-haiku-4-5"
                  value={haikuModel}
                  onChange={handleHaikuModelChange}
                />
              </div>
            </div>
            <small className="form-hint">Optional: Specify default Claude models to use. Leave empty for system defaults.</small>
          </div>

          <details className="advanced-section" open>
            <summary className="advanced-toggle">
              <span className="codicon codicon-chevron-right" />
              JSON Configuration
            </summary>
            <div className="json-config-section">
              <p className="section-desc" style={{ marginBottom: '12px', fontSize: '12px', color: '#999' }}>
                Configure complete settings.json content here, supporting all fields (e.g., model, alwaysThinkingEnabled, etc.)
              </p>

              <div className="json-toolbar">
                <button
                  type="button"
                  className="format-btn"
                  onClick={handleFormatJson}
                  title="Format JSON"
                >
                  <span className="codicon codicon-symbol-keyword" />
                  Format
                </button>
              </div>

              <div className="json-editor-wrapper">
                <textarea
                  className="json-editor"
                  value={jsonConfig}
                  onChange={handleJsonChange}
                  placeholder={`{
  "env": {
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_AUTH_TOKEN": "",
    "ANTHROPIC_BASE_URL": "",
    "ANTHROPIC_MODEL": "",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": ""
  },
  "model": "sonnet",
  "alwaysThinkingEnabled": true
}`}
                />
                {jsonError && (
                  <p className="json-error">
                    <span className="codicon codicon-error" />
                    {jsonError}
                  </p>
                )}
              </div>
            </div>
          </details>
        </div>

        <div className="dialog-footer">
          <div className="footer-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              <span className="codicon codicon-close" />
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <span className="codicon codicon-save" />
              {isAdding ? 'Confirm Add' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
