/**
 * API Configuration Module
 * Handles loading and managing Claude API configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { execSync } from 'child_process';

/**
 * 读取 Claude Code 配置
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
    const serviceNames = ['Claude Code-credentials', 'Claude Code'];

    for (const serviceName of serviceNames) {
      try {
        const result = execSync(
          `security find-generic-password -s "${serviceName}" -w 2>/dev/null`,
          { encoding: 'utf8', timeout: 5000 }
        );

        if (result && result.trim()) {
          const credentials = JSON.parse(result.trim());
          console.log(`[DEBUG] Successfully read credentials from macOS Keychain (service: ${serviceName})`);
          return credentials;
        }
      } catch (e) {
        // Continue to next service name
        continue;
      }
    }

    console.log('[DEBUG] No credentials found in macOS Keychain');
    return null;
  } catch (error) {
    console.log('[DEBUG] Failed to read from macOS Keychain:', error.message);
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
    console.log('[DEBUG] Successfully read credentials from file');
    return credentials;
  } catch (error) {
    console.log('[DEBUG] Failed to read credentials file:', error.message);
    return null;
  }
}

/**
 * Check if valid Claude CLI session authentication exists
 * - macOS: Read credentials from system Keychain
 * - Linux/Windows: Read from ~/.claude/.credentials.json
 *
 * @returns {boolean} True if valid CLI session credentials exist
 */
export function hasCliSessionAuth() {
  try {
    let credentials = null;
    const currentPlatform = platform();

    // macOS uses Keychain, other platforms use file
    if (currentPlatform === 'darwin') {
      console.log('[DEBUG] Detected macOS, attempting to read from Keychain...');
      credentials = readMacKeychainCredentials();

      // Fallback to file if keychain fails (in case user manually created the file)
      if (!credentials) {
        console.log('[DEBUG] Keychain read failed, trying file fallback...');
        credentials = readFileCredentials();
      }
    } else {
      console.log(`[DEBUG] Detected ${currentPlatform}, reading from credentials file...`);
      credentials = readFileCredentials();
    }

    // Validate OAuth access token
    const hasValidToken = credentials?.claudeAiOauth?.accessToken &&
                         credentials.claudeAiOauth.accessToken.length > 0;

    if (hasValidToken) {
      console.log('[DEBUG] Valid CLI session found with access token');
      return true;
    } else {
      console.log('[DEBUG] No valid access token found in credentials');
      return false;
    }
  } catch (error) {
    console.log('[DEBUG] Failed to check CLI session:', error.message);
    return false;
  }
}

/**
 * 配置 API Key
 * @returns {Object} 包含 apiKey, baseUrl, authType 及其来源
 */
export function setupApiKey() {
  const settings = loadClaudeSettings();

  let apiKey;
  let baseUrl;
  let authType = 'api_key';  // 默认使用 api_key（x-api-key header）
  let apiKeySource = 'default';
  let baseUrlSource = 'default';

  // Configuration priority: Only read from settings.json, ignore shell environment variables
  // This ensures a single configuration source and avoids shell env interference

  // 优先使用 ANTHROPIC_AUTH_TOKEN（Bearer 认证），回退到 ANTHROPIC_API_KEY（x-api-key 认证）
  // 这样可以兼容 Claude Code CLI 的两种认证方式
  if (settings?.env?.ANTHROPIC_AUTH_TOKEN) {
    apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
    authType = 'auth_token';  // Bearer 认证
    apiKeySource = 'settings.json (ANTHROPIC_AUTH_TOKEN)';
  } else if (settings?.env?.ANTHROPIC_API_KEY) {
    apiKey = settings.env.ANTHROPIC_API_KEY;
    authType = 'api_key';  // x-api-key 认证
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
      // Set source based on platform
      const currentPlatform = platform();
      apiKeySource = currentPlatform === 'darwin'
        ? 'CLI session (macOS Keychain)'
        : 'CLI session (~/.claude/.credentials.json)';

      // Clear all API Key environment variables, let SDK auto-detect CLI session
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;

      // Set baseUrl if configured
      if (baseUrl) {
        process.env.ANTHROPIC_BASE_URL = baseUrl;
      }

      console.log('[DEBUG] Auth type:', authType);
      return { apiKey: null, baseUrl, authType, apiKeySource, baseUrlSource };
    } else {
      // Neither API Key nor CLI session available
      console.error('[ERROR] No authentication configured. Run `claude login` or set API key in ~/.claude/settings.json');
      throw new Error('No authentication configured. Run `claude login` in terminal or configure API key.');
    }
  }

  // 根据认证类型设置对应的环境变量
  if (authType === 'auth_token') {
    process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    // Clear ANTHROPIC_API_KEY to avoid confusion
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = apiKey;
    // 清除 ANTHROPIC_AUTH_TOKEN 避免混淆
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  }

  if (baseUrl) {
    process.env.ANTHROPIC_BASE_URL = baseUrl;
  }

  return { apiKey, baseUrl, authType, apiKeySource, baseUrlSource };
}

/**
 * 检测是否使用自定义 Base URL（非官方 Anthropic API）
 * @param {string} baseUrl - Base URL
 * @returns {boolean} 是否为自定义 URL
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
