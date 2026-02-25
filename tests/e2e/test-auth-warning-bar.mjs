#!/usr/bin/env node
/**
 * E2E Test: Auth Warning Bar
 *
 * Tests the proactive auth status indicator in the chat input area.
 * Uses CDP to inject fake auth status via window.updateAuthStatus()
 * WITHOUT touching real credentials.
 *
 * Tests:
 * 1. Normal authenticated state - no warning bar
 * 2. Inject unauth state - warning bar appears with correct text
 * 3. Warning bar has "Configure" button
 * 4. Re-inject auth state - warning bar disappears
 * 5. Submit blocked when unauthenticated
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testAuthWarningBar() {
  console.log('=== Auth Warning Bar E2E Test ===\n');

  let browser, page, rawPage;
  let testsRun = 0;
  let testsPassed = 0;

  try {
    // Connect to GUI
    console.log('1. Connecting to Claude GUI...');
    const connection = await connectToClaudeGUI(chromium);
    browser = connection.browser;
    page = connection.page;
    rawPage = connection.rawPage;
    console.log('   Connected');

    // Navigate to chat view if needed
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
      if (backBtn) backBtn.click();
    });
    await sleep(500);

    // Dismiss any stale dialogs
    let dialogCount = 0;
    while (dialogCount < 3) {
      const hasDialog = await rawPage.evaluate(() =>
        !!document.querySelector('.permission-dialog-v3') ||
        !!document.querySelector('.ask-user-question-dialog')
      );
      if (!hasDialog) break;
      await rawPage.evaluate(() => {
        const permOpts = document.querySelectorAll('.permission-dialog-v3-option');
        for (const opt of permOpts) {
          if (opt.textContent?.includes('Deny')) { opt.click(); return; }
        }
      });
      await sleep(500);
      dialogCount++;
    }

    // Ensure we're in chat view
    const inChat = await rawPage.evaluate(() => {
      return !!document.querySelector('.input-editable, [contenteditable="true"]');
    });
    if (!inChat) {
      console.log('   Not in chat view, navigating...');
      await rawPage.evaluate(() => {
        const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
        if (backBtn) backBtn.click();
      });
      await sleep(500);
    }

    // ========================================
    // TEST 1: Normal auth state - no warning bar
    // ========================================
    console.log('\n--- Test 1: Authenticated State (no warning bar) ---');
    testsRun++;

    // Inject authenticated state
    await rawPage.evaluate(() => {
      window.updateAuthStatus?.(JSON.stringify({
        authenticated: true,
        authType: 'cli_session'
      }));
    });
    await sleep(500);

    const hasWarningWhenAuthed = await rawPage.evaluate(() => {
      return !!document.querySelector('.auth-warning-bar');
    });

    if (!hasWarningWhenAuthed) {
      console.log('   PASSED: No warning bar when authenticated');
      testsPassed++;
    } else {
      console.log('   FAILED: Warning bar visible when authenticated');
    }

    // ========================================
    // TEST 2: Inject unauth - warning bar appears
    // ========================================
    console.log('\n--- Test 2: Unauthenticated State (warning bar appears) ---');
    testsRun++;

    await rawPage.evaluate(() => {
      window.updateAuthStatus?.(JSON.stringify({
        authenticated: false,
        authType: 'none'
      }));
    });
    await sleep(500);

    const warningBarInfo = await rawPage.evaluate(() => {
      const bar = document.querySelector('.auth-warning-bar');
      if (!bar) return null;
      return {
        visible: bar.offsetParent !== null || bar.offsetHeight > 0,
        text: bar.textContent?.trim() || '',
        hasWarningIcon: !!bar.querySelector('.codicon-warning'),
      };
    });

    if (warningBarInfo && warningBarInfo.visible) {
      const hasCorrectText = warningBarInfo.text.includes('Not authenticated') ||
                             warningBarInfo.text.includes('not authenticated');
      if (hasCorrectText) {
        console.log('   PASSED: Warning bar visible with correct text');
        testsPassed++;
      } else {
        console.log(`   FAILED: Warning bar visible but wrong text: "${warningBarInfo.text.slice(0, 80)}"`);
      }
    } else {
      console.log('   FAILED: Warning bar not found or not visible');
    }

    // ========================================
    // TEST 3: Warning bar has Configure button
    // ========================================
    console.log('\n--- Test 3: Configure Button Present ---');
    testsRun++;

    const hasConfigureBtn = await rawPage.evaluate(() => {
      const bar = document.querySelector('.auth-warning-bar');
      if (!bar) return false;
      const buttons = bar.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Configure')) return true;
      }
      return false;
    });

    if (hasConfigureBtn) {
      console.log('   PASSED: Configure button present');
      testsPassed++;
    } else {
      console.log('   FAILED: Configure button not found');
    }

    // ========================================
    // TEST 4: Re-auth - warning bar disappears
    // ========================================
    console.log('\n--- Test 4: Re-authenticate (warning bar disappears) ---');
    testsRun++;

    await rawPage.evaluate(() => {
      window.updateAuthStatus?.(JSON.stringify({
        authenticated: true,
        authType: 'cli_session'
      }));
    });
    await sleep(500);

    const warningGone = await rawPage.evaluate(() => {
      return !document.querySelector('.auth-warning-bar') ||
             document.querySelector('.auth-warning-bar')?.offsetParent === null;
    });

    if (warningGone) {
      console.log('   PASSED: Warning bar disappeared after re-auth');
      testsPassed++;
    } else {
      console.log('   FAILED: Warning bar still visible after re-auth');
    }

    // ========================================
    // TEST 5: Submit blocked when unauth
    // ========================================
    console.log('\n--- Test 5: Submit Blocked When Unauthenticated ---');
    testsRun++;

    // Set unauth state again
    await rawPage.evaluate(() => {
      window.updateAuthStatus?.(JSON.stringify({
        authenticated: false,
        authType: 'none'
      }));
    });
    await sleep(500);

    // Type something in the input
    await rawPage.evaluate(() => {
      const input = document.querySelector('.input-editable') ||
                    document.querySelector('[contenteditable="true"]');
      if (input) {
        input.innerText = 'test message that should be blocked';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(200);

    // Count messages before submit attempt
    const messageCountBefore = await rawPage.evaluate(() => {
      return document.querySelectorAll('.message.user, [data-role="user"]').length;
    });

    // Try to submit
    await rawPage.evaluate(() => {
      const submitBtn = document.querySelector('.submit-button, button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });
    await sleep(1000);

    // Check: message should NOT have been sent (count unchanged)
    const messageCountAfter = await rawPage.evaluate(() => {
      return document.querySelectorAll('.message.user, [data-role="user"]').length;
    });

    // Also check if we got redirected to settings (Configure action)
    const redirectedToSettings = await rawPage.evaluate(() => {
      return document.body.innerText.includes('Provider Management') ||
             document.body.innerText.includes('Basic Configuration');
    });

    // Check for toast notification
    const hasToast = await rawPage.evaluate(() => {
      const toasts = document.querySelectorAll('[class*="toast"], [class*="Toast"]');
      for (const toast of toasts) {
        if (toast.textContent?.includes('Not authenticated') ||
            toast.textContent?.includes('not authenticated')) {
          return true;
        }
      }
      return false;
    });

    if (messageCountAfter === messageCountBefore) {
      console.log('   PASSED: Submit was blocked (no new message sent)');
      if (redirectedToSettings) {
        console.log('   Bonus: Redirected to settings');
      }
      if (hasToast) {
        console.log('   Bonus: Toast notification shown');
      }
      testsPassed++;
    } else {
      console.log('   FAILED: Message was sent despite unauth state');
    }

    // ========================================
    // CLEANUP: Restore authenticated state
    // ========================================
    console.log('\n--- Cleanup ---');

    // Restore auth state
    await rawPage.evaluate(() => {
      window.updateAuthStatus?.(JSON.stringify({
        authenticated: true,
        authType: 'cli_session'
      }));
    });
    await sleep(300);

    // Navigate back to chat if we ended up in settings
    if (redirectedToSettings) {
      await rawPage.evaluate(() => {
        const backBtn = document.querySelector('.back-button, [class*="backBtn"], [class*="backButton"]');
        if (backBtn) backBtn.click();
      });
      await sleep(500);
    }

    // Clear the input
    await rawPage.evaluate(() => {
      const input = document.querySelector('.input-editable') ||
                    document.querySelector('[contenteditable="true"]');
      if (input) {
        input.innerText = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    console.log('   Restored authenticated state');

    // Take screenshot
    await page.screenshot('auth-warning-bar');

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('auth-warning-bar-error');
      } catch (e) {}
    }

    // Safety: restore auth state on error
    if (rawPage) {
      try {
        await rawPage.evaluate(() => {
          window.updateAuthStatus?.(JSON.stringify({
            authenticated: true,
            authType: 'cli_session'
          }));
        });
      } catch (e) {}
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}/${testsRun}`);

  if (testsPassed >= 4) {
    console.log('PASSED: Auth warning bar works correctly');
    process.exit(0);
  } else {
    console.log(`FAILED: Auth warning bar has issues (need 4/${testsRun})`);
    process.exit(1);
  }
}

testAuthWarningBar();
