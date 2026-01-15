/**
 * Provider configuration type definitions
 */

/**
 * Provider configuration (simplified for current project)
 */
export interface ProviderConfig {
  id: string;
  name: string;
  remark?: string;
  websiteUrl?: string;
  category?: ProviderCategory;
  createdAt?: number;
  isActive?: boolean;
  isLocalProvider?: boolean;
  settingsConfig?: {
    env?: {
      ANTHROPIC_AUTH_TOKEN?: string;
      ANTHROPIC_BASE_URL?: string;
      ANTHROPIC_MODEL?: string;
      ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
      ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
      ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
      [key: string]: any;
    };
    alwaysThinkingEnabled?: boolean;
    permissions?: {
      allow?: string[];
      deny?: string[];
    };
  };
}

/**
 * Provider category
 */
export type ProviderCategory =
  | 'official'      // Official
  | 'cn_official'   // Chinese Official
  | 'aggregator'    // Aggregator Service
  | 'third_party'   // Third Party
  | 'custom';       // Custom
