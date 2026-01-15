import type { ProviderConfig } from '../../../types/provider';
import ConfigInfoDisplay, { type ClaudeConfig } from '../ConfigInfoDisplay';
import ProviderList from '../ProviderList';
import styles from './style.module.less';

interface ProviderManageSectionProps {
  claudeConfig: ClaudeConfig | null;
  claudeConfigLoading: boolean;
  providers: ProviderConfig[];
  loading: boolean;
  onAddProvider: () => void;
  onEditProvider: (provider: ProviderConfig) => void;
  onDeleteProvider: (provider: ProviderConfig) => void;
  onSwitchProvider: (id: string) => void;
  addToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const ProviderManageSection = ({
  claudeConfig,
  claudeConfigLoading,
  providers,
  loading,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onSwitchProvider,
  addToast,
}: ProviderManageSectionProps) => {
  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>Provider Management</h3>
      <p className={styles.sectionDesc}>Manage Claude API provider configurations and switch between different API service providers</p>

      <div className={styles.configInfoWrapper}>
        <ConfigInfoDisplay
          config={claudeConfig}
          loading={claudeConfigLoading}
          providers={providers.map(p => ({ id: p.id, name: p.name, isActive: p.isActive }))}
          onSwitchProvider={onSwitchProvider}
          addToast={addToast}
        />
      </div>

      {loading && (
        <div className={styles.tempNotice}>
          <span className="codicon codicon-loading codicon-modifier-spin" />
          <p>Loading...</p>
        </div>
      )}

      {!loading && (
        <ProviderList
          providers={providers}
          onAdd={onAddProvider}
          onEdit={onEditProvider}
          onDelete={onDeleteProvider}
          onSwitch={onSwitchProvider}
          addToast={addToast}
          emptyState={
            <>
              <span className="codicon codicon-info" />
              <p>No provider configured</p>
            </>
          }
        />
      )}
    </div>
  );
};

export default ProviderManageSection;
