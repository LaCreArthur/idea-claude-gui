import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PermissionMode } from '../components/ChatInputBox/types';
import type { ProviderConfig } from '../types/provider';
import { sendBridgeEvent } from '../utils/bridge';

/** SDK status record as used in App.tsx */
type SdkStatusRecord = Record<string, { installed?: boolean; status?: string }>;

export interface UseSettingsCallbacksParams {
  // SDK status setters
  setSdkStatus: Dispatch<SetStateAction<SdkStatusRecord>>;
  setSdkStatusLoaded: Dispatch<SetStateAction<boolean>>;

  // Usage setters
  setUsagePercentage: Dispatch<SetStateAction<number>>;
  setUsageUsedTokens: Dispatch<SetStateAction<number | undefined>>;
  setUsageMaxTokens: Dispatch<SetStateAction<number | undefined>>;

  // Mode setters
  setPermissionMode: Dispatch<SetStateAction<PermissionMode>>;
  setClaudePermissionMode: Dispatch<SetStateAction<PermissionMode>>;

  // Model setters
  setSelectedClaudeModel: Dispatch<SetStateAction<string>>;

  // Provider setters
  syncActiveProviderModelMapping: (provider?: ProviderConfig | null) => void;
  setProviderConfigVersion: Dispatch<SetStateAction<number>>;
  setActiveProviderConfig: Dispatch<SetStateAction<ProviderConfig | null>>;

  // Thinking/streaming setters
  setClaudeSettingsAlwaysThinkingEnabled: Dispatch<SetStateAction<boolean>>;
  setStreamingEnabledSetting: Dispatch<SetStateAction<boolean>>;
  setSendShortcut: Dispatch<SetStateAction<'enter' | 'cmdEnter'>>;
}

/**
 * Custom hook to handle settings-related window callbacks and initialization.
 * Extracts SDK status, usage, mode, model, provider, and streaming callbacks from App.tsx.
 */
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
    // === SDK Status Callback ===
    // Uses decorator pattern to preserve original callback from DependencySection
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
      // Call original callback (from DependencySection) if it exists
      if (originalUpdateDependencyStatus && originalUpdateDependencyStatus !== window.updateDependencyStatus) {
        originalUpdateDependencyStatus(jsonStr);
      }
    };
    // Save App's callback reference for DependencySection to use
    (window as any)._appUpdateDependencyStatus = window.updateDependencyStatus;

    // Handle pending SDK status (backend may return before React initializes)
    if (window.__pendingDependencyStatus) {
      const pending = window.__pendingDependencyStatus;
      delete window.__pendingDependencyStatus;
      window.updateDependencyStatus?.(pending);
    }

    // Request initial SDK status
    if (window.sendToJava) {
      window.sendToJava('get_dependency_status:');
    }

    // === Usage Callback ===
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

    // === Mode Callbacks ===
    const updateMode = (mode?: PermissionMode) => {
      if (mode === 'default' || mode === 'plan' || mode === 'acceptEdits' || mode === 'bypassPermissions') {
        setPermissionMode(mode);
        setClaudePermissionMode(mode);
      }
    };

    window.onModeChanged = (mode) => updateMode(mode as PermissionMode);
    window.onModeReceived = (mode) => updateMode(mode as PermissionMode);

    // === Model Callbacks ===
    window.onModelChanged = (modelId) => {
      setSelectedClaudeModel(modelId);
    };

    window.onModelConfirmed = (modelId) => {
      setSelectedClaudeModel(modelId);
    };

    // === Provider Callback ===
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

    // === Thinking Enabled Callback ===
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

    // === Streaming Enabled Callback ===
    window.updateStreamingEnabled = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        setStreamingEnabledSetting(data.streamingEnabled ?? false);
      } catch (error) {
        console.error('[Frontend] Failed to parse streaming config:', error);
      }
    };

    // === Send Shortcut Callback ===
    window.updateSendShortcut = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        setSendShortcut(data.sendShortcut ?? 'enter');
      } catch (error) {
        console.error('[Frontend] Failed to parse send shortcut config:', error);
      }
    };

    // === Initialization Requests with Retry Logic ===
    const MAX_RETRIES = 30;

    // Request active provider
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

    // Request thinking enabled
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

    // Request streaming enabled
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

    // Request send shortcut
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

  }, []); // Empty deps - runs once on mount
}
