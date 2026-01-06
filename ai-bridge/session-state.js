/**
 * Session-level mutable state for mode overrides
 * Used to change permission mode after plan approval (Phase 4 of Plan Mode Implementation)
 *
 * The SDK's setPermissionMode() only works in streaming input mode, but we use string prompts.
 * This module provides shared mutable state that allows the PreToolUse hook to read the current
 * effective mode dynamically, rather than using the closure-captured value at hook creation time.
 */

// Map of sessionId -> effective mode
const sessionModeOverrides = new Map();

/**
 * Set the effective permission mode for a session
 * Called when ExitPlanMode is approved with a new mode
 * @param {string} sessionId - Session ID
 * @param {string} mode - New permission mode ('default', 'acceptEdits', 'bypassPermissions')
 */
export function setEffectiveMode(sessionId, mode) {
  sessionModeOverrides.set(sessionId, mode);
  console.log(`[SessionState] Mode override set: ${sessionId} -> ${mode}`);
}

/**
 * Get the effective permission mode for a session
 * Returns the override if set, otherwise the default mode
 * @param {string} sessionId - Session ID
 * @param {string} defaultMode - Default mode to use if no override
 * @returns {string} - The effective permission mode
 */
export function getEffectiveMode(sessionId, defaultMode) {
  if (sessionModeOverrides.has(sessionId)) {
    return sessionModeOverrides.get(sessionId);
  }
  return defaultMode;
}

/**
 * Clear mode override for a session
 * Called when session ends or is cleaned up
 * @param {string} sessionId - Session ID
 */
export function clearModeOverride(sessionId) {
  if (sessionModeOverrides.has(sessionId)) {
    sessionModeOverrides.delete(sessionId);
    console.log(`[SessionState] Mode override cleared: ${sessionId}`);
  }
}

/**
 * Check if a session has a mode override
 * @param {string} sessionId - Session ID
 * @returns {boolean} - Whether the session has an override
 */
export function hasModeOverride(sessionId) {
  return sessionModeOverrides.has(sessionId);
}

/**
 * Clear all mode overrides (for cleanup on restart)
 */
export function clearAllModeOverrides() {
  const count = sessionModeOverrides.size;
  sessionModeOverrides.clear();
  if (count > 0) {
    console.log(`[SessionState] Cleared ${count} mode override(s)`);
  }
}
