/**
 * SDK dependency type definitions
 *
 * SDK dependency installation location: ~/.codemoss/dependencies/
 * - claude-sdk: Claude SDK (@anthropic-ai/claude-agent-sdk and dependencies)
 *
 * Supported operations:
 * - Install/uninstall SDK
 * - Check for updates
 * - View installation status
 */

/**
 * SDK ID type
 */
export type SdkId = 'claude-sdk';

/**
 * SDK installation status
 */
export type SdkInstallStatus = 'installed' | 'not_installed' | 'installing' | 'error';

/**
 * Single SDK status info
 */
export interface SdkStatus {
  /** SDK unique identifier */
  id: SdkId;
  /** SDK display name */
  name: string;
  /** Installation status */
  status: SdkInstallStatus;
  /** Installed version (empty if not installed) */
  installedVersion?: string;
  /** Latest available version */
  latestVersion?: string;
  /** Whether update is available */
  hasUpdate?: boolean;
  /** Installation path */
  installPath?: string;
  /** Description */
  description?: string;
  /** Last check time */
  lastChecked?: string;
  /** Error message (when status is error) */
  errorMessage?: string;
}

/**
 * All SDK status mapping
 */
export interface DependencyStatus {
  [key: string]: SdkStatus;
}

/**
 * Installation progress info
 */
export interface InstallProgress {
  /** SDK ID */
  sdkId: SdkId;
  /** Log output */
  log: string;
}

/**
 * Installation result
 */
export interface InstallResult {
  /** Whether successful */
  success: boolean;
  /** SDK ID */
  sdkId: SdkId;
  /** Installed version (on success) */
  installedVersion?: string;
  /** Error message (on failure) */
  error?: string;
  /** Installation logs */
  logs?: string;
}

/**
 * Uninstall result
 */
export interface UninstallResult {
  /** Whether successful */
  success: boolean;
  /** SDK ID */
  sdkId: SdkId;
  /** Error message (on failure) */
  error?: string;
}

/**
 * Update info
 */
export interface UpdateInfo {
  /** SDK ID */
  sdkId: SdkId;
  /** SDK name */
  sdkName: string;
  /** Whether update available */
  hasUpdate: boolean;
  /** Current version */
  currentVersion?: string;
  /** Latest version */
  latestVersion?: string;
  /** Error message */
  error?: string;
}

/**
 * Update check result
 */
export interface UpdateCheckResult {
  [key: string]: UpdateInfo;
}

/**
 * Node.js environment status
 */
export interface NodeEnvironmentStatus {
  /** Whether available */
  available: boolean;
  /** Error message */
  error?: string;
}

/**
 * SDK definition (for UI display)
 */
export interface SdkDefinition {
  /** SDK ID */
  id: SdkId;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Related providers (for feature association) */
  relatedProviders: string[];
}

/**
 * Predefined SDK list
 */
export const SDK_DEFINITIONS: SdkDefinition[] = [
  {
    id: 'claude-sdk',
    name: 'Claude Code SDK',
    description: 'Required for Claude AI provider. Contains @anthropic-ai/claude-agent-sdk and related dependencies.',
    relatedProviders: ['anthropic', 'bedrock'],
  },
];
