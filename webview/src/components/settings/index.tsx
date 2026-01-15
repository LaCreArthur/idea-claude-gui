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

// Import split components
import SettingsHeader from './SettingsHeader';
import SettingsSidebar, { type SettingsTab } from './SettingsSidebar';
import BasicConfigSection from './BasicConfigSection';
import ProviderManageSection from './ProviderManageSection';
import DependencySection from './DependencySection';
import UsageSection from './UsageSection';
import PlaceholderSection from './PlaceholderSection';
import CommunitySection from './CommunitySection';
import AgentSection from './AgentSection';
import { SkillsSettingsSection } from '../skills';

import styles from './style.module.less';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: SettingsTab;
  currentProvider: string;
  // Streaming configuration (passed from App.tsx for state sync)
  streamingEnabled?: boolean;
  onStreamingEnabledChange?: (enabled: boolean) => void;
  // Send shortcut configuration (passed from App.tsx for state sync)
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

// Auto-collapse threshold (window width)
const AUTO_COLLAPSE_THRESHOLD = 900;

const SettingsView = ({ onClose, initialTab, streamingEnabled: streamingEnabledProp, onStreamingEnabledChange: onStreamingEnabledChangeProp, sendShortcut: sendShortcutProp, onSendShortcutChange: onSendShortcutChangeProp }: SettingsViewProps) => {
  const [currentTab, setCurrentTab] = useState<SettingsTab>(() => {
    return initialTab || 'basic';
  });
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);

  // Claude CLI config (from ~/.claude/settings.json)
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig | null>(null);
  const [claudeConfigLoading, setClaudeConfigLoading] = useState(false);

  // Sidebar responsive state
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);

  // Calculate whether to collapse: prefer manual setting, otherwise auto based on window width
  const isCollapsed = manualCollapsed !== null
      ? manualCollapsed
      : windowWidth < AUTO_COLLAPSE_THRESHOLD;

  // Provider dialog state
  const [providerDialog, setProviderDialog] = useState<{
    isOpen: boolean;
    provider: ProviderConfig | null;
  }>({ isOpen: false, provider: null });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({ isOpen: false, type: 'info', title: '', message: '' });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    provider: ProviderConfig | null;
  }>({ isOpen: false, provider: null });

  // Agent state
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

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  // Font size level state (1-6, default 3 = 100%)
  const [fontSizeLevel, setFontSizeLevel] = useState<number>(() => {
    const savedLevel = localStorage.getItem('fontSizeLevel');
    const level = savedLevel ? parseInt(savedLevel, 10) : 3;
    return level >= 1 && level <= 6 ? level : 3;
  });

  // Node.js path
  const [nodePath, setNodePath] = useState('');
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [minNodeVersion, setMinNodeVersion] = useState(18);
  const [savingNodePath, setSavingNodePath] = useState(false);

  // Working directory config
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [savingWorkingDirectory, setSavingWorkingDirectory] = useState(false);

  // IDEA editor font config (read-only display)
  const [editorFontConfig, setEditorFontConfig] = useState<{
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
  } | undefined>();

  // Streaming config - prefer props, otherwise use local state
  const [localStreamingEnabled, setLocalStreamingEnabled] = useState<boolean>(false);
  const streamingEnabled = streamingEnabledProp ?? localStreamingEnabled;

  // Send shortcut config - prefer props, otherwise use local state
  const [localSendShortcut, setLocalSendShortcut] = useState<'enter' | 'cmdEnter'>('enter');
  const sendShortcut = sendShortcutProp ?? localSendShortcut;

  // Toast state management
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

  // Toast helper functions
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

  // Show alert dialog helper
  const showAlert = (type: AlertType, title: string, message: string) => {
    console.log('[SettingsView] showAlert called:', { type, title, message });
    setAlertDialog({ isOpen: true, type, title, message });
  };

  const closeAlert = () => {
    setAlertDialog({ ...alertDialog, isOpen: false });
  };

  // Show switch success dialog
  const showSwitchSuccess = (message: string) => {
    console.log('[SettingsView] showSwitchSuccess called:', message);
    showAlert('success', 'Switched successfully', message);
  };

  useEffect(() => {
    // Set global callbacks
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

    // Claude CLI config callback
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

    // Streaming config callback - only use local state if props not passed from App.tsx
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

    // Send shortcut config callback - only use local state if props not passed from App.tsx
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

    // Agent callbacks
    const previousUpdateAgents = window.updateAgents;
    window.updateAgents = (jsonStr: string) => {
      // Clear timeout timer if exists
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

    // Load provider list
    loadProviders();
    // Load agent list
    loadAgents();
    // Load Claude CLI config
    loadClaudeConfig();
    // Load Node.js path
    sendToJava('get_node_path:');
    // Load working directory config
    sendToJava('get_working_directory:');
    // Load IDEA editor font config
    sendToJava('get_editor_font_config:');
    // Load streaming config
    sendToJava('get_streaming_enabled:');

    return () => {
      // Clear timeout timer
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
      // Restore previous streaming callback if we overrode it
      if (!onStreamingEnabledChangeProp) {
        window.updateStreamingEnabled = previousUpdateStreamingEnabled;
      }
      // Restore previous send shortcut callback if we overrode it
      if (!onSendShortcutChangeProp) {
        window.updateSendShortcut = previousUpdateSendShortcut;
      }
      window.updateAgents = previousUpdateAgents;
      window.agentOperationResult = undefined;
    };
  }, [onStreamingEnabledChangeProp, onSendShortcutChangeProp]);

  // Monitor window size changes
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);

      // If window size change should auto-toggle state, reset manual setting
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

  // Manual toggle sidebar collapse state
  const toggleManualCollapse = () => {
    if (manualCollapsed === null) {
      setManualCollapsed(!isCollapsed);
    } else {
      setManualCollapsed(!manualCollapsed);
    }
  };

  // Theme change handler
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Font size handler
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

  // Streaming toggle handler
  const handleStreamingEnabledChange = (enabled: boolean) => {
    if (onStreamingEnabledChangeProp) {
      onStreamingEnabledChangeProp(enabled);
    } else {
      setLocalStreamingEnabled(enabled);
      const payload = { streamingEnabled: enabled };
      sendToJava(`set_streaming_enabled:${JSON.stringify(payload)}`);
    }
  };

  // Send shortcut change handler
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

  // ==================== Agent Handlers ====================
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
      {/* Header */}
      <SettingsHeader onClose={onClose} />

      {/* Main content */}
      <div className={styles.settingsMain}>
        {/* Sidebar */}
        <SettingsSidebar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleManualCollapse}
          disabledTabs={[]}
        />

        {/* Content area */}
        <div className={`${styles.settingsContent} ${currentTab === 'providers' ? styles.providerSettingsContent : ''}`}>
          {/* Basic config */}
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

          {/* Provider management */}
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

          {/* SDK dependency management */}
          {currentTab === 'dependencies' && <DependencySection addToast={addToast} />}

          {/* Usage statistics */}
          {currentTab === 'usage' && <UsageSection currentProvider="claude" />}

          {/* MCP servers */}
          {currentTab === 'mcp' && <PlaceholderSection type="mcp" />}

          {/* Permissions config */}
          {currentTab === 'permissions' && <PlaceholderSection type="permissions" />}

          {/* Agents */}
          {currentTab === 'agents' && (
            <AgentSection
              agents={agents}
              loading={agentsLoading}
              onAdd={handleAddAgent}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
            />
          )}

          {/* Skills */}
          {currentTab === 'skills' && <SkillsSettingsSection />}

          {/* Community */}
          {currentTab === 'community' && <CommunitySection />}
        </div>
      </div>

      {/* Alert dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        type={alertDialog.type}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={closeAlert}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={'Confirm Delete Provider'}
        message={`Are you sure you want to delete provider "${deleteConfirm.provider?.name || ''}"?\n\nThis action cannot be undone.`}
        confirmText={'Delete'}
        cancelText={'Cancel'}
        onConfirm={confirmDeleteProvider}
        onCancel={cancelDeleteProvider}
      />

      {/* Provider add/edit dialog */}
      <ProviderDialog
        isOpen={providerDialog.isOpen}
        provider={providerDialog.provider}
        onClose={handleCloseProviderDialog}
        onSave={handleSaveProviderFromDialog}
        onDelete={handleDeleteProvider}
        canDelete={true}
        addToast={addToast}
      />

      {/* Agent add/edit dialog */}
      <AgentDialog
        isOpen={agentDialog.isOpen}
        agent={agentDialog.agent}
        onClose={handleCloseAgentDialog}
        onSave={handleSaveAgentFromDialog}
      />

      {/* Agent delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteAgentConfirm.isOpen}
        title={'Confirm Delete'}
        message={`Are you sure you want to delete agent "${deleteAgentConfirm.agent?.name || ''}"? This action cannot be undone.`}
        confirmText={'Delete'}
        cancelText={'Cancel'}
        onConfirm={confirmDeleteAgent}
        onCancel={cancelDeleteAgent}
      />

      {/* Toast notifications */}
      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default SettingsView;
