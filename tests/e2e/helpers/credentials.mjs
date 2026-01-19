/**
 * E2E Test Credentials Helper
 *
 * Loads test credentials from environment variables and detects CLI session.
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CLAUDE_CONFIG_DIR = join(homedir(), '.claude');
const SETTINGS_PATH = join(CLAUDE_CONFIG_DIR, 'settings.json');

/**
 * Load E2E test API key from environment variable
 * @returns {string|null} API key or null if not set
 */
export function loadTestApiKey() {
  const apiKey = process.env.E2E_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  // Basic validation
  if (!apiKey.startsWith('sk-ant-')) {
    console.warn('Warning: E2E_ANTHROPIC_API_KEY does not look like a valid Anthropic API key');
  }
  return apiKey;
}

/**
 * Check if there's an active CLI session (claude login)
 * This checks for the existence of auth tokens in keychain/credential store
 * @returns {Promise<boolean>} true if CLI session exists
 */
export async function hasCliSession() {
  try {
    // Check if settings.json exists (indicates CLI was used)
    if (!existsSync(SETTINGS_PATH)) {
      return false;
    }

    // The presence of settings.json with certain fields indicates a session
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));

    // If there's no explicit API key and settings exist, likely using CLI session
    // The actual auth token is stored in system keychain, not in settings.json
    // We can't easily check keychain, so we assume session exists if settings exist
    // and there's no ANTHROPIC_API_KEY in env settings
    const hasApiKeyInSettings = settings.env?.ANTHROPIC_API_KEY;

    // If no API key in settings, likely using CLI session auth
    return !hasApiKeyInSettings;
  } catch (e) {
    return false;
  }
}

/**
 * Get credential status summary
 * @returns {Promise<{hasCliSession: boolean, hasApiKey: boolean, apiKeyPreview: string|null}>}
 */
export async function getCredentialStatus() {
  const apiKey = loadTestApiKey();
  const cliSession = await hasCliSession();

  return {
    hasCliSession: cliSession,
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : null,
  };
}

/**
 * Mask an API key for display
 * @param {string} key - API key to mask
 * @returns {string} Masked key
 */
export function maskApiKey(key) {
  if (!key || key.length <= 10) {
    return key ? '••••••••' : '';
  }
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}
