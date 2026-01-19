import type { ProviderConfig } from '../../../types/provider';
import styles from './style.module.less';

interface ProviderListProps {
  providers: ProviderConfig[];
  onAdd: () => void;
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (provider: ProviderConfig) => void;
  onSwitch: (id: string) => void;
  addToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  emptyState?: React.ReactNode;
}

export default function ProviderList({
  providers,
  onAdd,
  onEdit,
  onDelete,
  onSwitch,
  emptyState,
}: ProviderListProps) {
  const LOCAL_PROVIDER_ID = '__local_settings_json__';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>All Providers</h4>

        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={onAdd}
          >
            <span className="codicon codicon-key" />
            Add API Key
          </button>
        </div>
      </div>

      <div className={styles.list}>
        <>
          <div
            key={LOCAL_PROVIDER_ID}
            className={`${styles.card} ${providers.some(p => p.id === LOCAL_PROVIDER_ID && p.isActive) ? styles.active : ''} ${styles.localProviderCard}`}
          >
            <div className={styles.cardInfo}>
              <div className={styles.name}>
                <span className="codicon codicon-file" style={{ marginRight: '8px' }} />
                Local settings.json
                <span
                  className="codicon codicon-info"
                  style={{ marginLeft: '8px', cursor: 'help', opacity: 0.7 }}
                  title="When using local provider mode:\n• The plugin will not modify your ~/.claude/settings.json file\n• You need to manually manage your configurations\n• Make sure the file exists and contains valid JSON\n• Suitable for advanced users who prefer manual control"
                />
              </div>
              <div className={styles.website} title="Use configuration directly from ~/.claude/settings.json">
                Use configuration directly from ~/.claude/settings.json
              </div>
            </div>

            <div className={styles.cardActions}>
              {providers.some(p => p.id === LOCAL_PROVIDER_ID && p.isActive) ? (
                <div className={styles.activeBadge}>
                  <span className="codicon codicon-check" />
                  In Use
                </div>
              ) : (
                <button
                  className={styles.useButton}
                  onClick={() => onSwitch(LOCAL_PROVIDER_ID)}
                >
                  <span className="codicon codicon-play" />
                  Enable
                </button>
              )}
            </div>
          </div>

          {(() => {
            const regularProviders = providers.filter(p => p.id !== LOCAL_PROVIDER_ID);
            return regularProviders.length > 0 ? (
              regularProviders.map((provider) => (
            <div
              key={provider.id}
              className={`${styles.card} ${provider.isActive ? styles.active : ''}`}
            >
              <div className={styles.cardInfo}>
                <div className={styles.name}>
                  {provider.name}
                </div>
                {(provider.remark || provider.websiteUrl) && (
                  <div className={styles.website} title={provider.remark || provider.websiteUrl}>
                    {provider.remark || provider.websiteUrl}
                  </div>
                )}
              </div>

              <div className={styles.cardActions}>
                {provider.isActive ? (
                  <div className={styles.activeBadge}>
                    <span className="codicon codicon-check" />
                    In Use
                  </div>
                ) : (
                  <button
                    className={styles.useButton}
                    onClick={() => onSwitch(provider.id)}
                  >
                    <span className="codicon codicon-play" />
                    Enable
                  </button>
                )}

                <div className={styles.divider}></div>

                <div className={styles.actionButtons}>
                  {!provider.isLocalProvider && (
                    <>
                      <button
                        className={styles.iconBtn}
                        onClick={() => onEdit(provider)}
                        title="Edit"
                      >
                        <span className="codicon codicon-edit" />
                      </button>
                      <button
                        className={styles.iconBtn}
                        onClick={() => onDelete(provider)}
                        title="Delete"
                      >
                        <span className="codicon codicon-trash" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : null;
          })()}

          {(() => {
            const regularProviders = providers.filter(p => p.id !== LOCAL_PROVIDER_ID);
            return regularProviders.length === 0 && emptyState ? (
              <div className={styles.emptyState}>
                {emptyState}
              </div>
            ) : null;
          })()}
        </>
      </div>
    </div>
  );
}
