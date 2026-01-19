/**
 * E2E Test Auth State Helper
 *
 * Manipulates ~/.claude/settings.json for testing different auth states.
 * Includes backup/restore functionality to preserve user settings.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CLAUDE_CONFIG_DIR = join(homedir(), '.claude');
const SETTINGS_PATH = join(CLAUDE_CONFIG_DIR, 'settings.json');
const BACKUP_PATH = join(CLAUDE_CONFIG_DIR, 'settings.json.e2e-backup');

/**
 * Backup the current settings.json
 * @returns {boolean} true if backup was created (file existed)
 */
export function backupAuthState() {
  if (!existsSync(SETTINGS_PATH)) {
    console.log('[auth-state] No settings.json to backup');
    return false;
  }

  try {
    copyFileSync(SETTINGS_PATH, BACKUP_PATH);
    console.log('[auth-state] Backed up settings.json');
    return true;
  } catch (e) {
    console.error('[auth-state] Failed to backup:', e.message);
    throw e;
  }
}

/**
 * Restore settings.json from backup
 * @returns {boolean} true if restore succeeded
 */
export function restoreAuthState() {
  if (!existsSync(BACKUP_PATH)) {
    console.log('[auth-state] No backup to restore');
    return false;
  }

  try {
    copyFileSync(BACKUP_PATH, SETTINGS_PATH);
    unlinkSync(BACKUP_PATH);
    console.log('[auth-state] Restored settings.json from backup');
    return true;
  } catch (e) {
    console.error('[auth-state] Failed to restore:', e.message);
    throw e;
  }
}

/**
 * Check if backup exists (in case previous test run crashed)
 * @returns {boolean}
 */
export function hasBackup() {
  return existsSync(BACKUP_PATH);
}

/**
 * Get current settings content
 * @returns {object|null}
 */
export function getSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (e) {
    console.error('[auth-state] Failed to parse settings:', e.message);
    return null;
  }
}

/**
 * Write settings to file
 * @param {object} settings
 */
export function writeSettings(settings) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Clear all auth from settings.json
 * Removes ANTHROPIC_API_KEY from env (CLI session auth remains in keychain)
 * @returns {boolean} true if changes were made
 */
export function clearApiKeyAuth() {
  const settings = getSettings();
  if (!settings) {
    console.log('[auth-state] No settings to clear');
    return false;
  }

  let changed = false;

  // Remove API key from env
  if (settings.env?.ANTHROPIC_API_KEY) {
    delete settings.env.ANTHROPIC_API_KEY;
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
    changed = true;
  }

  if (changed) {
    writeSettings(settings);
    console.log('[auth-state] Cleared API key auth');
  }

  return changed;
}

/**
 * Set API key auth in settings.json
 * @param {string} apiKey - The API key to set
 */
export function setApiKeyAuth(apiKey) {
  let settings = getSettings() || {};

  // Initialize env if needed
  if (!settings.env) {
    settings.env = {};
  }

  settings.env.ANTHROPIC_API_KEY = apiKey;
  writeSettings(settings);
  console.log('[auth-state] Set API key auth');
}

/**
 * Get current auth type from settings
 * @returns {'api_key'|'cli_session'|'none'}
 */
export function getCurrentAuthType() {
  const settings = getSettings();

  if (!settings) {
    return 'none';
  }

  if (settings.env?.ANTHROPIC_API_KEY) {
    return 'api_key';
  }

  // If settings exist but no API key, assume CLI session
  // (actual token is in keychain)
  return 'cli_session';
}

/**
 * Verify backup/restore works correctly (self-test)
 * @returns {boolean}
 */
export function verifySafetyMechanism() {
  const testKey = '__e2e_test_verify__';

  try {
    // Backup current state
    const hadBackup = hasBackup();
    if (hadBackup) {
      console.warn('[auth-state] WARNING: Found existing backup, previous test may have crashed');
    }

    const originalSettings = getSettings();
    backupAuthState();

    // Modify settings
    let settings = getSettings() || {};
    settings.__test = testKey;
    writeSettings(settings);

    // Verify modification
    const modified = getSettings();
    if (modified.__test !== testKey) {
      throw new Error('Modification not persisted');
    }

    // Restore
    restoreAuthState();

    // Verify restoration
    const restored = getSettings();
    if (restored?.__test === testKey) {
      throw new Error('Restore did not work');
    }

    // Check original content matches
    if (JSON.stringify(originalSettings) !== JSON.stringify(restored)) {
      console.warn('[auth-state] WARNING: Restored content differs from original');
    }

    console.log('[auth-state] Safety mechanism verified');
    return true;
  } catch (e) {
    console.error('[auth-state] Safety mechanism failed:', e.message);
    // Attempt cleanup
    if (hasBackup()) {
      try {
        restoreAuthState();
      } catch (_) {}
    }
    return false;
  }
}
