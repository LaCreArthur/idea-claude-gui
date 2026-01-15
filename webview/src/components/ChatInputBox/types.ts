/**
 * Input box component type definitions
 */

// ============================================================
// Core Entity Types
// ============================================================

/**
 * File attachment
 */
export interface Attachment {
  /** Unique identifier */
  id: string;
  /** Original filename */
  fileName: string;
  /** MIME type */
  mediaType: string;
  /** Base64 encoded content */
  data: string;
}

/**
 * Code snippet (from editor selection)
 */
export interface CodeSnippet {
  /** Unique identifier */
  id: string;
  /** File path (relative) */
  filePath: string;
  /** Start line number */
  startLine?: number;
  /** End line number */
  endLine?: number;
}

/**
 * Image media type constants
 */
export const IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/**
 * Check if attachment is an image
 */
export function isImageAttachment(attachment: Attachment): boolean {
  return IMAGE_MEDIA_TYPES.includes(attachment.mediaType as ImageMediaType);
}

// ============================================================
// Completion System Types
// ============================================================

/**
 * Completion item type
 */
export type CompletionType =
  | 'file'
  | 'directory'
  | 'command'
  | 'agent'
  | 'info'
  | 'separator'
  | 'section-header';

/**
 * Dropdown item data
 */
export interface DropdownItemData {
  /** Unique identifier */
  id: string;
  /** Display text */
  label: string;
  /** Description text */
  description?: string;
  /** Icon class name */
  icon?: string;
  /** Item type */
  type: CompletionType;
  /** Whether selected (for selectors) */
  checked?: boolean;
  /** Associated data */
  data?: Record<string, unknown>;
}

/**
 * File item (from Java)
 */
export interface FileItem {
  /** Filename */
  name: string;
  /** Relative path */
  path: string;
  /** Absolute path (optional) */
  absolutePath?: string;
  /** Type */
  type: 'file' | 'directory';
  /** Extension */
  extension?: string;
}

/**
 * Command item (from Java)
 */
export interface CommandItem {
  /** Command identifier */
  id: string;
  /** Display name */
  label: string;
  /** Description */
  description?: string;
  /** Category */
  category?: string;
}

/**
 * Dropdown position
 */
export interface DropdownPosition {
  /** Top coordinate (px) */
  top: number;
  /** Left coordinate (px) */
  left: number;
  /** Width (px) */
  width: number;
  /** Height (px) */
  height: number;
}

/**
 * Trigger query info
 */
export interface TriggerQuery {
  /** Trigger symbol ('@' or '/' or '#') */
  trigger: string;
  /** Search keyword */
  query: string;
  /** Character offset of trigger symbol */
  start: number;
  /** Character offset of query end */
  end: number;
}

/**
 * Selected agent info
 */
export interface SelectedAgent {
  id: string;
  name: string;
  prompt?: string;
}

// ============================================================
// Mode and Model Types
// ============================================================

/**
 * Permission mode for conversations
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/**
 * Mode information
 */
export interface ModeInfo {
  id: PermissionMode;
  label: string;
  icon: string;
  disabled?: boolean;
  tooltip?: string;
  description?: string;
}

/**
 * Available modes
 */
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

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
}

/**
 * Claude model list
 */
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

/**
 * Available models (Claude only)
 */
export const AVAILABLE_MODELS = CLAUDE_MODELS;

/**
 * AI provider information
 */
export interface ProviderInfo {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}

/**
 * Available providers (Claude only)
 */
export const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  { id: 'claude', label: 'Claude Code', icon: 'codicon-terminal', enabled: true },
];

// ============================================================
// Usage Types
// ============================================================

/**
 * Usage information
 */
export interface UsageInfo {
  /** Usage percentage (0-100) */
  percentage: number;
  /** Used amount */
  used?: number;
  /** Total amount */
  total?: number;
}

// ============================================================
// Component Props Types
// ============================================================

/**
 * ChatInputBox component props
 */
export interface ChatInputBoxProps {
  /** Whether loading */
  isLoading?: boolean;
  /** Current model */
  selectedModel?: string;
  /** Current mode */
  permissionMode?: PermissionMode;
  /** Current provider */
  currentProvider?: string;
  /** Usage percentage */
  usagePercentage?: number;
  /** Used context tokens */
  usageUsedTokens?: number;
  /** Max context tokens */
  usageMaxTokens?: number;
  /** Whether to show usage */
  showUsage?: boolean;
  /** Whether always-thinking is enabled */
  alwaysThinkingEnabled?: boolean;
  /** Attachment list */
  attachments?: Attachment[];
  /** Placeholder text */
  placeholder?: string;
  /** Whether disabled */
  disabled?: boolean;
  /** Controlled mode: input content */
  value?: string;

  /** Current active file */
  activeFile?: string;
  /** Selected lines info (e.g., "L10-20") */
  selectedLines?: string;

  /** Clear context callback */
  onClearContext?: () => void;
  /** Remove code snippet callback */
  onRemoveCodeSnippet?: (id: string) => void;

  // Event callbacks
  /** Submit message */
  onSubmit?: (content: string, attachments?: Attachment[]) => void;
  /** Stop generation */
  onStop?: () => void;
  /** Input change */
  onInput?: (content: string) => void;
  /** Add attachment */
  onAddAttachment?: (files: FileList) => void;
  /** Remove attachment */
  onRemoveAttachment?: (id: string) => void;
  /** Switch mode */
  onModeSelect?: (mode: PermissionMode) => void;
  /** Switch model */
  onModelSelect?: (modelId: string) => void;
  /** Switch provider */
  onProviderSelect?: (providerId: string) => void;
  /** Toggle thinking mode */
  onToggleThinking?: (enabled: boolean) => void;
  /** Whether streaming is enabled */
  streamingEnabled?: boolean;
  /** Toggle streaming */
  onStreamingEnabledChange?: (enabled: boolean) => void;

  /** Send shortcut setting: 'enter' = Enter to send | 'cmdEnter' = Cmd/Ctrl+Enter to send */
  sendShortcut?: 'enter' | 'cmdEnter';

  /** Current selected agent */
  selectedAgent?: SelectedAgent | null;
  /** Select agent callback */
  onAgentSelect?: (agent: SelectedAgent | null) => void;
  /** Clear agent callback */
  onClearAgent?: () => void;
  /** Open agent settings callback */
  onOpenAgentSettings?: () => void;

  /** Whether there are messages (for rewind button) */
  hasMessages?: boolean;
  /** Rewind files callback */
  onRewind?: () => void;

  /** SDK installed status (to disable asking when not installed) */
  sdkInstalled?: boolean;
  /** SDK status loading */
  sdkStatusLoading?: boolean;
  /** Go to install SDK callback */
  onInstallSdk?: () => void;
  /** Show toast notification */
  addToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * ButtonArea component props
 */
export interface ButtonAreaProps {
  /** Whether submit is disabled */
  disabled?: boolean;
  /** Whether there is input content */
  hasInputContent?: boolean;
  /** Whether in conversation */
  isLoading?: boolean;
  /** Current model */
  selectedModel?: string;
  /** Current mode */
  permissionMode?: PermissionMode;
  /** Current provider */
  currentProvider?: string;

  // Event callbacks
  onSubmit?: () => void;
  onStop?: () => void;
  onModeSelect?: (mode: PermissionMode) => void;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (providerId: string) => void;
  /** Whether always-thinking is enabled */
  alwaysThinkingEnabled?: boolean;
  /** Toggle thinking mode */
  onToggleThinking?: (enabled: boolean) => void;
  /** Whether streaming is enabled */
  streamingEnabled?: boolean;
  /** Toggle streaming */
  onStreamingEnabledChange?: (enabled: boolean) => void;
  /** Current selected agent */
  selectedAgent?: SelectedAgent | null;
  /** Agent selection callback */
  onAgentSelect?: (agent: SelectedAgent) => void;
  /** Clear agent callback */
  onClearAgent?: () => void;
  /** Open agent settings callback */
  onOpenAgentSettings?: () => void;
}

/**
 * Dropdown component props
 */
export interface DropdownProps {
  /** Whether visible */
  isVisible: boolean;
  /** Position info */
  position: DropdownPosition | null;
  /** Width */
  width?: number;
  /** Y offset */
  offsetY?: number;
  /** X offset */
  offsetX?: number;
  /** Selected index */
  selectedIndex?: number;
  /** Close callback */
  onClose?: () => void;
  /** Children */
  children: React.ReactNode;
}

/**
 * TokenIndicator component props
 */
export interface TokenIndicatorProps {
  /** Percentage (0-100) */
  percentage: number;
  /** Size */
  size?: number;
  /** Used context tokens */
  usedTokens?: number;
  /** Max context tokens */
  maxTokens?: number;
}

/**
 * AttachmentList component props
 */
export interface AttachmentListProps {
  /** Attachment list */
  attachments: Attachment[];
  /** Remove attachment callback */
  onRemove?: (id: string) => void;
  /** Preview image callback */
  onPreview?: (attachment: Attachment) => void;
}

/**
 * DropdownItem component props
 */
export interface DropdownItemProps {
  /** Item data */
  item: DropdownItemData;
  /** Whether highlighted */
  isActive?: boolean;
  /** Click callback */
  onClick?: () => void;
  /** Mouse enter callback */
  onMouseEnter?: () => void;
}
