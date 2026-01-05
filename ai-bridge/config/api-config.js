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
      return null;
    }

    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    return credentials;
  } catch (error) {
    return null;
  }
}

/**
 * Check if CLI session authentication exists
 * - macOS: Read from system Keychain
 * - Linux/Windows: Read from ~/.claude/.credentials.json
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
    return !!(credentials?.claudeAiOauth?.accessToken);
  } catch (error) {
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

  if (!apiKey) {
    // No API Key configured, check for CLI session auth
    if (hasCliSessionAuth()) {
      // Clear all auth environment variables, let SDK auto-detect CLI session
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
      
      // Set credential source based on platform
      const currentPlatform = platform();
      const credSource = currentPlatform === 'darwin'
        ? 'CLI session (macOS Keychain)'
        : 'CLI session (~/.claude/.credentials.json)';
      
      return {
        apiKey: null,
        baseUrl: baseUrl || null,
        authType: 'cli_session',
        apiKeySource: credSource,
        baseUrlSource
      };
    }
    // Neither API Key nor CLI session available
    console.error('[ERROR] No authentication configured. Run `claude login` or set API key in ~/.claude/settings.json');
    throw new Error('No authentication configured. Run `claude login` in terminal or configure API key.');
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
