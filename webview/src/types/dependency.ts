export type SdkId = 'claude-sdk';

export type SdkInstallStatus = 'installed' | 'not_installed' | 'installing' | 'error';

export interface SdkStatus {
  id: SdkId;
  name: string;
  status: SdkInstallStatus;
  installedVersion?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  installPath?: string;
  description?: string;
  lastChecked?: string;
  errorMessage?: string;
}

export interface DependencyStatus {
  [key: string]: SdkStatus;
}

export interface InstallProgress {
  sdkId: SdkId;
  log: string;
}

export interface InstallResult {
  success: boolean;
  sdkId: SdkId;
  installedVersion?: string;
  error?: string;
  logs?: string;
}

export interface UninstallResult {
  success: boolean;
  sdkId: SdkId;
  error?: string;
}

export interface UpdateInfo {
  sdkId: SdkId;
  sdkName: string;
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

export interface UpdateCheckResult {
  [key: string]: UpdateInfo;
}

export interface NodeEnvironmentStatus {
  available: boolean;
  error?: string;
}

export interface SdkDefinition {
  id: SdkId;
  name: string;
  description: string;
  relatedProviders: string[];
}

export const SDK_DEFINITIONS: SdkDefinition[] = [
  {
    id: 'claude-sdk',
    name: 'Claude Code SDK',
    description: 'Required for Claude AI provider. Contains @anthropic-ai/claude-agent-sdk and related dependencies.',
    relatedProviders: ['anthropic', 'bedrock'],
  },
];
