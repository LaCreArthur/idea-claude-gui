/**
 * API Configuration Module
 * Handles loading and managing Claude API configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { execSync } from 'child_process';

/**
 * Read Claude Code configuration
 */
export function loadClaudeSettings() {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return settings;
  } catch (error) {
    return null;
  }
}

/**
 * Read credentials from macOS Keychain
 * @returns {Object|null} Credentials object or null if not found
 */
function readMacKeychainCredentials() {
  try {
    // Try different possible keychain service names
    const serviceNames = ['Claude Code-credentials', 'Claude Code', 'claude-desktop'];

    for (const serviceName of serviceNames) {
      try {
        const result = execSync(
          `security find-generic-password -s "${serviceName}" -w 2>/dev/null`,
          { encoding: 'utf8', timeout: 5000 }
        );

        if (result && result.trim()) {
          const credentials = JSON.parse(result.trim());
          console.log(`[Keychain] Successfully read credentials from macOS Keychain (service: ${serviceName})`);
          return credentials;
        }
      } catch (e) {
        // Continue to next service name
        continue;
      }
    }

    console.log('[Keychain] No credentials found in macOS Keychain');
    return null;
  } catch (error) {
    console.log('[Keychain] Failed to read from macOS Keychain:', error.message);
    return null;
  }
}

/**
 * Read credentials from file (Linux/Windows/macOS fallback)
 * @returns {Object|null} Credentials object or null if not found
 */
function readFileCredentials() {
  try {
    const credentialsPath = join(homedir(), '.claude', '.credentials.json');

    if (!existsSync(credentialsPath)) {
      console.log('[DEBUG] No CLI session found: .credentials.json does not exist');
      return null;
    }

    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    return credentials;
  } catch (error) {
    console.log('[DEBUG] Failed to read credentials file:', error.message);
    return null;
  }
}

/**
 * Check if CLI session authentication exists
 * - macOS: Read from system Keychain with file fallback
 * - Linux/Windows: Read from ~/.claude/.credentials.json
 * Checks if user has authenticated via 'claude login'
 * @returns {boolean} True if valid CLI session exists
 */
export function hasCliSessionAuth() {
  try {
    let credentials = null;
    const currentPlatform = platform();

    // macOS uses Keychain, other platforms use file
    if (currentPlatform === 'darwin') {
      credentials = readMacKeychainCredentials();

      // Fallback to file if Keychain fails (user might have manually created file)
      if (!credentials) {
        credentials = readFileCredentials();
      }
    } else {
      credentials = readFileCredentials();
    }

    // Validate OAuth access token
    const hasValidToken = credentials?.claudeAiOauth?.accessToken &&
                         credentials.claudeAiOauth.accessToken.length > 0;

    if (hasValidToken) {
      console.log('[DEBUG] Valid CLI session found with access token');
      return true;
    } else {
      console.log('[DEBUG] CLI credentials exist but no valid access token found');
      return false;
    }
  } catch (error) {
    console.log('[DEBUG] Failed to check CLI session:', error.message);
    return false;
  }
}

/**
 * Configure API Key
 * @returns {Object} Contains apiKey, baseUrl, authType and their sources
 */
export function setupApiKey() {
  const settings = loadClaudeSettings();

  let apiKey;
  let baseUrl;
  let authType = 'api_key';  // Default: use api_key (x-api-key header)
  let apiKeySource = 'default';
  let baseUrlSource = 'default';

  // Configuration priority: Only read from settings.json, ignore shell environment variables
  // This ensures a single configuration source and avoids shell env interference

  // Prefer ANTHROPIC_AUTH_TOKEN (Bearer auth), fallback to ANTHROPIC_API_KEY (x-api-key auth)
  // This is compatible with both Claude Code CLI authentication methods
  if (settings?.env?.ANTHROPIC_AUTH_TOKEN) {
    apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
    authType = 'auth_token';  // Bearer authentication
    apiKeySource = 'settings.json (ANTHROPIC_AUTH_TOKEN)';
  } else if (settings?.env?.ANTHROPIC_API_KEY) {
    apiKey = settings.env.ANTHROPIC_API_KEY;
    authType = 'api_key';  // x-api-key authentication
    apiKeySource = 'settings.json (ANTHROPIC_API_KEY)';
  }

  if (settings?.env?.ANTHROPIC_BASE_URL) {
    baseUrl = settings.env.ANTHROPIC_BASE_URL;
    baseUrlSource = 'settings.json';
  }

  // If no API Key configured, check for CLI session auth
  if (!apiKey) {
    console.log('[DEBUG] No API Key found in settings.json, checking for CLI session...');

    if (hasCliSessionAuth()) {
      // Use CLI session authentication
      console.log('[INFO] Using CLI session authentication (claude login)');
      authType = 'cli_session';
      
      // Set credential source based on platform
      const currentPlatform = platform();
      apiKeySource = currentPlatform === 'darwin'
        ? 'CLI session (macOS Keychain)'
        : 'CLI session (~/.claude/.credentials.json)';

      // Clear all API Key environment variables, let SDK auto-detect CLI session
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;

      // Set baseUrl (if configured)
      if (baseUrl) {
        process.env.ANTHROPIC_BASE_URL = baseUrl;
      }

      console.log('[DEBUG] Auth type:', authType);
      return { apiKey: null, baseUrl, authType, apiKeySource, baseUrlSource };
    } else {
      // Neither API Key nor CLI session available
      console.error('[ERROR] API Key not configured and no CLI session found.');
      console.error('[ERROR] Please either:');
      console.error('[ERROR]   1. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json');
      console.error('[ERROR]   2. Run "claude login" to authenticate via CLI');
      throw new Error('API Key not configured and no CLI session found');
    }
  }

  // Set environment variables based on auth type
  if (authType === 'auth_token') {
    process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    // Clear ANTHROPIC_API_KEY to avoid confusion
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = apiKey;
    // Clear ANTHROPIC_AUTH_TOKEN to avoid confusion
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  }

  if (baseUrl) {
    process.env.ANTHROPIC_BASE_URL = baseUrl;
  }

  return { apiKey, baseUrl, authType, apiKeySource, baseUrlSource };
}

/**
 * Detect if using custom Base URL (non-official Anthropic API)
 * @param {string} baseUrl - Base URL
 * @returns {boolean} True if custom URL
 */
export function isCustomBaseUrl(baseUrl) {
  if (!baseUrl) return false;
  const officialUrls = [
    'https://api.anthropic.com',
    'https://api.anthropic.com/',
    'api.anthropic.com'
  ];
  return !officialUrls.some(url => baseUrl.toLowerCase().includes('api.anthropic.com'));
}
