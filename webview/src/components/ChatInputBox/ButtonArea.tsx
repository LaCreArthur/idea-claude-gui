import { useCallback } from 'react';
import type { ButtonAreaProps, ModelInfo, PermissionMode, ReasoningEffort } from './types';
import { ConfigSelect, ModelSelect, ModeSelect, ReasoningSelect } from './selectors';
import { CLAUDE_MODELS, CODEX_MODELS } from './types';

/**
 * ButtonArea - Bottom toolbar component
 */
export const ButtonArea = ({
  disabled = false,
  hasInputContent = false,
  isLoading = false,
  isEnhancing = false,
  selectedModel = 'claude-sonnet-4-5',
  permissionMode = 'bypassPermissions',
  currentProvider = 'claude',
  reasoningEffort = 'medium',
  onSubmit,
  onStop,
  onModeSelect,
  onModelSelect,
  onProviderSelect,
  onReasoningChange,
  onEnhancePrompt,
  alwaysThinkingEnabled = false,
  onToggleThinking,
  streamingEnabled = false,
  onStreamingEnabledChange,
  selectedAgent,
  onAgentSelect,
  onOpenAgentSettings,
}: ButtonAreaProps) => {
  const applyModelMapping = (model: ModelInfo, mapping: { haiku?: string; sonnet?: string; opus?: string }): ModelInfo => {
    const modelKeyMap: Record<string, keyof typeof mapping> = {
      'claude-sonnet-4-5': 'sonnet',
      'claude-opus-4-5-20251101': 'opus',
      'claude-haiku-4-5': 'haiku',
    };

    const key = modelKeyMap[model.id];
    if (key && mapping[key]) {
      const actualModel = String(mapping[key]).trim();
      if (actualModel.length > 0) {
        return { ...model, label: actualModel };
      }
    }
    return model;
  };

  const availableModels = (() => {
    if (currentProvider === 'codex') {
      return CODEX_MODELS;
    }
    if (typeof window === 'undefined' || !window.localStorage) {
      return CLAUDE_MODELS;
    }
    try {
      const stored = window.localStorage.getItem('claude-model-mapping');
      if (!stored) {
        return CLAUDE_MODELS;
      }
      const mapping = JSON.parse(stored) as {
        main?: string;
        haiku?: string;
        sonnet?: string;
        opus?: string;
      };
      return CLAUDE_MODELS.map((m) => applyModelMapping(m, mapping));
    } catch {
      return CLAUDE_MODELS;
    }
  })();

  const handleSubmitClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSubmit?.();
  }, [onSubmit]);

  const handleStopClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStop?.();
  }, [onStop]);

  const handleModeSelect = useCallback((mode: PermissionMode) => {
    onModeSelect?.(mode);
  }, [onModeSelect]);

  const handleModelSelect = useCallback((modelId: string) => {
    onModelSelect?.(modelId);
  }, [onModelSelect]);

  const handleProviderSelect = useCallback((providerId: string) => {
    onProviderSelect?.(providerId);
  }, [onProviderSelect]);

  const handleReasoningChange = useCallback((effort: ReasoningEffort) => {
    onReasoningChange?.(effort);
  }, [onReasoningChange]);

  const handleEnhanceClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onEnhancePrompt?.();
  }, [onEnhancePrompt]);

  return (
    <div className="button-area" data-provider={currentProvider}>
      <div className="button-area-left">
        <ConfigSelect
          currentProvider={currentProvider}
          onProviderChange={handleProviderSelect}
          alwaysThinkingEnabled={alwaysThinkingEnabled}
          onToggleThinking={onToggleThinking}
          streamingEnabled={streamingEnabled}
          onStreamingEnabledChange={onStreamingEnabledChange}
          selectedAgent={selectedAgent}
          onAgentSelect={onAgentSelect}
          onOpenAgentSettings={onOpenAgentSettings}
        />
        <ModeSelect value={permissionMode} onChange={handleModeSelect} provider={currentProvider} />
        <ModelSelect value={selectedModel} onChange={handleModelSelect} models={availableModels} currentProvider={currentProvider} />
        {currentProvider === 'codex' && (
          <ReasoningSelect value={reasoningEffort} onChange={handleReasoningChange} />
        )}
      </div>

      <div className="button-area-right">
        <div className="button-divider" />

        <button
          className="enhance-prompt-button has-tooltip"
          onClick={handleEnhanceClick}
          disabled={disabled || !hasInputContent || isLoading || isEnhancing}
          data-tooltip="Enhance prompt (⌘P)"
        >
          <span className={`codicon ${isEnhancing ? 'codicon-loading codicon-modifier-spin' : 'codicon-sparkle'}`} />
        </button>

        {isLoading ? (
          <button
            className="submit-button stop-button"
            onClick={handleStopClick}
            title="Stop generation"
          >
            <span className="codicon codicon-debug-stop" />
          </button>
        ) : (
          <button
            className="submit-button"
            onClick={handleSubmitClick}
            disabled={disabled || !hasInputContent}
            title="Send message (Enter)"
          >
            <span className="codicon codicon-send" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ButtonArea;
