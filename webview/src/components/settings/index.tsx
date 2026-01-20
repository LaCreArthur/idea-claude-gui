import { useEffect, useState } from 'react';
import type { ProviderConfig } from '../../types/provider';
import type { AgentConfig } from '../../types/agent';
import { type ClaudeConfig } from './ConfigInfoDisplay';
import AlertDialog from '../AlertDialog';
import type { AlertType } from '../AlertDialog';
import ConfirmDialog from '../ConfirmDialog';
import { ToastContainer, type ToastMessage } from '../Toast';
import ProviderDialog from '../ProviderDialog';
import AgentDialog from '../AgentDialog';

import SettingsHeader from './SettingsHeader';
import SettingsSidebar, { type SettingsTab } from './SettingsSidebar';
import BasicConfigSection from './BasicConfigSection';
import ProviderManageSection from './ProviderManageSection';
import DependencySection from './DependencySection';
import PlaceholderSection from './PlaceholderSection';
import CommunitySection from './CommunitySection';
import AgentSection from './AgentSection';
import { SkillsSettingsSection } from '../skills';

import styles from './style.module.less';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: SettingsTab;
  currentProvider: string;
  streamingEnabled?: boolean;
  onStreamingEnabledChange?: (enabled: boolean) => void;
  sendShortcut?: 'enter' | 'cmdEnter';
  onSendShortcutChange?: (shortcut: 'enter' | 'cmdEnter') => void;
}

const sendToJava = (message: string) => {
  if (window.sendToJava) {
    window.sendToJava(message);
  } else {
    console.warn('[SettingsView] sendToJava is not available');
  }
};

const AUTO_COLLAPSE_THRESHOLD = 900;

const SettingsView = ({ onClose, initialTab, streamingEnabled: streamingEnabledProp, onStreamingEnabledChange: onStreamingEnabledChangeProp, sendShortcut: sendShortcutProp, onSendShortcutChange: onSendShortcutChangeProp }: SettingsViewProps) => {
  const [currentTab, setCurrentTab] = useState<SettingsTab>(() => {
    return initialTab || 'basic';
  });
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig | null>(null);
  const [claudeConfigLoading, setClaudeConfigLoading] = useState(false);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);

  const isCollapsed = manualCollapsed !== null
      ? manualCollapsed
      : windowWidth < AUTO_COLLAPSE_THRESHOLD;

  const [providerDialog, setProviderDialog] = useState<{
    isOpen: boolean;
    provider: ProviderConfig | null;
  }>({ isOpen: false, provider: null });

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({ isOpen: false, type: 'info', title: '', message: '' });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    provider: ProviderConfig | null;
  }>({ isOpen: false, provider: null });

  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentDialog, setAgentDialog] = useState<{
    isOpen: boolean;
    agent: AgentConfig | null;
  }>({ isOpen: false, agent: null });
  const [deleteAgentConfirm, setDeleteAgentConfirm] = useState<{
    isOpen: boolean;
    agent: AgentConfig | null;
  }>({ isOpen: false, agent: null });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  const [fontSizeLevel, setFontSizeLevel] = useState<number>(() => {
    const savedLevel = localStorage.getItem('fontSizeLevel');
    const level = savedLevel ? parseInt(savedLevel, 10) : 3;
    return level >= 1 && level <= 6 ? level : 3;
  });

  const [nodePath, setNodePath] = useState('');
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [minNodeVersion, setMinNodeVersion] = useState(18);
  const [savingNodePath, setSavingNodePath] = useState(false);

  const [workingDirectory, setWorkingDirectory] = useState('');
  const [savingWorkingDirectory, setSavingWorkingDirectory] = useState(false);

  const [editorFontConfig, setEditorFontConfig] = useState<{
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
  } | undefined>();

  const [localStreamingEnabled, setLocalStreamingEnabled] = useState<boolean>(false);
  const streamingEnabled = streamingEnabledProp ?? localStreamingEnabled;

  const [localSendShortcut, setLocalSendShortcut] = useState<'enter' | 'cmdEnter'>('enter');
  const sendShortcut = sendShortcutProp ?? localSendShortcut;

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const syncActiveProviderModelMapping = (provider?: ProviderConfig | null) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!provider || !provider.settingsConfig || !provider.settingsConfig.env) {
      try {
        window.localStorage.removeItem('claude-model-mapping');
      } catch {
      }
      return;
    }
    const env = provider.settingsConfig.env as Record<string, any>;
    const mapping = {
      main: env.ANTHROPIC_MODEL ?? '',
      haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
      sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
      opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '',
    };
    const hasValue = Object.values(mapping).some(v => v && String(v).trim().length > 0);
    try {
      if (hasValue) {
        window.localStorage.setItem('claude-model-mapping', JSON.stringify(mapping));
      } else {
        window.localStorage.removeItem('claude-model-mapping');
      }
    } catch {
    }
  };

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleTabChange = (tab: SettingsTab) => {
    setCurrentTab(tab);
  };

  const showAlert = (type: AlertType, title: string, message: string) => {
    console.log('[SettingsView] showAlert called:', { type, title, message });
    setAlertDialog({ isOpen: true, type, title, message });
  };

  const closeAlert = () => {
    setAlertDialog({ ...alertDialog, isOpen: false });
  };

  const showSwitchSuccess = (message: string) => {
    console.log('[SettingsView] showSwitchSuccess called:', message);
    showAlert('success', 'Switched successfully', message);
  };

  useEffect(() => {
    window.updateProviders = (jsonStr: string) => {
      try {
        const providersList: ProviderConfig[] = JSON.parse(jsonStr);
        setProviders(providersList);
        const active = providersList.find(p => p.isActive);
        if (active) {
          syncActiveProviderModelMapping(active);
        }
        setLoading(false);
      } catch (error) {
        console.error('[SettingsView] Failed to parse providers:', error);
        setLoading(false);
      }
    };

    window.updateActiveProvider = (jsonStr: string) => {
      try {
        const activeProvider: ProviderConfig = JSON.parse(jsonStr);
        if (activeProvider) {
          setProviders((prev) =>
              prev.map((p) => ({ ...p, isActive: p.id === activeProvider.id }))
          );
          syncActiveProviderModelMapping(activeProvider);
        }
      } catch (error) {
        console.error('[SettingsView] Failed to parse active provider:', error);
      }
    };

    window.updateCurrentClaudeConfig = (jsonStr: string) => {
      try {
        const config: ClaudeConfig = JSON.parse(jsonStr);
        setClaudeConfig(config);
        setClaudeConfigLoading(false);
      } catch (error) {
        console.error('[SettingsView] Failed to parse claude config:', error);
        setClaudeConfigLoading(false);
      }
    };

    window.showError = (message: string) => {
      console.log('[SettingsView] window.showError called:', message);
      showAlert('error', 'Operation failed', message);
      setLoading(false);
      setSavingNodePath(false);
      setSavingWorkingDirectory(false);
    };

    window.showSwitchSuccess = (message: string) => {
      console.log('[SettingsView] window.showSwitchSuccess called:', message);
      showSwitchSuccess(message);
    };

    window.updateNodePath = (jsonStr: string) => {
      console.log('[SettingsView] window.updateNodePath called:', jsonStr);
      try {
        const data = JSON.parse(jsonStr);
        setNodePath(data.path || '');
        setNodeVersion(data.version || null);
        if (data.minVersion) {
          setMinNodeVersion(data.minVersion);
        }
      } catch (e) {
        console.warn('[SettingsView] Failed to parse updateNodePath JSON, fallback to legacy format:', e);
        setNodePath(jsonStr || '');
      }
      setSavingNodePath(false);
    };

    window.updateWorkingDirectory = (jsonStr: string) => {
      console.log('[SettingsView] window.updateWorkingDirectory called:', jsonStr);
      try {
        const data = JSON.parse(jsonStr);
        setWorkingDirectory(data.customWorkingDir || '');
        setSavingWorkingDirectory(false);
      } catch (error) {
        console.error('[SettingsView] Failed to parse working directory:', error);
        setSavingWorkingDirectory(false);
      }
    };

    window.showSuccess = (message: string) => {
      console.log('[SettingsView] window.showSuccess called:', message);
      showAlert('success', 'Operation successful', message);
      setSavingNodePath(false);
      setSavingWorkingDirectory(false);
    };

    window.onEditorFontConfigReceived = (jsonStr: string) => {
      try {
        const config = JSON.parse(jsonStr);
        setEditorFontConfig(config);
      } catch (error) {
        console.error('[SettingsView] Failed to parse editor font config:', error);
      }
    };

    const previousUpdateStreamingEnabled = window.updateStreamingEnabled;
    if (!onStreamingEnabledChangeProp) {
      window.updateStreamingEnabled = (jsonStr: string) => {
        try {
          const data = JSON.parse(jsonStr);
          setLocalStreamingEnabled(data.streamingEnabled ?? false);
        } catch (error) {
          console.error('[SettingsView] Failed to parse streaming config:', error);
        }
      };
    }

    const previousUpdateSendShortcut = window.updateSendShortcut;
    if (!onSendShortcutChangeProp) {
      window.updateSendShortcut = (jsonStr: string) => {
        try {
          const data = JSON.parse(jsonStr);
          setLocalSendShortcut(data.sendShortcut ?? 'enter');
        } catch (error) {
          console.error('[SettingsView] Failed to parse send shortcut config:', error);
        }
      };
    }

    const previousUpdateAgents = window.updateAgents;
    window.updateAgents = (jsonStr: string) => {
      const timeoutId = (window as any).__agentsLoadingTimeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
        (window as any).__agentsLoadingTimeoutId = undefined;
      }

      try {
        const agentsList: AgentConfig[] = JSON.parse(jsonStr);
        setAgents(agentsList);
        setAgentsLoading(false);
        console.log('[SettingsView] Successfully loaded', agentsList.length, 'agents');
      } catch (error) {
        console.error('[SettingsView] Failed to parse agents:', error);
        setAgentsLoading(false);
      }

      previousUpdateAgents?.(jsonStr);
    };

    window.agentOperationResult = (jsonStr: string) => {
      try {
        const result = JSON.parse(jsonStr);
        if (result.success) {
          const operationMessages: Record<string, string> = {
            add: 'Agent created successfully',
            update: 'Agent updated successfully',
            delete: 'Agent deleted successfully',
          };
          addToast(operationMessages[result.operation] || 'Operation successful', 'success');
        } else {
          addToast(result.error || 'Operation failed', 'error');
        }
      } catch (error) {
        console.error('[SettingsView] Failed to parse agent operation result:', error);
      }
    };

    loadProviders();
    loadAgents();
    loadClaudeConfig();
    sendToJava('get_node_path:');
    sendToJava('get_working_directory:');
    sendToJava('get_editor_font_config:');
    sendToJava('get_streaming_enabled:');

    return () => {
      const timeoutId = (window as any).__agentsLoadingTimeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
        (window as any).__agentsLoadingTimeoutId = undefined;
      }

      window.updateProviders = undefined;
      window.updateActiveProvider = undefined;
      window.updateCurrentClaudeConfig = undefined;
      window.showError = undefined;
      window.showSwitchSuccess = undefined;
      window.updateNodePath = undefined;
      window.updateWorkingDirectory = undefined;
      window.showSuccess = undefined;
      window.onEditorFontConfigReceived = undefined;
      if (!onStreamingEnabledChangeProp) {
        window.updateStreamingEnabled = previousUpdateStreamingEnabled;
      }
      if (!onSendShortcutChangeProp) {
        window.updateSendShortcut = previousUpdateSendShortcut;
      }
      window.updateAgents = previousUpdateAgents;
      window.agentOperationResult = undefined;
    };
  }, [onStreamingEnabledChangeProp, onSendShortcutChangeProp]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);

      const shouldAutoCollapse = window.innerWidth < AUTO_COLLAPSE_THRESHOLD;
      if (manualCollapsed !== null && manualCollapsed === shouldAutoCollapse) {
        setManualCollapsed(null);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [manualCollapsed]);

  const toggleManualCollapse = () => {
    if (manualCollapsed === null) {
      setManualCollapsed(!isCollapsed);
    } else {
      setManualCollapsed(!manualCollapsed);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const fontSizeMap: Record<number, number> = {
      1: 0.8,
      2: 0.9,
      3: 1.0,
      4: 1.1,
      5: 1.2,
      6: 1.4,
    };
    const scale = fontSizeMap[fontSizeLevel] || 1.0;
    document.documentElement.style.setProperty('--font-scale', scale.toString());
    localStorage.setItem('fontSizeLevel', fontSizeLevel.toString());
  }, [fontSizeLevel]);

  const loadProviders = () => {
    setLoading(true);
    sendToJava('get_providers:');
  };

  const loadAgents = (retryCount = 0) => {
    const MAX_RETRIES = 2;
    const TIMEOUT = 3000;

    setAgentsLoading(true);
    sendToJava('get_agents:');

    const timeoutId = setTimeout(() => {
      console.warn('[SettingsView] loadAgents timeout, attempt:', retryCount + 1);

      if (retryCount < MAX_RETRIES) {
        loadAgents(retryCount + 1);
      } else {
        console.error('[SettingsView] loadAgents failed after', MAX_RETRIES, 'retries');
        setAgentsLoading(false);
        setAgents([]);
      }
    }, TIMEOUT);

    (window as any).__agentsLoadingTimeoutId = timeoutId;
  };

  const loadClaudeConfig = () => {
    setClaudeConfigLoading(true);
    sendToJava('get_current_claude_config:');
  };

  const handleSaveNodePath = () => {
    setSavingNodePath(true);
    const payload = { path: (nodePath || '').trim() };
    sendToJava(`set_node_path:${JSON.stringify(payload)}`);
  };

  const handleSaveWorkingDirectory = () => {
    setSavingWorkingDirectory(true);
    const payload = { customWorkingDir: (workingDirectory || '').trim() };
    sendToJava(`set_working_directory:${JSON.stringify(payload)}`);
  };

  const handleStreamingEnabledChange = (enabled: boolean) => {
    if (onStreamingEnabledChangeProp) {
      onStreamingEnabledChangeProp(enabled);
    } else {
      setLocalStreamingEnabled(enabled);
      const payload = { streamingEnabled: enabled };
      sendToJava(`set_streaming_enabled:${JSON.stringify(payload)}`);
    }
  };

  const handleSendShortcutChange = (shortcut: 'enter' | 'cmdEnter') => {
    if (onSendShortcutChangeProp) {
      onSendShortcutChangeProp(shortcut);
    } else {
      setLocalSendShortcut(shortcut);
      const payload = { sendShortcut: shortcut };
      sendToJava(`set_send_shortcut:${JSON.stringify(payload)}`);
    }
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setProviderDialog({ isOpen: true, provider });
  };

  const handleAddProvider = () => {
    setProviderDialog({ isOpen: true, provider: null });
  };

  const handleCloseProviderDialog = () => {
    setProviderDialog({ isOpen: false, provider: null });
  };

  const handleSaveProviderFromDialog = (data: {
    providerName: string;
    remark: string;
    apiKey: string;
    apiUrl: string;
    jsonConfig: string;
  }) => {
    if (!data.providerName) {
      showAlert('warning', 'Warning', 'Please enter provider name');
      return;
    }

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(data.jsonConfig || '{}');
    } catch (e) {
      showAlert('error', 'Error', 'Invalid JSON config format');
      return;
    }

    const updates = {
      name: data.providerName,
      remark: data.remark,
      websiteUrl: null,
      settingsConfig: parsedConfig,
    };

    const isAdding = !providerDialog.provider;

    if (isAdding) {
      const newProvider = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        ...updates
      };
      sendToJava(`add_provider:${JSON.stringify(newProvider)}`);
      addToast('Provider added', 'success');
    } else {
      if (!providerDialog.provider) return;

      const providerId = providerDialog.provider.id;
      const currentProvider = providers.find(p => p.id === providerId) || providerDialog.provider;
      const isActive = currentProvider.isActive;

      const updateData = {
        id: providerId,
        updates,
      };
      sendToJava(`update_provider:${JSON.stringify(updateData)}`);
      addToast('Provider updated', 'success');

      if (isActive) {
        console.log('[SettingsView] Re-applying active provider config:', providerId);
        syncActiveProviderModelMapping({
          ...currentProvider,
          settingsConfig: parsedConfig,
        });
        setTimeout(() => {
          sendToJava(`switch_provider:${JSON.stringify({ id: providerId })}`);
        }, 100);
      }
    }

    setProviderDialog({ isOpen: false, provider: null });
    setLoading(true);
  };

  const handleSwitchProvider = (id: string) => {
    const data = { id };
    const target = providers.find(p => p.id === id);
    if (target) {
      syncActiveProviderModelMapping(target);
    }
    sendToJava(`switch_provider:${JSON.stringify(data)}`);
    setLoading(true);
  };

  const handleDeleteProvider = (provider: ProviderConfig) => {
    console.log('[SettingsView] handleDeleteProvider called:', provider.id, provider.name);
    setDeleteConfirm({ isOpen: true, provider });
  };

  const confirmDeleteProvider = () => {
    const provider = deleteConfirm.provider;
    if (!provider) return;

    console.log('[SettingsView] confirmDeleteProvider - sending delete_provider:', provider.id);
    const data = { id: provider.id };
    sendToJava(`delete_provider:${JSON.stringify(data)}`);
    addToast('Provider deleted', 'success');
    setLoading(true);
    setDeleteConfirm({ isOpen: false, provider: null });
  };

  const cancelDeleteProvider = () => {
    setDeleteConfirm({ isOpen: false, provider: null });
  };

  const handleAddAgent = () => {
    setAgentDialog({ isOpen: true, agent: null });
  };

  const handleEditAgent = (agent: AgentConfig) => {
    setAgentDialog({ isOpen: true, agent });
  };

  const handleDeleteAgent = (agent: AgentConfig) => {
    setDeleteAgentConfirm({ isOpen: true, agent });
  };

  const handleCloseAgentDialog = () => {
    setAgentDialog({ isOpen: false, agent: null });
  };

  const handleSaveAgentFromDialog = (data: { name: string; prompt: string }) => {
    const isAdding = !agentDialog.agent;

    if (isAdding) {
      const newAgent = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        name: data.name,
        prompt: data.prompt,
      };
      sendToJava(`add_agent:${JSON.stringify(newAgent)}`);
    } else if (agentDialog.agent) {
      const updateData = {
        id: agentDialog.agent.id,
        updates: {
          name: data.name,
          prompt: data.prompt,
        },
      };
      sendToJava(`update_agent:${JSON.stringify(updateData)}`);
    }

    setAgentDialog({ isOpen: false, agent: null });
    loadAgents();
  };

  const confirmDeleteAgent = () => {
    const agent = deleteAgentConfirm.agent;
    if (!agent) return;

    const data = { id: agent.id };
    sendToJava(`delete_agent:${JSON.stringify(data)}`);
    setDeleteAgentConfirm({ isOpen: false, agent: null });
    loadAgents();
  };

  const cancelDeleteAgent = () => {
    setDeleteAgentConfirm({ isOpen: false, agent: null });
  };

  return (
    <div className={styles.settingsPage}>
      <SettingsHeader onClose={onClose} />

      <div className={styles.settingsMain}>
        <SettingsSidebar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleManualCollapse}
          disabledTabs={[]}
        />

        <div className={`${styles.settingsContent} ${currentTab === 'providers' ? styles.providerSettingsContent : ''}`}>
          {currentTab === 'basic' && (
            <BasicConfigSection
              theme={theme}
              onThemeChange={setTheme}
              fontSizeLevel={fontSizeLevel}
              onFontSizeLevelChange={setFontSizeLevel}
              nodePath={nodePath}
              onNodePathChange={setNodePath}
              onSaveNodePath={handleSaveNodePath}
              savingNodePath={savingNodePath}
              nodeVersion={nodeVersion}
              minNodeVersion={minNodeVersion}
              workingDirectory={workingDirectory}
              onWorkingDirectoryChange={setWorkingDirectory}
              onSaveWorkingDirectory={handleSaveWorkingDirectory}
              savingWorkingDirectory={savingWorkingDirectory}
              editorFontConfig={editorFontConfig}
              streamingEnabled={streamingEnabled}
              onStreamingEnabledChange={handleStreamingEnabledChange}
              sendShortcut={sendShortcut}
              onSendShortcutChange={handleSendShortcutChange}
            />
          )}

          {currentTab === 'providers' && (
            <ProviderManageSection
              claudeConfig={claudeConfig}
              claudeConfigLoading={claudeConfigLoading}
              providers={providers}
              loading={loading}
              onAddProvider={handleAddProvider}
              onEditProvider={handleEditProvider}
              onDeleteProvider={handleDeleteProvider}
              onSwitchProvider={handleSwitchProvider}
              addToast={addToast}
            />
          )}

          {currentTab === 'dependencies' && <DependencySection addToast={addToast} />}

          {currentTab === 'mcp' && <PlaceholderSection type="mcp" />}

          {currentTab === 'agents' && (
            <AgentSection
              agents={agents}
              loading={agentsLoading}
              onAdd={handleAddAgent}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
            />
          )}

          {currentTab === 'skills' && <SkillsSettingsSection />}

          {currentTab === 'community' && <CommunitySection />}
        </div>
      </div>

      <AlertDialog
        isOpen={alertDialog.isOpen}
        type={alertDialog.type}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={closeAlert}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={'Confirm Delete Provider'}
        message={`Are you sure you want to delete provider "${deleteConfirm.provider?.name || ''}"?\n\nThis action cannot be undone.`}
        confirmText={'Delete'}
        cancelText={'Cancel'}
        onConfirm={confirmDeleteProvider}
        onCancel={cancelDeleteProvider}
      />

      <ProviderDialog
        isOpen={providerDialog.isOpen}
        provider={providerDialog.provider}
        onClose={handleCloseProviderDialog}
        onSave={handleSaveProviderFromDialog}
        onDelete={handleDeleteProvider}
        canDelete={true}
        addToast={addToast}
      />

      <AgentDialog
        isOpen={agentDialog.isOpen}
        agent={agentDialog.agent}
        onClose={handleCloseAgentDialog}
        onSave={handleSaveAgentFromDialog}
      />

      <ConfirmDialog
        isOpen={deleteAgentConfirm.isOpen}
        title={'Confirm Delete'}
        message={`Are you sure you want to delete agent "${deleteAgentConfirm.agent?.name || ''}"? This action cannot be undone.`}
        confirmText={'Delete'}
        cancelText={'Cancel'}
        onConfirm={confirmDeleteAgent}
        onCancel={cancelDeleteAgent}
      />

      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default SettingsView;
