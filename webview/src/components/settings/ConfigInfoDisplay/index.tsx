import { useState } from 'react';
import styles from './style.module.less';

export interface ClaudeConfig {
  apiKey: string;
  baseUrl: string;
  providerId?: string;
  providerName?: string;
  hasCliSession?: boolean;
  authType?: 'api_key' | 'auth_token' | 'cli_session' | 'none';
}

export interface ProviderOption {
  id: string;
  name: string;
  isActive?: boolean;
  source?: string;
}

interface ConfigInfoDisplayProps {
  config: ClaudeConfig | null;
  loading?: boolean;
  providers?: ProviderOption[];
  onSwitchProvider?: (id: string) => void;
  addToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const ConfigInfoDisplay = ({ config, loading = false, providers = [], onSwitchProvider, addToast }: ConfigInfoDisplayProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const activeProvider = providers.find(p => p.isActive);
  const switchableProviders = providers.filter(p => !p.isActive);
  const hasSwitchableProviders = switchableProviders.length > 0;

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>
            Current ClaudeCode Configuration
          </span>
        </div>
        <div className={styles.loading}>
          <span className="codicon codicon-loading codicon-modifier-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!config || (!config.apiKey && !config.hasCliSession && !config.baseUrl)) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>
            Current ClaudeCode Configuration
          </span>
        </div>
        <div className={styles.noAuth}>
          <span className="codicon codicon-warning" />
          <div className={styles.noAuthContent}>
            <span>No authentication configured</span>
            <span className={styles.loginHint}>
              Run in terminal to authenticate: <code>claude login</code>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const apiKey = config.apiKey || '';
  const baseUrl = config.baseUrl || '';

  const getApiKeyPreview = () => {
    if (!apiKey) {
      return 'Not configured';
    }
    if (showApiKey) {
      return apiKey;
    }
    if (apiKey.length <= 10) {
      return '•'.repeat(apiKey.length);
    }
    return `${apiKey.slice(0, 8)}${'•'.repeat(8)}${apiKey.slice(-4)}`;
  };

  const handleSwitchClick = (providerId: string) => {
    if (onSwitchProvider) {
      onSwitchProvider(providerId);
    }
    setShowDropdown(false);
  };

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (addToast) {
        addToast(`${label} copied to clipboard`, 'success');
      }
    }).catch(err => {
      console.error('Failed to copy: ', err);
      if (addToast) {
        addToast('Copy failed', 'error');
      }
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>
            Current ClaudeCode Configuration
          </span>
          {activeProvider && (
            <span className={styles.badge}>
              {activeProvider.name}
            </span>
          )}
        </div>
        {hasSwitchableProviders && onSwitchProvider && (
          <div className={styles.switchWrapper}>
            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => setShowDropdown(!showDropdown)}
              title="Switch provider"
            >
              <span className="codicon codicon-arrow-swap" />
              <span>Switch</span>
              <span className={`codicon codicon-chevron-${showDropdown ? 'up' : 'down'}`} />
            </button>
            {showDropdown && (
              <div className={styles.dropdown}>
                {switchableProviders.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => handleSwitchClick(provider.id)}
                  >
                    <span className="codicon codicon-server" />
                    <span>{provider.name}</span>
                    {provider.source === 'cc-switch' && (
                      <span className={styles.ccSwitchTag}>cc-switch</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.content}>
        {config.authType === 'cli_session' ? (
          <div className={styles.field}>
            <span className={`codicon codicon-account ${styles.icon}`} />
            <span className={styles.cliSessionLabel}>
              CLI Session (logged in via claude login)
            </span>
          </div>
        ) : (
          <div className={styles.field}>
            <span className={`codicon codicon-key ${styles.icon}`} />
            <code
              className={`${styles.value} ${styles.clickable}`}
              onClick={() => handleCopy(apiKey, 'API Key')}
              title="Click to copy"
            >
              {getApiKeyPreview()}
            </code>
            {apiKey && (
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide' : 'Show'}
              >
                <span className={`codicon ${showApiKey ? 'codicon-eye-closed' : 'codicon-eye'}`} style={{ fontSize: '14px' }} />
              </button>
            )}
          </div>
        )}

        <div className={styles.field}>
          <span className={`codicon codicon-globe ${styles.icon}`} />
          <code
            className={`${styles.value} ${styles.clickable}`}
            onClick={() => handleCopy(baseUrl, 'Link')}
            title="Click to copy"
          >
            {baseUrl || 'Not configured'}
          </code>
        </div>
      </div>
    </div>
  );
};

export default ConfigInfoDisplay;
