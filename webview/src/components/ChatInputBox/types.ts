export interface Attachment {
  id: string;
  fileName: string;
  mediaType: string;
  data: string;
}

export interface CodeSnippet {
  id: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export const IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export function isImageAttachment(attachment: Attachment): boolean {
  return IMAGE_MEDIA_TYPES.includes(attachment.mediaType as ImageMediaType);
}

export type CompletionType =
  | 'file'
  | 'directory'
  | 'command'
  | 'agent'
  | 'info'
  | 'separator'
  | 'section-header';

export interface DropdownItemData {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  type: CompletionType;
  checked?: boolean;
  data?: Record<string, unknown>;
}

export interface FileItem {
  name: string;
  path: string;
  absolutePath?: string;
  type: 'file' | 'directory';
  extension?: string;
}

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category?: string;
}

export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TriggerQuery {
  trigger: string;
  query: string;
  start: number;
  end: number;
}

export interface SelectedAgent {
  id: string;
  name: string;
  prompt?: string;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface ModeInfo {
  id: PermissionMode;
  label: string;
  icon: string;
  disabled?: boolean;
  tooltip?: string;
  description?: string;
}

export const AVAILABLE_MODES: ModeInfo[] = [
  {
    id: 'default',
    label: 'Default Mode',
    icon: 'codicon-comment-discussion',
    tooltip: 'Standard permission behavior',
    description: 'Requires manual confirmation for each action'
  },
  {
    id: 'plan',
    label: 'Plan Mode',
    icon: 'codicon-tasklist',
    tooltip: 'Plan mode - Claude plans first, executes after approval',
    description: 'Claude analyzes and creates a plan before execution'
  },
  {
    id: 'acceptEdits',
    label: 'Agent Mode',
    icon: 'codicon-robot',
    tooltip: 'Auto-accept file edits',
    description: 'Automatically accepts file creation/edits'
  },
  {
    id: 'bypassPermissions',
    label: 'Auto Mode',
    icon: 'codicon-zap',
    tooltip: 'Bypass all permission checks',
    description: 'Fully automated, bypasses all permission checks [Use with caution]'
  },
];

export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
}

export const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-sonnet-4-5',
    label: 'Sonnet 4.5',
    description: 'Sonnet 4.5 · Use the default model',
  },
  {
    id: 'claude-opus-4-5-20251101',
    label: 'Opus 4.5',
    description: 'Opus 4.5 · Most capable for complex work',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    description: 'Haiku 4.5 · Fastest for quick answers',
  },
];

export const AVAILABLE_MODELS = CLAUDE_MODELS;

export interface ProviderInfo {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}

export const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  { id: 'claude', label: 'Claude Code', icon: 'codicon-terminal', enabled: true },
];

export interface UsageInfo {
  percentage: number;
  used?: number;
  total?: number;
}

export interface ChatInputBoxProps {
  isLoading?: boolean;
  selectedModel?: string;
  permissionMode?: PermissionMode;
  currentProvider?: string;
  usagePercentage?: number;
  usageUsedTokens?: number;
  usageMaxTokens?: number;
  showUsage?: boolean;
  alwaysThinkingEnabled?: boolean;
  attachments?: Attachment[];
  placeholder?: string;
  disabled?: boolean;
  value?: string;

  activeFile?: string;
  selectedLines?: string;

  onClearContext?: () => void;
  onRemoveCodeSnippet?: (id: string) => void;

  onSubmit?: (content: string, attachments?: Attachment[]) => void;
  onStop?: () => void;
  onInput?: (content: string) => void;
  onAddAttachment?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  onModeSelect?: (mode: PermissionMode) => void;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (providerId: string) => void;
  onToggleThinking?: (enabled: boolean) => void;
  streamingEnabled?: boolean;
  onStreamingEnabledChange?: (enabled: boolean) => void;

  sendShortcut?: 'enter' | 'cmdEnter';

  selectedAgent?: SelectedAgent | null;
  onAgentSelect?: (agent: SelectedAgent | null) => void;
  onClearAgent?: () => void;
  onOpenAgentSettings?: () => void;

  hasMessages?: boolean;
  onRewind?: () => void;

  sdkInstalled?: boolean;
  sdkStatusLoading?: boolean;
  onInstallSdk?: () => void;
  addToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export interface ButtonAreaProps {
  disabled?: boolean;
  hasInputContent?: boolean;
  isLoading?: boolean;
  selectedModel?: string;
  permissionMode?: PermissionMode;
  currentProvider?: string;

  onSubmit?: () => void;
  onStop?: () => void;
  onModeSelect?: (mode: PermissionMode) => void;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (providerId: string) => void;
  alwaysThinkingEnabled?: boolean;
  onToggleThinking?: (enabled: boolean) => void;
  streamingEnabled?: boolean;
  onStreamingEnabledChange?: (enabled: boolean) => void;
  selectedAgent?: SelectedAgent | null;
  onAgentSelect?: (agent: SelectedAgent) => void;
  onClearAgent?: () => void;
  onOpenAgentSettings?: () => void;
}

export interface DropdownProps {
  isVisible: boolean;
  position: DropdownPosition | null;
  width?: number;
  offsetY?: number;
  offsetX?: number;
  selectedIndex?: number;
  onClose?: () => void;
  children: React.ReactNode;
}

export interface TokenIndicatorProps {
  percentage: number;
  size?: number;
  usedTokens?: number;
  maxTokens?: number;
}

export interface AttachmentListProps {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  onPreview?: (attachment: Attachment) => void;
}

export interface DropdownItemProps {
  item: DropdownItemData;
  isActive?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}
