import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PermissionMode } from '../components/ChatInputBox/types';
import { CLAUDE_MODELS } from '../components/ChatInputBox/types';
import type { ProviderConfig } from '../types/provider';

export interface UseProviderConfigReturn {
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

  currentProviderRef: React.MutableRefObject<string>;

  syncActiveProviderModelMapping: (provider?: ProviderConfig | null) => void;
}

export function useProviderConfig(): UseProviderConfigReturn {
  const [currentProvider, setCurrentProvider] = useState('claude');
  const [selectedClaudeModel, setSelectedClaudeModel] = useState(CLAUDE_MODELS[0].id);
  const [claudePermissionMode, setClaudePermissionMode] = useState<PermissionMode>('default');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [activeProviderConfig, setActiveProviderConfig] = useState<ProviderConfig | null>(null);
  const [claudeSettingsAlwaysThinkingEnabled, setClaudeSettingsAlwaysThinkingEnabled] = useState(true);

  const currentProviderRef = useRef(currentProvider);

  useEffect(() => {
    currentProviderRef.current = currentProvider;
  }, [currentProvider]);

  const syncActiveProviderModelMapping = (provider?: ProviderConfig | null) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!provider || !provider.settingsConfig || !provider.settingsConfig.env) {
      try {
        window.localStorage.removeItem('claude-model-mapping');
      } catch {
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
    }
  };

  return {
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

    currentProviderRef,

    syncActiveProviderModelMapping,
  };
}
