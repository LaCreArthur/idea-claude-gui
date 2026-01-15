import { useState, useRef, useEffect } from 'react';
import type { ProviderConfig } from '../../../types/provider';
import { sendToJava } from '../../../utils/bridge';
import ImportConfirmDialog from './ImportConfirmDialog';
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
  addToast,
  emptyState,
}: ProviderListProps) {
  const LOCAL_PROVIDER_ID = '__local_settings_json__';
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [editingCcSwitchProvider, setEditingCcSwitchProvider] = useState<ProviderConfig | null>(null);
  const [convertingProvider, setConvertingProvider] = useState<ProviderConfig | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setImportMenuOpen(false);
      }
    };

    (window as any).import_preview_result = (dataOrStr: any) => {
        console.log('[Frontend] Received import_preview_result:', dataOrStr);
        let data = dataOrStr;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse import_preview_result data:', e);
            }
        }
        const event = new CustomEvent('import_preview_result', { detail: data });
        window.dispatchEvent(event);
    };

    (window as any).backend_notification = (...args: any[]) => {
        console.log('[Frontend] Received backend_notification args:', args);
        let data: any = {};

        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[2] === 'string') {
            data = {
                type: args[0],
                title: args[1],
                message: args[2]
            };
        } else if (args.length > 0) {
            let dataOrStr = args[0];
            data = dataOrStr;
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error('Failed to parse backend_notification data:', e);
                }
            }
        }

        const event = new CustomEvent('backend_notification', { detail: data });
        window.dispatchEvent(event);
    };

    const handleImportPreview = (event: CustomEvent) => {
      setIsImporting(false);
      const data = event.detail;
      if (data && data.providers) {
        setImportPreviewData(data.providers);
        setShowImportDialog(true);
      }
    };

    const handleBackendNotification = (event: CustomEvent) => {
      setIsImporting(false);
      const data = event.detail;
      if (data && data.message) {
        addToast(data.message, data.type || 'info');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('import_preview_result', handleImportPreview as EventListener);
    window.addEventListener('backend_notification', handleBackendNotification as EventListener);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('import_preview_result', handleImportPreview as EventListener);
      window.removeEventListener('backend_notification', handleBackendNotification as EventListener);

      delete (window as any).import_preview_result;
      delete (window as any).backend_notification;
    };
  }, [addToast]);

  const handleEditClick = (provider: ProviderConfig) => {
    if (provider.source === 'cc-switch') {
      setEditingCcSwitchProvider(provider);
    } else {
      onEdit(provider);
    }
  };

  const handleConvert = () => {
    if (convertingProvider) {
      const oldId = convertingProvider.id;
      const newId = `${oldId}_local`;

      const newProvider = {
          ...convertingProvider,
          id: newId,
          name: convertingProvider.name + ' (Local)',
      };
      delete newProvider.source;

      sendToJava('add_provider', newProvider);
      sendToJava('delete_provider', { id: oldId });

      setConvertingProvider(null);
      addToast('Conversion successful, new ID generated and disconnected', 'success');

      if (editingCcSwitchProvider && editingCcSwitchProvider.id === convertingProvider.id) {
          setEditingCcSwitchProvider(null);
          onEdit(newProvider);
      }
    }
  };

  const handleSelectFileClick = () => {
    setImportMenuOpen(false);
    setIsImporting(true);
    sendToJava('open_file_chooser_for_cc_switch');
  };

  return (
    <div className={styles.container}>
      {showImportDialog && (
        <ImportConfirmDialog
          providers={importPreviewData}
          existingProviders={providers}
          onConfirm={(selectedProviders) => {
            sendToJava('save_imported_providers', { providers: selectedProviders });
            setShowImportDialog(false);
          }}
          onCancel={() => setShowImportDialog(false)}
        />
      )}

      {isImporting && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <span className="codicon codicon-loading codicon-modifier-spin" />
            <span>Reading cc-switch configuration...</span>
          </div>
        </div>
      )}

      {editingCcSwitchProvider && (
          <div className={styles.warningOverlay}>
              <div className={styles.warningDialog}>
                  <div className={styles.warningTitle}>
                      <span className="codicon codicon-warning" />
                      Edit cc-switch Configuration
                  </div>
                  <div className={styles.warningContent}>
                      You are editing a cc-switch configuration. Editing will not update cc-switch, and imports may overwrite your changes. Consider converting to local configuration before editing.
                  </div>
                  <div className={styles.warningActions}>
                      <button
                          className={styles.btnSecondary}
                          onClick={() => setEditingCcSwitchProvider(null)}
                      >
                          Cancel
                      </button>
                      <button
                          className={styles.btnSecondary}
                          onClick={() => {
                              const p = editingCcSwitchProvider;
                              setEditingCcSwitchProvider(null);
                              onEdit(p);
                          }}
                      >
                          Continue Editing
                      </button>
                      <button
                          className={styles.btnWarning}
                          onClick={() => {
                              setConvertingProvider(editingCcSwitchProvider);
                          }}
                      >
                          Convert and Edit
                      </button>
                  </div>
              </div>
          </div>
      )}

      {convertingProvider && (
          <div className={styles.warningOverlay}>
              <div className={styles.warningDialog}>
                  <div className={styles.warningTitle}>
                      <span className="codicon codicon-arrow-swap" />
                      Convert to Plugin Configuration
                  </div>
                  <div className={styles.warningContent}>
                      {`Convert cc-switch configuration "${convertingProvider.name}" to plugin configuration?`}<br/><br/>
                      After conversion, the ID connection with cc-switch will be disconnected, and future imports won't overwrite this configuration.
                  </div>
                  <div className={styles.warningActions}>
                      <button
                          className={styles.btnSecondary}
                          onClick={() => {
                              setConvertingProvider(null);
                              if (editingCcSwitchProvider) {
                                  setEditingCcSwitchProvider(null);
                              }
                          }}
                      >
                          Cancel
                      </button>
                      <button
                          className={styles.btnPrimary}
                          onClick={handleConvert}
                      >
                          Confirm Conversion
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className={styles.header}>
        <h4 className={styles.title}>All Providers</h4>

        <div className={styles.actions}>
          <div className={styles.importMenuWrapper} ref={importMenuRef}>
            <button
              className={styles.btnSecondary}
              onClick={() => setImportMenuOpen(!importMenuOpen)}
            >
              <span className="codicon codicon-cloud-download" />
              Import
            </button>

            {importMenuOpen && (
              <div className={styles.importMenu}>
                <div
                  className={styles.importMenuItem}
                  onClick={() => {
                    setImportMenuOpen(false);
                    setIsImporting(true);
                    sendToJava('preview_cc_switch_import');
                  }}
                >
                  <span className="codicon codicon-arrow-swap" />
                  Import/Update from cc-switch
                </div>
                <div
                  className={styles.importMenuItem}
                  onClick={handleSelectFileClick}
                >
                  <span className="codicon codicon-file" />
                  Select cc-switch.db File to Import
                </div>
              </div>
            )}
          </div>

          <button
            className={styles.btnPrimary}
            onClick={onAdd}
          >
            <span className="codicon codicon-add" />
            Add
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
                {provider.source === 'cc-switch' && (
                    <div className={styles.ccSwitchBadge}>
                        cc-switch
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
                      {provider.source === 'cc-switch' && (
                        <button
                          className={styles.iconBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConvertingProvider(provider);
                          }}
                          title="Convert to Plugin Configuration"
                        >
                          <span className="codicon codicon-arrow-swap" />
                        </button>
                      )}
                      <button
                        className={styles.iconBtn}
                        onClick={() => handleEditClick(provider)}
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
