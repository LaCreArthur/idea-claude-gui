/**
 * SDK Loader - 动态加载可选 AI SDK
 *
 * 支持从用户目录 ~/.codemoss/dependencies/ 加载 SDK
 * 这允许用户按需安装 SDK，而不是将其打包在插件中
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'url';

// 依赖目录基路径
const DEPS_BASE = join(homedir(), '.codemoss', 'dependencies');

// SDK 缓存
const sdkCache = new Map();
// 🔧 加载中的 Promise 缓存，防止并发加载同一 SDK
const loadingPromises = new Map();

function getSdkRootDir(sdkId) {
    return join(DEPS_BASE, sdkId);
}

function getPackageDirFromRoot(sdkRootDir, pkgName) {
    // pkgName like: "@anthropic-ai/claude-agent-sdk" or "@openai/codex-sdk"
    const parts = pkgName.split('/');
    return join(sdkRootDir, 'node_modules', ...parts);
}

function pickExportTarget(exportsField, condition) {
    if (!exportsField) return null;
    if (typeof exportsField === 'string') return exportsField;

    // exports: { ".": {...} } or exports: { import: "...", require: "...", default: "..." }
    const root = exportsField['.'] ?? exportsField;
    if (typeof root === 'string') return root;

    if (root && typeof root === 'object') {
        if (typeof root[condition] === 'string') return root[condition];
        if (typeof root.default === 'string') return root.default;
    }

    return null;
}

function resolveEntryFileFromPackageDir(packageDir) {
    // Node ESM does not support importing a directory path directly.
    // We must resolve to a concrete file (e.g., sdk.mjs / index.js / export target).
    const pkgJsonPath = join(packageDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

            const exportTarget =
                pickExportTarget(pkg.exports, 'import') ??
                pickExportTarget(pkg.exports, 'default');

            const candidate =
                exportTarget ??
                (typeof pkg.module === 'string' ? pkg.module : null) ??
                (typeof pkg.main === 'string' ? pkg.main : null);

            if (candidate && typeof candidate === 'string') {
                return join(packageDir, candidate);
            }
        } catch {
            // ignore and fall through to heuristic
        }
    }

    // Heuristics (covers @anthropic-ai/claude-agent-sdk which has sdk.mjs)
    const heuristicCandidates = ['sdk.mjs', 'index.mjs', 'index.js', 'dist/index.js', 'dist/index.mjs'];
    for (const file of heuristicCandidates) {
        const full = join(packageDir, file);
        if (existsSync(full)) return full;
    }

    return null;
}

function resolveExternalPackageUrl(pkgName, sdkRootDir) {
    // Resolve from package directory (works for external node_modules without touching Node's default resolver)
    const packageDir = getPackageDirFromRoot(sdkRootDir, pkgName);
    const entry = resolveEntryFileFromPackageDir(packageDir);
    if (!entry) {
        throw new Error(`Unable to resolve entry file for ${pkgName} from ${packageDir}`);
    }
    return pathToFileURL(entry).href;
}

/**
 * Get Claude SDK installation path
 */
export function getClaudeSdkPath() {
    return join(DEPS_BASE, 'claude-sdk', 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
}

/**
 * Check if Claude Code SDK is available
 */
export function isClaudeSdkAvailable() {
    const sdkPath = getClaudeSdkPath();
    return existsSync(sdkPath);
}

/**
 * 动态加载 Claude SDK
 * @returns {Promise<{query: Function, ...}>}
 * @throws {Error} 如果 SDK 未安装
 */
export async function loadClaudeSdk() {
    console.log('[DIAG-SDK] loadClaudeSdk() called');

    // 🔧 优先返回已缓存的 SDK
    if (sdkCache.has('claude')) {
        console.log('[DIAG-SDK] Returning cached SDK');
        return sdkCache.get('claude');
    }

    // 🔧 如果正在加载中，返回同一个 Promise，防止并发重复加载
    if (loadingPromises.has('claude')) {
        console.log('[DIAG-SDK] SDK loading in progress, returning existing promise');
        return loadingPromises.get('claude');
    }

    const sdkPath = getClaudeSdkPath();
    console.log('[DIAG-SDK] SDK path:', sdkPath);
    console.log('[DIAG-SDK] SDK path exists:', existsSync(sdkPath));

    if (!existsSync(sdkPath)) {
        console.log('[DIAG-SDK] SDK not installed at path');
        throw new Error('SDK_NOT_INSTALLED:claude');
    }

    // 🔧 创建加载 Promise 并缓存
    const loadPromise = (async () => {
        try {
            const sdkRootDir = getSdkRootDir('claude-sdk');
            console.log('[DIAG-SDK] SDK root dir:', sdkRootDir);

            // 🔧 Node ESM 不支持 import(目录)，必须解析到具体文件（如 sdk.mjs）
            const resolvedUrl = resolveExternalPackageUrl('@anthropic-ai/claude-agent-sdk', sdkRootDir);
            console.log('[DIAG-SDK] Resolved URL:', resolvedUrl);

            console.log('[DIAG-SDK] Starting dynamic import...');
            const sdk = await import(resolvedUrl);
            console.log('[DIAG-SDK] SDK imported successfully, exports:', Object.keys(sdk));

            sdkCache.set('claude', sdk);
            return sdk;
        } catch (error) {
            console.log('[DIAG-SDK] SDK import failed:', error.message);
            const pkgDir = getClaudeSdkPath();
            const hintFile = join(pkgDir, 'sdk.mjs');
            const hint = existsSync(hintFile) ? ` Did you mean to import ${hintFile}?` : '';
            throw new Error(`Failed to load Claude SDK: ${error.message}${hint}`);
        } finally {
            // 🔧 加载完成后清除 Promise 缓存
            loadingPromises.delete('claude');
        }
    })();

    loadingPromises.set('claude', loadPromise);
    return loadPromise;
}

/**
 * Load Anthropic base SDK (for API fallback)
 * @returns {Promise<{Anthropic: Class}>}
 */
export async function loadAnthropicSdk() {
    // 🔧 优先返回已缓存的 SDK
    if (sdkCache.has('anthropic')) {
        return sdkCache.get('anthropic');
    }

    // 🔧 如果正在加载中，返回同一个 Promise，防止并发重复加载
    if (loadingPromises.has('anthropic')) {
        return loadingPromises.get('anthropic');
    }

    const sdkRootDir = getSdkRootDir('claude-sdk');
    const sdkPath = join(sdkRootDir, 'node_modules', '@anthropic-ai', 'sdk');

    if (!existsSync(sdkPath)) {
        throw new Error('SDK_NOT_INSTALLED:anthropic');
    }

    // 🔧 创建加载 Promise 并缓存
    const loadPromise = (async () => {
        try {
            const resolvedUrl = resolveExternalPackageUrl('@anthropic-ai/sdk', sdkRootDir);
            const sdk = await import(resolvedUrl);

            sdkCache.set('anthropic', sdk);
            return sdk;
        } catch (error) {
            throw new Error(`Failed to load Anthropic SDK: ${error.message}`);
        } finally {
            loadingPromises.delete('anthropic');
        }
    })();

    loadingPromises.set('anthropic', loadPromise);
    return loadPromise;
}

/**
 * 加载 Bedrock SDK
 * @returns {Promise<{AnthropicBedrock: Class}>}
 */
export async function loadBedrockSdk() {
    // 🔧 优先返回已缓存的 SDK
    if (sdkCache.has('bedrock')) {
        return sdkCache.get('bedrock');
    }

    // 🔧 如果正在加载中，返回同一个 Promise，防止并发重复加载
    if (loadingPromises.has('bedrock')) {
        return loadingPromises.get('bedrock');
    }

    const sdkRootDir = getSdkRootDir('claude-sdk');
    const sdkPath = join(sdkRootDir, 'node_modules', '@anthropic-ai', 'bedrock-sdk');

    if (!existsSync(sdkPath)) {
        throw new Error('SDK_NOT_INSTALLED:bedrock');
    }

    // 🔧 创建加载 Promise 并缓存
    const loadPromise = (async () => {
        try {
            const resolvedUrl = resolveExternalPackageUrl('@anthropic-ai/bedrock-sdk', sdkRootDir);
            const sdk = await import(resolvedUrl);

            sdkCache.set('bedrock', sdk);
            return sdk;
        } catch (error) {
            throw new Error(`Failed to load Bedrock SDK: ${error.message}`);
        } finally {
            loadingPromises.delete('bedrock');
        }
    })();

    loadingPromises.set('bedrock', loadPromise);
    return loadPromise;
}

/**
 * Get SDK status
 */
export function getSdkStatus() {
    return {
        claude: {
            installed: isClaudeSdkAvailable(),
            path: getClaudeSdkPath()
        }
    };
}

/**
 * 清除 SDK 缓存
 * 在 SDK 重新安装后调用
 */
export function clearSdkCache() {
    sdkCache.clear();
}

/**
 * Check if SDK is installed and throw friendly error
 * @param {string} provider - 'claude'
 * @throws {Error} if SDK not installed
 */
export function requireSdk(provider) {
    if (provider === 'claude' && !isClaudeSdkAvailable()) {
        const error = new Error('Claude Code SDK not installed. Please install via Settings > Dependencies.');
        error.code = 'SDK_NOT_INSTALLED';
        error.provider = 'claude';
        throw error;
    }
}
