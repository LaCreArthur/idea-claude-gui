interface Window {
  sendToJava?: (message: string) => void;

  getClipboardFilePath?: () => Promise<string>;

  handleFilePathFromJava?: (filePath: string) => void;

  updateMessages?: (json: string) => void;

  updateStatus?: (text: string) => void;

  showLoading?: (value: string | boolean) => void;

  showThinkingStatus?: (value: string | boolean) => void;

  setHistoryData?: (data: any) => void;

  onExportSessionData?: (json: string) => void;

  clearMessages?: () => void;

  addErrorMessage?: (message: string) => void;

  addHistoryMessage?: (message: any) => void;

  addUserMessage?: (content: string) => void;

  setSessionId?: (sessionId: string) => void;

  addToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;

  onUsageUpdate?: (json: string) => void;

  onModeChanged?: (mode: string) => void;

  onModeReceived?: (mode: string) => void;

  onModelChanged?: (modelId: string) => void;

  onModelConfirmed?: (modelId: string, provider: string) => void;

  showPermissionDialog?: (json: string) => void;

  showAskUserQuestionDialog?: (json: string) => void;

  showPlanApprovalDialog?: (json: string) => void;

  addSelectionInfo?: (selectionInfo: string) => void;

  addCodeSnippet?: (selectionInfo: string) => void;

  insertCodeSnippetAtCursor?: (selectionInfo: string) => void;

  clearSelectionInfo?: () => void;

  onFileListResult?: (json: string) => void;

  onCommandListResult?: (json: string) => void;

  updateMcpServers?: (json: string) => void;

  updateMcpServerStatus?: (json: string) => void;

  mcpServerToggled?: (json: string) => void;

  updateProviders?: (json: string) => void;

  updateActiveProvider?: (providerId: string) => void;

  updateThinkingEnabled?: (json: string) => void;

  updateStreamingEnabled?: (json: string) => void;

  updateSendShortcut?: (json: string) => void;

  updateCurrentClaudeConfig?: (json: string) => void;

  showError?: (message: string) => void;

  showSwitchSuccess?: (message: string) => void;

  updateNodePath?: (path: string) => void;

  updateWorkingDirectory?: (json: string) => void;

  showSuccess?: (message: string) => void;

  updateSkills?: (json: string) => void;

  skillImportResult?: (json: string) => void;

  skillDeleteResult?: (json: string) => void;

  skillToggleResult?: (json: string) => void;

  updateUsageStatistics?: (json: string) => void;

  updateSlashCommands?: (json: string) => void;

  __pendingSlashCommands?: string;

  __pendingSessionId?: string;

  applyIdeaFontConfig?: (config: {
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
    fallbackFonts?: string[];
  }) => void;

  __pendingFontConfig?: {
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
    fallbackFonts?: string[];
  };

  onEditorFontConfigReceived?: (json: string) => void;

  updateAgents?: (json: string) => void;

  agentOperationResult?: (json: string) => void;

  onSelectedAgentReceived?: (json: string) => void;

  onSelectedAgentChanged?: (json: string) => void;

  onStreamStart?: () => void;

  onContentDelta?: (delta: string) => void;

  onThinkingDelta?: (delta: string) => void;

  onStreamEnd?: () => void;

  onRewindResult?: (json: string) => void;

  updateDependencyStatus?: (json: string) => void;

  dependencyInstallProgress?: (json: string) => void;

  dependencyInstallResult?: (json: string) => void;

  dependencyUninstallResult?: (json: string) => void;

  nodeEnvironmentStatus?: (json: string) => void;

  dependencyUpdateAvailable?: (json: string) => void;

  __pendingDependencyUpdates?: string;

  __pendingDependencyStatus?: string;

  updateAuthStatus?: (json: string) => void;
  __pendingAuthStatus?: string;

  __pendingUserMessage?: string;

  __pendingLoadingState?: boolean;

  __testMode?: boolean;

  __testMessageLog?: Array<{ ts: number; dir: 'in' | 'out'; msg: string }>;

  __testCallbackRegistry?: Map<string, boolean>;

  __originalSendToJava?: (message: string) => void;

  __testBridge?: {
    getMessageLog: () => Array<{ ts: number; dir: 'in' | 'out'; msg: string }>;
    clearLog: () => void;
    waitForMessage: (typePrefix: string, timeoutMs?: number) => Promise<string>;
    waitForCondition: (predicate: (msg: string) => boolean, timeoutMs?: number) => Promise<string>;
  };
}
