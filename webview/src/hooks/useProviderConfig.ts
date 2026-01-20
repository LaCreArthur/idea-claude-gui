import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PermissionMode } from '../components/ChatInputBox/types';
import { CLAUDE_MODELS } from '../components/ChatInputBox/types';
import type { ProviderConfig } from '../types/provider';

export interface UseProviderConfigReturn {
  // State
  currentProvider: string;
  setCurrentProvider: Dispatch<SetStateAction<string>>;
  selectedClaudeModel: string;
  setSelectedClaudeModel: Dispatch<SetStateAction<string>>;
  claudePermissionMode: PermissionMode;
  setClaudePermissionMode: Dispatch<SetStateAction<PermissionMode>>;
  permissionMode: PermissionMode;
  setPermissionMode: Dispatch<SetStateAction<PermissionMode>>;
  activeProviderConfig: ProviderConfig | null;
  setActiveProviderConfig: Dispatch<SetStateAction<ProviderConfig | null>>;
  claudeSettingsAlwaysThinkingEnabled: boolean;
  setClaudeSettingsAlwaysThinkingEnabled: Dispatch<SetStateAction<boolean>>;

  // Ref
  currentProviderRef: React.MutableRefObject<string>;

  // Helper
  syncActiveProviderModelMapping: (provider?: ProviderConfig | null) => void;
}

/**
 * Custom hook to manage provider and model configuration state.
 * Consolidates provider-related state in one place for easier maintenance.
 */
export function useProviderConfig(): UseProviderConfigReturn {
  // Provider state
  const [currentProvider, setCurrentProvider] = useState('claude');
  const [selectedClaudeModel, setSelectedClaudeModel] = useState(CLAUDE_MODELS[0].id);
  const [claudePermissionMode, setClaudePermissionMode] = useState<PermissionMode>('default');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [activeProviderConfig, setActiveProviderConfig] = useState<ProviderConfig | null>(null);
  const [claudeSettingsAlwaysThinkingEnabled, setClaudeSettingsAlwaysThinkingEnabled] = useState(true);

  // Ref to avoid stale closures in callbacks
  const currentProviderRef = useRef(currentProvider);

  // Keep ref in sync with state
  useEffect(() => {
    currentProviderRef.current = currentProvider;
  }, [currentProvider]);

  /**
   * Sync provider model mapping to localStorage.
   * Used for persisting ANTHROPIC_MODEL settings.
   */
  const syncActiveProviderModelMapping = (provider?: ProviderConfig | null) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!provider || !provider.settingsConfig || !provider.settingsConfig.env) {
      try {
        window.localStorage.removeItem('claude-model-mapping');
      } catch {
        // Ignore localStorage errors
      }
      return;
    }
    const env = provider.settingsConfig.env as Record<string, unknown>;
    const mapping = {
      main: (env.ANTHROPIC_MODEL as string) ?? '',
      haiku: (env.ANTHROPIC_DEFAULT_HAIKU_MODEL as string) ?? '',
      sonnet: (env.ANTHROPIC_DEFAULT_SONNET_MODEL as string) ?? '',
      opus: (env.ANTHROPIC_DEFAULT_OPUS_MODEL as string) ?? '',
    };
    const hasValue = Object.values(mapping).some(v => v && String(v).trim().length > 0);
    try {
      if (hasValue) {
        window.localStorage.setItem('claude-model-mapping', JSON.stringify(mapping));
      } else {
        window.localStorage.removeItem('claude-model-mapping');
      }
    } catch {
      // Ignore localStorage errors
    }
  };

  return {
    // State
    currentProvider,
    setCurrentProvider,
    selectedClaudeModel,
    setSelectedClaudeModel,
    claudePermissionMode,
    setClaudePermissionMode,
    permissionMode,
    setPermissionMode,
    activeProviderConfig,
    setActiveProviderConfig,
    claudeSettingsAlwaysThinkingEnabled,
    setClaudeSettingsAlwaysThinkingEnabled,

    // Ref
    currentProviderRef,

    // Helper
    syncActiveProviderModelMapping,
  };
}
