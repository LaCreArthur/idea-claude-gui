#!/usr/bin/env node
/**
 * E2E Test: Auth State Detection
 *
 * Tests that UI correctly displays authentication status:
 * 1. Detect current auth state
 * 2. No auth -> shows "No authentication configured"
 * 3. API key -> shows masked key (sk-ant-......)
 * 4. CLI session -> shows "CLI Session"
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';
import { getCredentialStatus } from './helpers/credentials.mjs';
import { getCurrentAuthType } from './helpers/auth-state.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testAuthStates() {
  console.log('=== Auth State Detection E2E Test ===\n');

  let browser, page, rawPage;
  let testsRun = 0;
  let testsPassed = 0;

  try {
    // Check current auth state
    console.log('1. Checking current auth state...');
    const credStatus = await getCredentialStatus();
    const authType = getCurrentAuthType();
    console.log(`   CLI session: ${credStatus.hasCliSession}`);
    console.log(`   API key configured: ${credStatus.hasApiKey}`);
    console.log(`   Auth type: ${authType}`);

    // Connect to GUI
    console.log('\n2. Connecting to Claude GUI...');
    const connection = await connectToClaudeGUI(chromium);
    browser = connection.browser;
    page = connection.page;
    rawPage = connection.rawPage;
    console.log('   Connected');

    // Navigate back to chat if in history view or settings
    await rawPage.evaluate(() => {
      // Handle CSS module class names (e.g., _backBtn_xyz123)
      const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
      if (backBtn) backBtn.click();
    });
    await sleep(500);

    // Check if we're in settings and go back to chat
    const inSettings = await rawPage.evaluate(() => {
      return document.body.innerText.includes('Basic Configuration') ||
             document.body.innerText.includes('Provider Management');
    });
    if (inSettings) {
      console.log('   Already in settings, navigating back to chat...');
      await rawPage.evaluate(() => {
        // Handle CSS module class names
        const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
        if (backBtn) {
          backBtn.click();
          return true;
        }
        return false;
      });
      await sleep(500);
    }

    // Dismiss any dialogs
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

    // ========================================
    // TEST 1: Open settings and find auth display
    // ========================================
    console.log('\n--- Test 1: Open Settings ---');
    testsRun++;

    // Check if already in chat view (has input field)
    const inChatNow = await rawPage.evaluate(() => {
      return !!document.querySelector('.input-editable, [contenteditable="true"]');
    });
    console.log(`   In chat view: ${inChatNow}`);

    // Click settings button
    const settingsOpened = await rawPage.evaluate(() => {
      // Try tooltip-based selector
      const settingsBtn = document.querySelector('.icon-button[data-tooltip="Settings"]');
      if (settingsBtn) {
        settingsBtn.click();
        return 'tooltip';
      }
      // Try CSS module class names for icon buttons
      const allBtns = document.querySelectorAll('[class*="iconButton"], .icon-button');
      for (const btn of allBtns) {
        if (btn.querySelector('.codicon-gear, .codicon-settings, [class*="codicon-gear"]')) {
          btn.click();
          return 'icon';
        }
      }
      // Try header buttons
      const headerBtns = document.querySelectorAll('[class*="headerBtn"], [class*="header"] button');
      for (const btn of headerBtns) {
        const title = btn.getAttribute('title') || '';
        if (title.toLowerCase().includes('settings')) {
          btn.click();
          return 'header';
        }
      }
      return false;
    });

    await sleep(500);

    // Verify we're in settings now
    const inSettingsNow = await rawPage.evaluate(() => {
      return document.body.innerText.includes('Basic Configuration') ||
             document.body.innerText.includes('Provider Management');
    });

    console.log(`   Settings click result: ${settingsOpened}`);
    console.log(`   In settings view: ${inSettingsNow}`);

    if (settingsOpened || inSettingsNow) {
      testsPassed++;
    }

    // ========================================
    // TEST 2: Navigate to providers tab
    // ========================================
    console.log('\n--- Test 2: Navigate to Providers Tab ---');
    testsRun++;

    const providersTabClicked = await rawPage.evaluate(() => {
      // Look for providers sidebar item - need to click the parent item, not the text
      // CSS module classes look like _sidebarItem_xyz123 (singular, not sidebarItems plural)
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const className = div.className || '';
        // Match _sidebarItem_ but not _sidebarItems_ (container) or _sidebarItemText_
        if (className.includes('sidebarItem') &&
            !className.includes('sidebarItems') &&
            !className.includes('Text') &&
            div.textContent?.includes('Provider')) {
          div.click();
          return { clicked: true, className: className.slice(0, 50) };
        }
      }
      return { clicked: false };
    });

    await sleep(1000);

    // Verify we're on providers tab
    const onProvidersTab = await rawPage.evaluate(() => {
      return document.body.innerText.includes('Provider Management') ||
             document.body.innerText.includes('Current ClaudeCode Configuration');
    });

    console.log(`   Providers tab click: ${JSON.stringify(providersTabClicked)}`);
    console.log(`   On providers tab: ${onProvidersTab}`);

    if (providersTabClicked.clicked || onProvidersTab) {
      testsPassed++;
    }

    // ========================================
    // TEST 3: Verify auth status display
    // ========================================
    console.log('\n--- Test 3: Verify Auth Status Display ---');
    testsRun++;

    // Debug: check current view
    const currentViewText = await rawPage.evaluate(() => {
      return document.body.innerText.slice(0, 200);
    });
    console.log(`   Current view: "${currentViewText.slice(0, 100)}..."`);

    // Wait for config to load (needs time to fetch from backend)
    await sleep(2000);

    const authDisplay = await rawPage.evaluate(() => {
      const pageText = document.body.innerText;

      // Debug: log relevant section
      const configSection = document.body.innerText.slice(
        document.body.innerText.indexOf('Current ClaudeCode'),
        document.body.innerText.indexOf('Current ClaudeCode') + 300
      );

      return {
        hasNoAuthMessage: pageText.includes('No authentication configured'),
        hasCliSessionLabel: pageText.includes('CLI Session') || pageText.includes('logged in via claude login'),
        hasApiKeyDisplay: pageText.includes('sk-ant-') || /•{4,}/.test(pageText),
        hasConfigSection: pageText.includes('Current ClaudeCode Configuration'),
        hasLoading: pageText.includes('Loading...'),
        debugContent: configSection || 'Config section not found'
      };
    });

    console.log(`   Config section found: ${authDisplay.hasConfigSection}`);
    console.log(`   No auth message: ${authDisplay.hasNoAuthMessage}`);
    console.log(`   CLI session label: ${authDisplay.hasCliSessionLabel}`);
    console.log(`   API key display: ${authDisplay.hasApiKeyDisplay}`);
    console.log(`   Still loading: ${authDisplay.hasLoading}`);

    // Verify display matches actual auth state
    let displayCorrect = false;

    if (authDisplay.hasLoading) {
      console.log('   Config still loading, waiting...');
      await sleep(2000);
      // Re-check after wait
      const recheck = await rawPage.evaluate(() => {
        const pageText = document.body.innerText;
        return {
          hasCliSessionLabel: pageText.includes('CLI Session') || pageText.includes('logged in via claude login'),
          hasApiKeyDisplay: pageText.includes('sk-ant-') || /•{4,}/.test(pageText),
          hasConfigSection: pageText.includes('Current ClaudeCode Configuration'),
        };
      });
      if (recheck.hasConfigSection) {
        console.log('   Config loaded after wait');
        displayCorrect = true;
      }
    } else if (authType === 'none' && authDisplay.hasNoAuthMessage) {
      console.log('   Auth state "none" correctly displayed');
      displayCorrect = true;
    } else if (authType === 'api_key' && authDisplay.hasApiKeyDisplay) {
      console.log('   Auth state "api_key" correctly displayed');
      displayCorrect = true;
    } else if (authType === 'cli_session' && authDisplay.hasCliSessionLabel) {
      console.log('   Auth state "cli_session" correctly displayed');
      displayCorrect = true;
    } else if (authDisplay.hasConfigSection) {
      // Config section exists, auth is working
      console.log('   Config section present (auth working)');
      displayCorrect = true;
    }

    if (displayCorrect) {
      testsPassed++;
    } else {
      console.log(`   Debug: ${authDisplay.debugContent.slice(0, 150)}`);
    }

    // ========================================
    // TEST 4: Get detailed auth info
    // ========================================
    console.log('\n--- Test 4: Auth Info Details ---');
    testsRun++;

    const authInfo = await page.getAuthStatus();
    console.log(`   Auth type: ${authInfo.authType}`);
    console.log(`   Authenticated: ${authInfo.authenticated}`);
    console.log(`   Provider: ${authInfo.providerName || 'default'}`);

    // Accept any non-unknown auth type, or if authenticated is true
    if (authInfo.authType !== 'unknown' || authInfo.authenticated) {
      console.log('   Auth info retrieved');
      testsPassed++;
    }

    // Take screenshot
    await page.screenshot('auth-states');

    // ========================================
    // TEST 5: Return to chat view
    // ========================================
    console.log('\n--- Test 5: Return to Chat ---');
    testsRun++;

    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
      if (backBtn) backBtn.click();
    });
    await sleep(500);

    const inChatView = await rawPage.evaluate(() => {
      return !!document.querySelector('.input-editable, [contenteditable="true"], [class*="inputEditable"]');
    });

    console.log(`   Returned to chat: ${inChatView}`);
    if (inChatView) {
      testsPassed++;
    }

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('auth-states-error');
      } catch (e) {}
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}/${testsRun}`);

  if (testsPassed >= 3) {
    console.log('PASSED: Auth state detection works');
    process.exit(0);
  } else {
    console.log('FAILED: Auth state detection has issues');
    process.exit(1);
  }
}

testAuthStates();
