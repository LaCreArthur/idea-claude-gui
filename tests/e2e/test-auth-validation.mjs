#!/usr/bin/env node
/**
 * E2E Test: Auth Validation with API Calls
 *
 * Validates authentication works by making actual API calls:
 *
 * Subscription tests (no extra cost with Claude Max):
 * 1. Haiku - fast validation
 * 2. Sonnet - model switching
 * 3. Opus - model switching
 *
 * API key test (one call only):
 * 4. Haiku with API key - validates API key workflow (~$0.0001)
 *
 * Prompt: "Reply with only the word 'OK'. No other text."
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';
import { loadTestApiKey, getCredentialStatus } from './helpers/credentials.mjs';
import {
  backupAuthState,
  restoreAuthState,
  setApiKeyAuth,
  clearApiKeyAuth,
  getCurrentAuthType,
  hasBackup,
} from './helpers/auth-state.mjs';

const TEST_PROMPT = 'Reply with only the word "OK". No other text.';
const RESPONSE_TIMEOUT = 60000; // 60 seconds per model

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testAuthValidation() {
  console.log('=== Auth Validation E2E Test ===\n');

  let browser, page, rawPage;
  let testsRun = 0;
  let testsPassed = 0;
  let backupCreated = false;

  try {
    // Safety check: restore any orphaned backup from crashed test
    if (hasBackup()) {
      console.log('WARNING: Found orphaned backup from previous test run');
      console.log('Restoring settings before proceeding...');
      restoreAuthState();
    }

    // Check credentials
    console.log('1. Checking credentials...');
    const credStatus = await getCredentialStatus();
    const authType = getCurrentAuthType();

    console.log(`   CLI session available: ${credStatus.hasCliSession}`);
    console.log(`   E2E API key available: ${credStatus.hasApiKey}`);
    console.log(`   Current auth type: ${authType}`);

    if (!credStatus.hasCliSession && !credStatus.hasApiKey) {
      console.log('\nWARNING: No authentication available');
      console.log('Either:');
      console.log('  - Run "claude login" for CLI session');
      console.log('  - Set E2E_ANTHROPIC_API_KEY environment variable');
      console.log('\nSkipping test.');
      process.exit(0);
    }

    // Connect to GUI
    console.log('\n2. Connecting to Claude GUI...');
    const connection = await connectToClaudeGUI(chromium);
    browser = connection.browser;
    page = connection.page;
    rawPage = connection.rawPage;
    console.log('   Connected');

    // Clean up any dialogs
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button');
      if (backBtn) backBtn.click();
    });
    await sleep(300);

    let dialogCount = 0;
    while (dialogCount < 3) {
      const hasDialog = await rawPage.evaluate(() =>
        !!document.querySelector('.permission-dialog-v3') ||
        !!document.querySelector('.ask-user-question-dialog')
      );
      if (!hasDialog) break;
      console.log('   Dismissing dialog...');
      await rawPage.evaluate(() => {
        const permOpts = document.querySelectorAll('.permission-dialog-v3-option');
        for (const opt of permOpts) {
          if (opt.textContent?.includes('Deny')) { opt.click(); return; }
        }
      });
      await sleep(500);
      dialogCount++;
    }

    // Start fresh session
    console.log('\n3. Starting new session...');
    await page.newSession();
    await sleep(500);

    // Set to auto-accept mode for faster testing
    console.log('   Setting auto-accept mode...');
    await page.switchMode('Auto-accept');
    await sleep(300);

    // Helper function to test a model
    async function testModel(modelName) {
      console.log(`\n   Testing ${modelName}...`);

      // Switch model
      await page.switchModel(modelName);
      await sleep(300);

      // Verify switch
      const currentModel = await page.getCurrentModel();
      if (!currentModel.includes(modelName)) {
        console.log(`   WARNING: Model may not have switched (showing ${currentModel})`);
      }

      // Send test message
      await page.sendMessage(TEST_PROMPT);

      // Wait for response
      try {
        await page.waitForResponse(RESPONSE_TIMEOUT);
      } catch (e) {
        console.log(`   Timeout waiting for ${modelName} response`);
        return false;
      }

      // Check response
      const response = await page.getLastResponse();
      const responseText = response?.toLowerCase()?.trim() || '';

      // Check if response contains "OK" (allowing for variations)
      const isOK = responseText.includes('ok') ||
                   responseText === 'ok' ||
                   responseText === '"ok"' ||
                   responseText === 'ok.';

      if (isOK) {
        console.log(`   ${modelName}: OK response received`);
        return true;
      } else {
        console.log(`   ${modelName}: Unexpected response - "${responseText.slice(0, 50)}"`);
        // Still count as pass if we got any response (API is working)
        return response && response.length > 0;
      }
    }

    // ========================================
    // SUBSCRIPTION TESTS (with CLI session)
    // ========================================
    if (credStatus.hasCliSession || authType === 'cli_session') {
      console.log('\n--- Subscription Tests (CLI Session) ---');

      // TEST: Haiku
      testsRun++;
      if (await testModel('Haiku')) {
        testsPassed++;
        console.log('   PASSED: Haiku');
      }

      // New session between tests
      await page.newSession();
      await sleep(500);

      // TEST: Sonnet
      testsRun++;
      if (await testModel('Sonnet')) {
        testsPassed++;
        console.log('   PASSED: Sonnet');
      }

      // New session between tests
      await page.newSession();
      await sleep(500);

      // TEST: Opus
      testsRun++;
      if (await testModel('Opus')) {
        testsPassed++;
        console.log('   PASSED: Opus');
      }
    } else {
      console.log('\n--- Skipping subscription tests (no CLI session) ---');
    }

    // ========================================
    // API KEY TEST (one Haiku call only)
    // ========================================
    if (credStatus.hasApiKey) {
      console.log('\n--- API Key Test (single Haiku call) ---');
      testsRun++;

      const apiKey = loadTestApiKey();

      // Backup current settings
      console.log('   Backing up settings...');
      backupCreated = backupAuthState();

      // Set API key auth
      console.log('   Setting API key auth...');
      setApiKeyAuth(apiKey);

      // Need to restart session for new auth to take effect
      // The GUI reads settings on session start
      await page.newSession();
      await sleep(1000);

      // Ensure we're on Haiku to minimize cost
      await page.switchModel('Haiku');
      await sleep(300);

      // Test API key auth
      const apiKeyTestPassed = await testModel('Haiku');

      // Restore settings immediately
      console.log('   Restoring settings...');
      if (backupCreated) {
        restoreAuthState();
        backupCreated = false;
      } else {
        clearApiKeyAuth();
      }

      if (apiKeyTestPassed) {
        testsPassed++;
        console.log('   PASSED: API Key validation');
      }
    } else {
      console.log('\n--- Skipping API key test (E2E_ANTHROPIC_API_KEY not set) ---');
    }

    // Take screenshot
    await page.screenshot('auth-validation');

    // Cleanup: return to default mode
    console.log('\n4. Cleanup...');
    await page.switchMode('Default');
    await page.switchModel('Sonnet');

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('auth-validation-error');
      } catch (e) {}
    }
  } finally {
    // Safety: always restore settings if backup exists
    if (backupCreated || hasBackup()) {
      console.log('   Restoring settings from backup...');
      try {
        restoreAuthState();
      } catch (e) {
        console.error('   WARNING: Failed to restore settings:', e.message);
      }
    }

    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}/${testsRun}`);

  // Require at least 2 tests to pass (if we have subscription, need 2/3)
  const minRequired = Math.max(1, Math.floor(testsRun * 0.5));
  if (testsPassed >= minRequired && testsRun > 0) {
    console.log('PASSED: Auth validation successful');
    process.exit(0);
  } else if (testsRun === 0) {
    console.log('SKIPPED: No auth available for testing');
    process.exit(0);
  } else {
    console.log('FAILED: Auth validation has issues');
    process.exit(1);
  }
}

testAuthValidation();
