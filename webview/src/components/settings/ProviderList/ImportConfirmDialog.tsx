import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './style.module.less';

interface ImportConfirmDialogProps {
  providers: any[];
  existingProviders: any[];
  onConfirm: (providers: any[]) => void;
  onCancel: () => void;
}

export default function ImportConfirmDialog({
  providers,
  existingProviders,
  onConfirm,
  onCancel
}: ImportConfirmDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(providers.map(p => p.id)));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === providers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(providers.map(p => p.id)));
    }
  };

  const getStatus = (provider: any): 'new' | 'update' => {
    const exists = existingProviders.some(p => p.id === provider.id);
    return exists ? 'update' : 'new';
  };

  const handleConfirm = () => {
    const selectedProviders = providers.filter(p => selectedIds.has(p.id));
    onConfirm(selectedProviders);
  };

  if (!mounted) return null;

  const newCount = providers.filter(p => !existingProviders.some(e => e.id === p.id)).length;
  const updateCount = providers.filter(p => existingProviders.some(e => e.id === p.id)).length;

  return createPortal(
    <div className={styles.overlay} onClick={(e) => {
        if (e.target === e.currentTarget) {
            onCancel();
        }
    }}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <h3>Import cc-switch Configuration</h3>
          <button className={styles.closeBtn} onClick={onCancel}>
            <span className="codicon codicon-close" />
          </button>
        </div>

        <div className={styles.dialogContent}>
          <div className={styles.summary}>
            {`Found ${providers.length} configurations, including `}
            <span className={styles.newBadge}>{`${newCount} new`}</span>
            ，
            <span className={styles.updateBadge}>{`${updateCount} updates`}</span>
          </div>

          <div className={styles.tableHeader}>
            <div className={styles.colCheckbox}>
              <input
                type="checkbox"
                checked={selectedIds.size === providers.length && providers.length > 0}
                onChange={toggleAll}
              />
            </div>
            <div className={styles.colName}>Name</div>
            <div className={styles.colId}>ID</div>
            <div className={styles.colStatus}>Status</div>
          </div>

          <div className={styles.providerList}>
            {providers.map(provider => {
              const status = getStatus(provider);
              const isSelected = selectedIds.has(provider.id);

              return (
                <div
                  key={provider.id}
                  className={`${styles.providerRow} ${isSelected ? styles.selected : ''}`}
                  onClick={() => toggleSelect(provider.id)}
                >
                  <div className={styles.colCheckbox}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                    />
                  </div>
                  <div className={styles.colName}>{provider.name || provider.id}</div>
                  <div className={styles.colId}>{provider.id}</div>
                  <div className={styles.colStatus}>
                    <span className={status === 'new' ? styles.tagNew : styles.tagUpdate}>
                      {status === 'new' ? 'New' : 'Update'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <div className={styles.selectedCount}>
            {`Selected ${selectedIds.size} items`}
          </div>
          <div className={styles.dialogActions}>
            <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
            <button
              className={styles.btnConfirm}
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              Confirm Import
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
