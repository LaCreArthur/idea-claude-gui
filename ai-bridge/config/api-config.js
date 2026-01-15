/**
 * API 配置模块
 * 负责加载和管理 Claude API 配置
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
 * Read credentials from file (Linux/Windows)
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
 * 检查是否存在有效的 Claude CLI 会话认证
 * - macOS: 从系统钥匙串(Keychain)读取凭证
 * - Linux/Windows: 从 ~/.claude/.credentials.json 文件读取凭证
 *
 * @returns {boolean} 如果存在有效的CLI会话凭证返回true，否则返回false
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
  console.log('[DIAG-CONFIG] ========== setupApiKey() START ==========');

  const settings = loadClaudeSettings();
  console.log('[DIAG-CONFIG] Settings loaded:', settings ? 'yes' : 'no');
  if (settings?.env) {
    console.log('[DIAG-CONFIG] Settings env keys:', Object.keys(settings.env));
  }

  let apiKey;
  let baseUrl;
  let authType = 'api_key';  // 默认使用 api_key（x-api-key header）
  let apiKeySource = 'default';
  let baseUrlSource = 'default';

  // 🔥 配置优先级：只从 settings.json 读取，忽略系统环境变量
  // 这样确保配置来源唯一，避免 shell 环境变量干扰
  console.log('[DEBUG] Loading configuration from settings.json only (ignoring shell environment variables)...');

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
  } else if (settings?.env?.CLAUDE_CODE_USE_BEDROCK === '1' || settings?.env?.CLAUDE_CODE_USE_BEDROCK === 1 || settings?.env?.CLAUDE_CODE_USE_BEDROCK === 'true' || settings?.env?.CLAUDE_CODE_USE_BEDROCK === true) {
    apiKey = settings?.env?.CLAUDE_CODE_USE_BEDROCK;
    authType = 'aws_bedrock';  // aws_bedrock 认证
    apiKeySource = 'settings.json (AWS_BEDROCK)';
  }

  if (settings?.env?.ANTHROPIC_BASE_URL) {
    baseUrl = settings.env.ANTHROPIC_BASE_URL;
    baseUrlSource = 'settings.json';
  }

  // 如果没有配置 API Key，检查是否存在 CLI 会话认证
  if (!apiKey) {
    console.log('[DEBUG] No API Key found in settings.json, checking for CLI session...');

    if (hasCliSessionAuth()) {
      // 使用 CLI 会话认证
      console.log('[INFO] Using CLI session authentication (claude login)');
      authType = 'cli_session';
      // Set source based on platform
      const currentPlatform = platform();
      apiKeySource = currentPlatform === 'darwin'
        ? 'CLI session (macOS Keychain)'
        : 'CLI session (~/.claude/.credentials.json)';

      // 清除所有 API Key 相关的环境变量，让 SDK 自动检测 CLI 会话
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;

      // 设置 baseUrl (如果配置了)
      if (baseUrl) {
        process.env.ANTHROPIC_BASE_URL = baseUrl;
      }

      console.log('[DEBUG] Auth type:', authType);
      return { apiKey: null, baseUrl, authType, apiKeySource, baseUrlSource };
    } else {
      // 既没有 API Key 也没有 CLI 会话
      console.error('[ERROR] API Key not configured and no CLI session found.');
      console.error('[ERROR] Please either:');
      console.error('[ERROR]   1. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json');
      console.error('[ERROR]   2. Run "claude login" to authenticate via CLI');
      throw new Error('API Key not configured and no CLI session found');
    }
  }

  // 根据认证类型设置对应的环境变量
  if (authType === 'auth_token') {
    process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    // 清除 ANTHROPIC_API_KEY 避免混淆
    delete process.env.ANTHROPIC_API_KEY;
  } else if (authType === 'aws_bedrock') {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  } else {
    process.env.ANTHROPIC_API_KEY = apiKey;
    // 清除 ANTHROPIC_AUTH_TOKEN 避免混淆
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  }

  if (baseUrl) {
    process.env.ANTHROPIC_BASE_URL = baseUrl;
  }

  console.log('[DEBUG] Auth type:', authType);

  console.log('[DIAG-CONFIG] ========== setupApiKey() RESULT ==========');
  console.log('[DIAG-CONFIG] authType:', authType);
  console.log('[DIAG-CONFIG] apiKeySource:', apiKeySource);
  console.log('[DIAG-CONFIG] baseUrl:', baseUrl || '(not set)');
  console.log('[DIAG-CONFIG] baseUrlSource:', baseUrlSource);
  console.log('[DIAG-CONFIG] apiKey preview:', apiKey ? `${apiKey.substring(0, 10)}...` : '(null)');

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

/**
 * Get CLI session credentials with full details
 * @returns {Object|null} Full credentials object or null
 */
export function getCliCredentials() {
  try {
    const currentPlatform = platform();
    let credentials = null;

    if (currentPlatform === 'darwin') {
      credentials = readMacKeychainCredentials();
      if (!credentials) {
        credentials = readFileCredentials();
      }
    } else {
      credentials = readFileCredentials();
    }

    return credentials;
  } catch (error) {
    console.log('[DEBUG] Failed to get CLI credentials:', error.message);
    return null;
  }
}

/**
 * Comprehensive credential health check with detailed diagnostics
 * Returns actionable information about authentication status and issues
 *
 * @returns {Object} Health check result with:
 *   - status: 'healthy' | 'expired' | 'missing' | 'invalid' | 'error'
 *   - authType: The authentication type being used
 *   - message: Human-readable status message
 *   - action: Suggested action to fix issues (if any)
 *   - details: Additional diagnostic information
 */
export function checkCredentialHealth() {
  const result = {
    status: 'unknown',
    authType: null,
    message: '',
    action: null,
    details: {}
  };

  try {
    const settings = loadClaudeSettings();
    const currentPlatform = platform();

    // Check for API key in settings.json first
    if (settings?.env?.ANTHROPIC_AUTH_TOKEN) {
      result.authType = 'auth_token';
      result.details.source = 'settings.json (ANTHROPIC_AUTH_TOKEN)';
      result.status = 'healthy';
      result.message = 'Using API auth token from settings.json';
      return result;
    }

    if (settings?.env?.ANTHROPIC_API_KEY) {
      result.authType = 'api_key';
      result.details.source = 'settings.json (ANTHROPIC_API_KEY)';
      result.status = 'healthy';
      result.message = 'Using API key from settings.json';
      return result;
    }

    if (settings?.env?.CLAUDE_CODE_USE_BEDROCK) {
      result.authType = 'aws_bedrock';
      result.details.source = 'settings.json (AWS_BEDROCK)';
      result.status = 'healthy';
      result.message = 'Using AWS Bedrock authentication';
      return result;
    }

    // No API key in settings, check CLI session
    result.authType = 'cli_session';
    result.details.platform = currentPlatform;
    result.details.source = currentPlatform === 'darwin'
      ? 'macOS Keychain'
      : '~/.claude/.credentials.json';

    const credentials = getCliCredentials();

    if (!credentials) {
      result.status = 'missing';
      result.message = 'No CLI session found. You need to log in.';
      result.action = 'Run "claude login" in your terminal to authenticate';
      result.details.checked = result.details.source;
      return result;
    }

    const oauth = credentials.claudeAiOauth;

    if (!oauth) {
      result.status = 'invalid';
      result.message = 'Credentials file exists but contains no OAuth data';
      result.action = 'Run "claude login" to re-authenticate';
      result.details.hasCredentialsFile = true;
      result.details.hasOAuthData = false;
      return result;
    }

    if (!oauth.accessToken) {
      result.status = 'invalid';
      result.message = 'OAuth data exists but access token is missing';
      result.action = 'Run "claude login" to re-authenticate';
      result.details.hasOAuthData = true;
      result.details.hasAccessToken = false;
      return result;
    }

    // Check token expiration
    if (oauth.expiresAt) {
      const now = Date.now();
      const expiresAt = oauth.expiresAt;
      const timeUntilExpiry = expiresAt - now;

      result.details.expiresAt = new Date(expiresAt).toISOString();
      result.details.timeUntilExpiryMs = timeUntilExpiry;

      if (timeUntilExpiry < 0) {
        // Token is expired
        const expiredAgo = Math.abs(timeUntilExpiry);
        const expiredMinutes = Math.floor(expiredAgo / 60000);
        const expiredHours = Math.floor(expiredMinutes / 60);
        const expiredDays = Math.floor(expiredHours / 24);

        result.status = 'expired';
        if (expiredDays > 0) {
          result.message = `Session expired ${expiredDays} day${expiredDays > 1 ? 's' : ''} ago`;
        } else if (expiredHours > 0) {
          result.message = `Session expired ${expiredHours} hour${expiredHours > 1 ? 's' : ''} ago`;
        } else {
          result.message = `Session expired ${expiredMinutes} minute${expiredMinutes > 1 ? 's' : ''} ago`;
        }
        result.action = 'Run "claude login" to refresh your session';
        result.details.expiredAgoMs = expiredAgo;
        return result;
      }

      // Token is valid but check if expiring soon (within 1 hour)
      if (timeUntilExpiry < 3600000) {
        const minutesLeft = Math.floor(timeUntilExpiry / 60000);
        result.status = 'expiring_soon';
        result.message = `Session expires in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`;
        result.action = 'Consider running "claude login" soon to refresh your session';
        return result;
      }
    }

    // Check for subscription type info
    if (oauth.subscriptionType) {
      result.details.subscriptionType = oauth.subscriptionType;
    }
    if (oauth.scopes) {
      result.details.scopes = oauth.scopes;
    }
    if (oauth.refreshToken) {
      result.details.hasRefreshToken = true;
    }

    result.status = 'healthy';
    result.message = 'CLI session is valid';
    return result;

  } catch (error) {
    result.status = 'error';
    result.message = `Failed to check credentials: ${error.message}`;
    result.action = 'Check plugin logs for details';
    result.details.error = error.message;
    return result;
  }
}

/**
 * Classify an error and provide actionable guidance
 * @param {Error} error - The error to classify
 * @param {string} authType - The authentication type being used
 * @returns {Object} Classification with errorCode, message, action, and isRetryable
 */
export function classifyError(error, authType) {
  const errorMsg = error?.message || String(error);
  const errorName = error?.name || 'Error';

  // Stream closed - common issue with CLI session auth
  if (errorMsg.includes('Stream closed') || errorMsg.includes('stream closed')) {
    const health = checkCredentialHealth();

    if (health.status === 'expired') {
      return {
        errorCode: 'SESSION_EXPIRED',
        message: health.message,
        action: health.action,
        isRetryable: false,
        details: health.details
      };
    }

    if (health.status === 'missing') {
      return {
        errorCode: 'NO_SESSION',
        message: health.message,
        action: health.action,
        isRetryable: false,
        details: health.details
      };
    }

    // Stream closed but credentials look OK - might be network or server issue
    return {
      errorCode: 'STREAM_INTERRUPTED',
      message: 'Connection was interrupted unexpectedly',
      action: 'Try again. If this persists, run "claude login" to refresh your session',
      isRetryable: true,
      details: { originalError: errorMsg, credentialHealth: health }
    };
  }

  // Abort errors
  if (errorName === 'AbortError' || errorMsg.includes('aborted')) {
    return {
      errorCode: 'REQUEST_ABORTED',
      message: 'Request was cancelled or timed out',
      action: 'Try again with a shorter prompt, or check your network connection',
      isRetryable: true,
      details: { originalError: errorMsg }
    };
  }

  // Authentication errors
  if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('authentication')) {
    const health = checkCredentialHealth();
    return {
      errorCode: 'AUTH_FAILED',
      message: 'Authentication failed',
      action: authType === 'cli_session'
        ? 'Run "claude login" to re-authenticate'
        : 'Check your API key in Settings > Provider Management',
      isRetryable: false,
      details: { credentialHealth: health }
    };
  }

  // Rate limit errors
  if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
    return {
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests. You have been rate limited.',
      action: 'Wait a few minutes before trying again',
      isRetryable: true,
      details: { originalError: errorMsg }
    };
  }

  // Network errors
  if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND') ||
      errorMsg.includes('network') || errorMsg.includes('fetch failed')) {
    return {
      errorCode: 'NETWORK_ERROR',
      message: 'Network connection failed',
      action: 'Check your internet connection and try again',
      isRetryable: true,
      details: { originalError: errorMsg }
    };
  }

  // SDK not installed
  if (errorMsg.includes('SDK_NOT_INSTALLED') || errorMsg.includes('SDK not installed')) {
    return {
      errorCode: 'SDK_NOT_INSTALLED',
      message: 'Claude Code SDK is not installed',
      action: 'Go to Settings > Dependencies and install the Claude SDK',
      isRetryable: false,
      details: { originalError: errorMsg }
    };
  }

  // API key not configured
  if (errorMsg.includes('API Key not configured') || errorMsg.includes('no CLI session')) {
    return {
      errorCode: 'NO_AUTH_CONFIG',
      message: 'No authentication configured',
      action: 'Either run "claude login" or configure an API key in Settings > Provider Management',
      isRetryable: false,
      details: { originalError: errorMsg }
    };
  }

  // Default: unknown error
  return {
    errorCode: 'UNKNOWN_ERROR',
    message: errorMsg,
    action: 'Check the error details and try again. If this persists, check plugin logs.',
    isRetryable: true,
    details: { originalError: errorMsg, errorName }
  };
}
