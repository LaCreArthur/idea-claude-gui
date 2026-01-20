import { useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { Attachment, PermissionMode, SelectedAgent } from '../components/ChatInputBox/types';
import type { ClaudeMessage, ClaudeContentBlock } from '../types';
import type { ProviderConfig } from '../types/provider';

export interface UseChatHandlersParams {
  loading: boolean;
  sdkStatusLoaded: boolean;
  currentSdkInstalled: boolean;
  currentProvider: string;
  selectedClaudeModel: string;
  claudePermissionMode: PermissionMode;
  activeProviderConfig: ProviderConfig | null;
  selectedAgent: SelectedAgent | null;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  isUserAtBottomRef: React.MutableRefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeMessage[]>>;
  setLoading: (loading: boolean) => void;
  setLoadingStartTime: (time: number | null) => void;
  setCurrentView: (view: 'chat' | 'history' | 'settings') => void;
  setSettingsInitialTab: (tab: 'dependencies' | undefined) => void;
  setCurrentProvider: (provider: string) => void;
  setSelectedClaudeModel: (model: string) => void;
  setPermissionMode: (mode: PermissionMode) => void;
  setClaudePermissionMode: (mode: PermissionMode) => void;
  setSelectedAgent: (agent: SelectedAgent | null) => void;
  setActiveProviderConfig: React.Dispatch<React.SetStateAction<ProviderConfig | null>>;
  setClaudeSettingsAlwaysThinkingEnabled: (enabled: boolean) => void;
  setStreamingEnabledSetting: (enabled: boolean) => void;
  setSendShortcut: (shortcut: 'enter' | 'cmdEnter') => void;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export interface ChatHandlers {
  handleSubmit: (content: string, attachments?: Attachment[]) => void;
  handleModeSelect: (mode: PermissionMode) => void;
  handleModelSelect: (modelId: string) => void;
  handleProviderSelect: (providerId: string) => void;
  handleAgentSelect: (agent: SelectedAgent | null) => void;
  handleToggleThinking: (enabled: boolean) => void;
  handleStreamingEnabledChange: (enabled: boolean) => void;
  handleSendShortcutChange: (shortcut: 'enter' | 'cmdEnter') => void;
}

export function useChatHandlers(params: UseChatHandlersParams): ChatHandlers {
  const {
    loading,
    sdkStatusLoaded,
    currentSdkInstalled,
    currentProvider,
    selectedClaudeModel,
    claudePermissionMode,
    activeProviderConfig,
    selectedAgent,
    messagesContainerRef,
    isUserAtBottomRef,
    setMessages,
    setLoading,
    setLoadingStartTime,
    setCurrentView,
    setSettingsInitialTab,
    setCurrentProvider,
    setSelectedClaudeModel,
    setPermissionMode,
    setClaudePermissionMode,
    setSelectedAgent,
    setActiveProviderConfig,
    setClaudeSettingsAlwaysThinkingEnabled,
    setStreamingEnabledSetting,
    setSendShortcut,
    addToast,
  } = params;

  const handleSubmit = useCallback((content: string, attachments?: Attachment[]) => {
    const text = content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (!text && !hasAttachments) {
      return;
    }
    if (loading) {
      return;
    }

    if (text.toLowerCase() === '/resume') {
      setCurrentView('history');
      return;
    }
    if (text.toLowerCase() === '/clear') {
      setMessages([]);
      addToast('Conversation cleared', 'info');
      return;
    }

    if (!sdkStatusLoaded) {
      addToast('Checking SDK status...', 'info');
      return;
    }
    if (!currentSdkInstalled) {
      addToast(
        'Claude Code SDK is not installed. Please install the SDK to start chatting. Go to Install',
        'warning'
      );
      setSettingsInitialTab('dependencies');
      setCurrentView('settings');
      return;
    }

    const userContentBlocks: ClaudeContentBlock[] = [];

    if (hasAttachments) {
      for (const att of attachments || []) {
        if (att.mediaType?.startsWith('image/')) {
          userContentBlocks.push({
            type: 'image',
            src: `data:${att.mediaType};base64,${att.data}`,
            mediaType: att.mediaType,
          });
        } else {
          userContentBlocks.push({
            type: 'text',
            text: `[Attachment: ${att.fileName}]`,
          });
        }
      }
    }

    if (text) {
      userContentBlocks.push({ type: 'text', text });
    } else if (userContentBlocks.length === 0) {
      return;
    }

    const userMessage: ClaudeMessage = {
      type: 'user',
      content: text || (hasAttachments ? '[Attachments uploaded]' : ''),
      timestamp: new Date().toISOString(),
      raw: {
        message: {
          content: userContentBlocks,
        },
      },
    };
    setMessages((prev) => [...prev, userMessage]);

    setLoading(true);
    setLoadingStartTime(Date.now());

    isUserAtBottomRef.current = true;
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });

    sendBridgeEvent('set_provider', currentProvider);

    const agentInfo = selectedAgent ? {
      id: selectedAgent.id,
      name: selectedAgent.name,
      prompt: selectedAgent.prompt,
    } : null;

    if (hasAttachments) {
      try {
        const payload = JSON.stringify({
          text,
          attachments: (attachments || []).map(a => ({
            fileName: a.fileName,
            mediaType: a.mediaType,
            data: a.data,
          })),
          agent: agentInfo,
        });
        sendBridgeEvent('send_message_with_attachments', payload);
      } catch (error) {
        console.error('[Frontend] Failed to serialize attachments payload', error);
        const fallbackPayload = JSON.stringify({ text, agent: agentInfo });
        sendBridgeEvent('send_message', fallbackPayload);
      }
    } else {
      const payload = JSON.stringify({ text, agent: agentInfo });
      sendBridgeEvent('send_message', payload);
    }
  }, [
    loading,
    sdkStatusLoaded,
    currentSdkInstalled,
    currentProvider,
    selectedAgent,
    messagesContainerRef,
    isUserAtBottomRef,
    setMessages,
    setLoading,
    setLoadingStartTime,
    setCurrentView,
    setSettingsInitialTab,
    addToast,
  ]);

  const handleModeSelect = useCallback((mode: PermissionMode) => {
    setPermissionMode(mode);
    setClaudePermissionMode(mode);
    sendBridgeEvent('set_mode', mode);
  }, [setPermissionMode, setClaudePermissionMode]);

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedClaudeModel(modelId);
    sendBridgeEvent('set_model', modelId);
  }, [setSelectedClaudeModel]);

  const handleProviderSelect = useCallback((providerId: string) => {
    setCurrentProvider(providerId);
    sendBridgeEvent('set_provider', providerId);
    setPermissionMode(claudePermissionMode);
    sendBridgeEvent('set_mode', claudePermissionMode);
    sendBridgeEvent('set_model', selectedClaudeModel);
  }, [
    selectedClaudeModel,
    claudePermissionMode,
    setCurrentProvider,
    setPermissionMode,
  ]);

  const handleAgentSelect = useCallback((agent: SelectedAgent | null) => {
    setSelectedAgent(agent);
    if (agent) {
      sendBridgeEvent('set_selected_agent', JSON.stringify({
        id: agent.id,
        name: agent.name,
        prompt: agent.prompt,
      }));
    } else {
      sendBridgeEvent('set_selected_agent', '');
    }
  }, [setSelectedAgent]);

  const handleToggleThinking = useCallback((enabled: boolean) => {
    if (!activeProviderConfig) {
      setClaudeSettingsAlwaysThinkingEnabled(enabled);
      sendBridgeEvent('set_thinking_enabled', JSON.stringify({ enabled }));
      addToast(enabled ? 'Thinking enabled' : 'Thinking disabled', 'success');
      return;
    }

    setActiveProviderConfig(prev => prev ? {
      ...prev,
      settingsConfig: {
        ...prev.settingsConfig,
        alwaysThinkingEnabled: enabled
      }
    } : null);

    const payload = JSON.stringify({
      id: activeProviderConfig.id,
      updates: {
        settingsConfig: {
          ...(activeProviderConfig.settingsConfig || {}),
          alwaysThinkingEnabled: enabled
        }
      }
    });
    sendBridgeEvent('update_provider', payload);
    addToast(enabled ? 'Thinking enabled' : 'Thinking disabled', 'success');
  }, [activeProviderConfig, setActiveProviderConfig, setClaudeSettingsAlwaysThinkingEnabled, addToast]);

  const handleStreamingEnabledChange = useCallback((enabled: boolean) => {
    setStreamingEnabledSetting(enabled);
    const payload = { streamingEnabled: enabled };
    sendBridgeEvent('set_streaming_enabled', JSON.stringify(payload));
    addToast(enabled ? 'Enabled' : 'Disabled', 'success');
  }, [setStreamingEnabledSetting, addToast]);

  const handleSendShortcutChange = useCallback((shortcut: 'enter' | 'cmdEnter') => {
    setSendShortcut(shortcut);
    const payload = { sendShortcut: shortcut };
    sendBridgeEvent('set_send_shortcut', JSON.stringify(payload));
  }, [setSendShortcut]);

  return {
    handleSubmit,
    handleModeSelect,
    handleModelSelect,
    handleProviderSelect,
    handleAgentSelect,
    handleToggleThinking,
    handleStreamingEnabledChange,
    handleSendShortcutChange,
  };
}
