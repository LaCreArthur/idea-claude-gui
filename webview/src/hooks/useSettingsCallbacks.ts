import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PermissionMode } from '../components/ChatInputBox/types';
import type { ProviderConfig } from '../types/provider';
import { sendBridgeEvent } from '../utils/bridge';

type SdkStatusRecord = Record<string, { installed?: boolean; status?: string }>;

export interface UseSettingsCallbacksParams {
  setSdkStatus: Dispatch<SetStateAction<SdkStatusRecord>>;
  setSdkStatusLoaded: Dispatch<SetStateAction<boolean>>;

  setUsagePercentage: Dispatch<SetStateAction<number>>;
  setUsageUsedTokens: Dispatch<SetStateAction<number | undefined>>;
  setUsageMaxTokens: Dispatch<SetStateAction<number | undefined>>;

  setPermissionMode: Dispatch<SetStateAction<PermissionMode>>;
  setClaudePermissionMode: Dispatch<SetStateAction<PermissionMode>>;

  setSelectedClaudeModel: Dispatch<SetStateAction<string>>;

  syncActiveProviderModelMapping: (provider?: ProviderConfig | null) => void;
  setProviderConfigVersion: Dispatch<SetStateAction<number>>;
  setActiveProviderConfig: Dispatch<SetStateAction<ProviderConfig | null>>;

  setClaudeSettingsAlwaysThinkingEnabled: Dispatch<SetStateAction<boolean>>;
  setStreamingEnabledSetting: Dispatch<SetStateAction<boolean>>;
  setSendShortcut: Dispatch<SetStateAction<'enter' | 'cmdEnter'>>;
}

export function useSettingsCallbacks({
  setSdkStatus,
  setSdkStatusLoaded,
  setUsagePercentage,
  setUsageUsedTokens,
  setUsageMaxTokens,
  setPermissionMode,
  setClaudePermissionMode,
  setSelectedClaudeModel,
  syncActiveProviderModelMapping,
  setProviderConfigVersion,
  setActiveProviderConfig,
  setClaudeSettingsAlwaysThinkingEnabled,
  setStreamingEnabledSetting,
  setSendShortcut,
}: UseSettingsCallbacksParams): void {
  useEffect(() => {
    const originalUpdateDependencyStatus = window.updateDependencyStatus;
    window.updateDependencyStatus = (jsonStr: string) => {
      try {
        const status = JSON.parse(jsonStr);
        setSdkStatus(status);
        setSdkStatusLoaded(true);
      } catch (error) {
        console.error('[Frontend] Failed to parse SDK status:', error);
        setSdkStatusLoaded(true);
      }
      if (originalUpdateDependencyStatus && originalUpdateDependencyStatus !== window.updateDependencyStatus) {
        originalUpdateDependencyStatus(jsonStr);
      }
    };
    (window as any)._appUpdateDependencyStatus = window.updateDependencyStatus;

    if (window.__pendingDependencyStatus) {
      const pending = window.__pendingDependencyStatus;
      delete window.__pendingDependencyStatus;
      window.updateDependencyStatus?.(pending);
    }

    if (window.sendToJava) {
      window.sendToJava('get_dependency_status:');
    }

    window.onUsageUpdate = (json) => {
      try {
        const data = JSON.parse(json);
        if (typeof data.percentage === 'number') {
          const used = typeof data.usedTokens === 'number' ? data.usedTokens : (typeof data.totalTokens === 'number' ? data.totalTokens : undefined);
          const max = typeof data.maxTokens === 'number' ? data.maxTokens : (typeof data.limit === 'number' ? data.limit : undefined);
          setUsagePercentage(data.percentage);
          setUsageUsedTokens(used);
          setUsageMaxTokens(max);
        }
      } catch (error) {
        console.error('[Frontend] Failed to parse usage update:', error);
      }
    };

    const updateMode = (mode?: PermissionMode) => {
      if (mode === 'default' || mode === 'plan' || mode === 'acceptEdits' || mode === 'bypassPermissions') {
        setPermissionMode(mode);
        setClaudePermissionMode(mode);
      }
    };

    window.onModeChanged = (mode) => updateMode(mode as PermissionMode);
    window.onModeReceived = (mode) => updateMode(mode as PermissionMode);

    window.onModelChanged = (modelId) => {
      setSelectedClaudeModel(modelId);
    };

    window.onModelConfirmed = (modelId) => {
      setSelectedClaudeModel(modelId);
    };

    window.updateActiveProvider = (jsonStr: string) => {
      try {
        const provider: ProviderConfig = JSON.parse(jsonStr);
        syncActiveProviderModelMapping(provider);
        setProviderConfigVersion(prev => prev + 1);
        setActiveProviderConfig(provider);
      } catch (error) {
        console.error('[Frontend] Failed to parse active provider in App:', error);
      }
    };

    window.updateThinkingEnabled = (jsonStr: string) => {
      const trimmed = (jsonStr || '').trim();
      try {
        const data = JSON.parse(trimmed);
        if (typeof data === 'boolean') {
          setClaudeSettingsAlwaysThinkingEnabled(data);
          return;
        }
        if (data && typeof data.enabled === 'boolean') {
          setClaudeSettingsAlwaysThinkingEnabled(data.enabled);
          return;
        }
      } catch {
        if (trimmed === 'true' || trimmed === 'false') {
          setClaudeSettingsAlwaysThinkingEnabled(trimmed === 'true');
        }
      }
    };

    window.updateStreamingEnabled = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        setStreamingEnabledSetting(data.streamingEnabled ?? false);
      } catch (error) {
        console.error('[Frontend] Failed to parse streaming config:', error);
      }
    };

    window.updateSendShortcut = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        setSendShortcut(data.sendShortcut ?? 'enter');
      } catch (error) {
        console.error('[Frontend] Failed to parse send shortcut config:', error);
      }
    };

    const MAX_RETRIES = 30;

    let providerRetryCount = 0;
    const requestActiveProvider = () => {
      if (window.sendToJava) {
        sendBridgeEvent('get_active_provider');
      } else {
        providerRetryCount++;
        if (providerRetryCount < MAX_RETRIES) {
          setTimeout(requestActiveProvider, 100);
        } else {
          console.warn('[Frontend] Failed to get active provider: bridge not available');
        }
      }
    };
    setTimeout(requestActiveProvider, 200);

    let thinkingRetryCount = 0;
    const requestThinkingEnabled = () => {
      if (window.sendToJava) {
        sendBridgeEvent('get_thinking_enabled');
      } else {
        thinkingRetryCount++;
        if (thinkingRetryCount < MAX_RETRIES) {
          setTimeout(requestThinkingEnabled, 100);
        }
      }
    };
    setTimeout(requestThinkingEnabled, 200);

    let streamingRetryCount = 0;
    const requestStreamingEnabled = () => {
      if (window.sendToJava) {
        sendBridgeEvent('get_streaming_enabled');
      } else {
        streamingRetryCount++;
        if (streamingRetryCount < MAX_RETRIES) {
          setTimeout(requestStreamingEnabled, 100);
        }
      }
    };
    setTimeout(requestStreamingEnabled, 200);

    let sendShortcutRetryCount = 0;
    const requestSendShortcut = () => {
      if (window.sendToJava) {
        sendBridgeEvent('get_send_shortcut');
      } else {
        sendShortcutRetryCount++;
        if (sendShortcutRetryCount < MAX_RETRIES) {
          setTimeout(requestSendShortcut, 100);
        }
      }
    };
    setTimeout(requestSendShortcut, 200);

  }, []);
}
