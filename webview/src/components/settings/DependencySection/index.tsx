import { useState, useEffect, useRef } from 'react';
import type { SdkId, SdkStatus, InstallProgress, InstallResult, UninstallResult, NodeEnvironmentStatus } from '../../../types/dependency';
import styles from './style.module.less';

interface DependencySectionProps {
  addToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const sendToJava = (message: string) => {
  if (window.sendToJava) {
    window.sendToJava(message);
  } else {
    console.warn('[DependencySection] sendToJava is not available');
  }
};

const SDK_DEFINITIONS = [
  {
    id: 'claude-sdk' as SdkId,
    name: 'Claude Code SDK',
    description: 'Required for Claude AI features. Includes Claude Code SDK and related dependencies.',
    relatedProviders: ['anthropic', 'bedrock'],
  },
];

const DependencySection = ({ addToast }: DependencySectionProps) => {
  const [sdkStatus, setSdkStatus] = useState<Record<SdkId, SdkStatus>>({} as Record<SdkId, SdkStatus>);
  const [loading, setLoading] = useState(true);
  const [installingSdk, setInstallingSdk] = useState<SdkId | null>(null);
  const [uninstallingSdk, setUninstallingSdk] = useState<SdkId | null>(null);
  const [installLogs, setInstallLogs] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [nodeAvailable, setNodeAvailable] = useState<boolean | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addToastRef = useRef(addToast);

  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  useEffect(() => {
    if (logContainerRef.current && showLogs) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [installLogs, showLogs]);

  useEffect(() => {
    const savedUpdateDependencyStatus = window.updateDependencyStatus;
    const savedDependencyInstallProgress = window.dependencyInstallProgress;
    const savedDependencyInstallResult = window.dependencyInstallResult;
    const savedDependencyUninstallResult = window.dependencyUninstallResult;
    const savedNodeEnvironmentStatus = window.nodeEnvironmentStatus;

    window.updateDependencyStatus = (jsonStr: string) => {
      try {
        const status = JSON.parse(jsonStr);
        setSdkStatus(status);
        setLoading(false);
      } catch (error) {
        console.error('[DependencySection] Failed to parse dependency status:', error);
        setLoading(false);
      }
      if (typeof savedUpdateDependencyStatus === 'function') {
        try {
          savedUpdateDependencyStatus(jsonStr);
        } catch (e) {
          console.error('[DependencySection] Error in chained updateDependencyStatus:', e);
        }
      }
    };

    window.dependencyInstallProgress = (jsonStr: string) => {
      try {
        const progress: InstallProgress = JSON.parse(jsonStr);
        setInstallLogs((prev) => prev + progress.log + '\n');
      } catch (error) {
        console.error('[DependencySection] Failed to parse install progress:', error);
      }
      if (typeof savedDependencyInstallProgress === 'function') {
        try {
          savedDependencyInstallProgress(jsonStr);
        } catch (e) {
          console.error('[DependencySection] Error in chained dependencyInstallProgress:', e);
        }
      }
    };

    window.dependencyInstallResult = (jsonStr: string) => {
      try {
        const result: InstallResult = JSON.parse(jsonStr);
        setInstallingSdk(null);

        if (result.success) {
          const sdkDef = SDK_DEFINITIONS.find(d => d.id === result.sdkId);
          const sdkName = sdkDef?.name || result.sdkId;
          addToastRef.current?.(`${sdkName} installed successfully`, 'success');
        } else if (result.error === 'node_not_configured') {
          addToastRef.current?.('Node.js is not configured. Please set the Node.js path in Basic Settings first.', 'warning');
        } else {
          addToastRef.current?.(`Installation failed: ${result.error}`, 'error');
        }
      } catch (error) {
        console.error('[DependencySection] Failed to parse install result:', error);
        setInstallingSdk(null);
      }
      if (typeof savedDependencyInstallResult === 'function') {
        try {
          savedDependencyInstallResult(jsonStr);
        } catch (e) {
          console.error('[DependencySection] Error in chained dependencyInstallResult:', e);
        }
      }
    };

    window.dependencyUninstallResult = (jsonStr: string) => {
      try {
        const result: UninstallResult = JSON.parse(jsonStr);
        setUninstallingSdk(null);

        if (result.success) {
          const sdkDef = SDK_DEFINITIONS.find(d => d.id === result.sdkId);
          const sdkName = sdkDef?.name || result.sdkId;
          addToastRef.current?.(`${sdkName} has been uninstalled`, 'success');
        } else {
          addToastRef.current?.(`Uninstall failed: ${result.error}`, 'error');
        }
      } catch (error) {
        console.error('[DependencySection] Failed to parse uninstall result:', error);
        setUninstallingSdk(null);
      }
      if (typeof savedDependencyUninstallResult === 'function') {
        try {
          savedDependencyUninstallResult(jsonStr);
        } catch (e) {
          console.error('[DependencySection] Error in chained dependencyUninstallResult:', e);
        }
      }
    };

    window.nodeEnvironmentStatus = (jsonStr: string) => {
      try {
        const status: NodeEnvironmentStatus = JSON.parse(jsonStr);
        setNodeAvailable(status.available);
      } catch (error) {
        console.error('[DependencySection] Failed to parse node environment status:', error);
      }
      if (typeof savedNodeEnvironmentStatus === 'function') {
        try {
          savedNodeEnvironmentStatus(jsonStr);
        } catch (e) {
          console.error('[DependencySection] Error in chained nodeEnvironmentStatus:', e);
        }
      }
    };

    sendToJava('get_dependency_status:');
    sendToJava('check_node_environment:');

    return () => {
      window.updateDependencyStatus = savedUpdateDependencyStatus;
      window.dependencyInstallProgress = savedDependencyInstallProgress;
      window.dependencyInstallResult = savedDependencyInstallResult;
      window.dependencyUninstallResult = savedDependencyUninstallResult;
      window.nodeEnvironmentStatus = savedNodeEnvironmentStatus;
    };
  }, []);

  const handleInstall = (sdkId: SdkId) => {
    if (nodeAvailable === false) {
      addToast?.('Node.js is not configured. Please set the Node.js path in Basic Settings first.', 'warning');
      return;
    }

    setInstallingSdk(sdkId);
    setInstallLogs('');
    setShowLogs(true);
    sendToJava(`install_dependency:${JSON.stringify({ id: sdkId })}`);
  };

  const handleUninstall = (sdkId: SdkId) => {
    setUninstallingSdk(sdkId);
    sendToJava(`uninstall_dependency:${JSON.stringify({ id: sdkId })}`);
  };

  const getSdkInfo = (sdkId: SdkId): SdkStatus | undefined => {
    return sdkStatus[sdkId];
  };

  const isInstalled = (sdkId: SdkId): boolean => {
    const info = getSdkInfo(sdkId);
    return info?.status === 'installed';
  };

  return (
    <div className={styles.dependencySection}>
      <h3 className={styles.sectionTitle}>SDK Dependency Management</h3>
      <p className={styles.sectionDesc}>Manage AI SDK dependencies. Install the required SDK before first use.</p>

      <div className={styles.sdkWarningBar}>
        <span className="codicon codicon-info" />
        <span className={styles.warningText}>To reduce package size, SDKs now need to be installed manually</span>
      </div>

      {nodeAvailable === false && (
        <div className={styles.warningBanner}>
          <span className="codicon codicon-warning" />
          <span>Node.js is not configured. Please set the Node.js path in Basic Settings first.</span>
        </div>
      )}

      <div className={styles.sdkList}>
        {loading ? (
          <div className={styles.loadingState}>
            <span className="codicon codicon-loading codicon-modifier-spin" />
            <span>Loading dependency status...</span>
          </div>
        ) : (
          SDK_DEFINITIONS.map((sdk) => {
            const info = getSdkInfo(sdk.id);
            const installed = isInstalled(sdk.id);
            const isInstalling = installingSdk === sdk.id;
            const isUninstalling = uninstallingSdk === sdk.id;
            const hasUpdate = info?.hasUpdate;
            const isAnyOperationInProgress = installingSdk !== null || uninstallingSdk !== null;

            return (
              <div key={sdk.id} className={styles.sdkCard}>
                <div className={styles.sdkHeader}>
                  <div className={styles.sdkInfo}>
                    <div className={styles.sdkName}>
                      <span className={`codicon ${installed ? 'codicon-check' : 'codicon-package'}`} />
                      <span>{sdk.name}</span>
                      {installed && info?.installedVersion && (
                        <span className={styles.versionBadge}>v{info.installedVersion}</span>
                      )}
                      {hasUpdate && (
                        <span className={styles.updateBadge}>
                          Update available
                        </span>
                      )}
                    </div>
                    <div className={styles.sdkDescription}>{sdk.description}</div>
                  </div>

                  <div className={styles.sdkActions}>
                    {!installed ? (
                      <button
                        className={`${styles.installBtn} ${isInstalling ? styles.installing : ''}`}
                        onClick={() => handleInstall(sdk.id)}
                        disabled={isAnyOperationInProgress || nodeAvailable === false}
                      >
                        {isInstalling ? (
                          <>
                            <span className="codicon codicon-loading codicon-modifier-spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <span className="codicon codicon-cloud-download" />
                            <span>Install</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        {hasUpdate && (
                          <button
                            className={styles.updateBtn}
                            onClick={() => handleInstall(sdk.id)}
                            disabled={isAnyOperationInProgress}
                          >
                            <span className="codicon codicon-sync" />
                            <span>Update</span>
                          </button>
                        )}
                        <button
                          className={styles.uninstallBtn}
                          onClick={() => handleUninstall(sdk.id)}
                          disabled={isAnyOperationInProgress}
                        >
                          {isUninstalling ? (
                            <>
                              <span className="codicon codicon-loading codicon-modifier-spin" />
                              <span>Uninstalling...</span>
                            </>
                          ) : (
                            <>
                              <span className="codicon codicon-trash" />
                              <span>Uninstall</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {installed && info?.installPath && (
                  <div className={styles.installPath}>
                    <span className="codicon codicon-folder" />
                    <span>{info.installPath}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showLogs && (
        <div className={styles.logsSection}>
          <div className={styles.logsHeader}>
            <span>Install Logs</span>
            <button className={styles.closeLogsBtn} onClick={() => setShowLogs(false)}>
              <span className="codicon codicon-close" />
            </button>
          </div>
          <div className={styles.logsContainer} ref={logContainerRef}>
            <pre>{installLogs || 'Waiting for log output...'}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default DependencySection;
