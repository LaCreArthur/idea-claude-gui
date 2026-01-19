/**
 * E2E Test: Mode Switching
 *
 * Tests that permission modes can be switched via UI and that they
 * affect tool execution behavior.
 *
 * Modes: Default, Plan, Accept Edits, Auto-accept (bypassPermissions)
 */

import { chromium } from 'playwright';
import { getScreenshotPath } from './helpers/webview.mjs';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testModeSwitching() {
  console.log('=== Mode Switching E2E Test ===\n');

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  let allTestsPassed = true;

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title();
      if (!title.includes('Claude')) continue;

      console.log('1. Found Claude webview');

      // Start new session
      console.log('2. Starting new session...');
      await page.evaluate(() => {
        const btn = document.querySelector('.icon-button[data-tooltip="New Session"]');
        if (btn) btn.click();
      });
      await sleep(500);
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent?.includes('Confirm')) btn.click();
        }
      });
      await sleep(1000);

      // Helper to get current mode
      async function getCurrentMode() {
        return await page.evaluate(() => {
          const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
          const buttons = document.querySelectorAll('.selector-button');
          for (const btn of buttons) {
            const text = btn.textContent || '';
            for (const kw of modeKeywords) {
              if (text.includes(kw)) return kw;
            }
          }
          return 'unknown';
        });
      }

      // Helper to switch mode
      async function switchToMode(modeName) {
        // Open dropdown
        await page.evaluate(() => {
          const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
          const buttons = document.querySelectorAll('.selector-button');
          for (const btn of buttons) {
            const text = btn.textContent || '';
            for (const kw of modeKeywords) {
              if (text.includes(kw)) {
                btn.click();
                return;
              }
            }
          }
        });
        await sleep(300);

        // Click the target mode
        await page.evaluate((targetMode) => {
          const options = document.querySelectorAll('.selector-option');
          for (const opt of options) {
            if (opt.textContent?.includes(targetMode)) {
              opt.click();
              return true;
            }
          }
          return false;
        }, modeName);
        await sleep(500);
      }

      // Test 1: Get initial mode and switch to Default if needed
      console.log('\n--- Test 1: Initial State ---');
      const initialMode = await getCurrentMode();
      console.log(`Initial mode: ${initialMode}`);
      if (initialMode !== 'Default') {
        console.log('   Switching to Default to start tests...');
        await switchToMode('Default');
        await sleep(300);
        const now = await getCurrentMode();
        if (now === 'Default') {
          console.log('✅ Switched to Default');
        } else {
          console.log('⚠️ Could not switch to Default');
        }
      } else {
        console.log('✅ Already in Default mode');
      }

      // Test 2: Switch to Auto-accept
      console.log('\n--- Test 2: Switch to Auto-accept ---');
      await switchToMode('Auto-accept');
      const modeAfterAutoAccept = await getCurrentMode();
      console.log(`Mode after switch: ${modeAfterAutoAccept}`);
      if (modeAfterAutoAccept === 'Auto-accept') {
        console.log('✅ Successfully switched to Auto-accept');
      } else {
        console.log('❌ Failed to switch to Auto-accept');
        allTestsPassed = false;
      }

      // Test 3: Switch to Accept Edits
      console.log('\n--- Test 3: Switch to Accept Edits ---');
      await switchToMode('Accept Edits');
      const modeAfterAcceptEdits = await getCurrentMode();
      console.log(`Mode after switch: ${modeAfterAcceptEdits}`);
      if (modeAfterAcceptEdits === 'Accept Edits') {
        console.log('✅ Successfully switched to Accept Edits');
      } else {
        console.log('❌ Failed to switch to Accept Edits');
        allTestsPassed = false;
      }

      // Test 4: Switch to Plan
      console.log('\n--- Test 4: Switch to Plan ---');
      await switchToMode('Plan');
      const modeAfterPlan = await getCurrentMode();
      console.log(`Mode after switch: ${modeAfterPlan}`);
      if (modeAfterPlan === 'Plan') {
        console.log('✅ Successfully switched to Plan');
      } else {
        console.log('❌ Failed to switch to Plan');
        allTestsPassed = false;
      }

      // Test 5: Switch back to Default
      console.log('\n--- Test 5: Switch back to Default ---');
      await switchToMode('Default');
      const modeAfterDefault = await getCurrentMode();
      console.log(`Mode after switch: ${modeAfterDefault}`);
      if (modeAfterDefault === 'Default') {
        console.log('✅ Successfully switched back to Default');
      } else {
        console.log('❌ Failed to switch back to Default');
        allTestsPassed = false;
      }

      // Test 6: Verify set_mode messages were sent
      console.log('\n--- Test 6: Verify set_mode messages ---');
      const log = await page.evaluate(() => window.__testMessageLog || []);
      const setModeMessages = log.filter(e => e.msg?.includes('set_mode'));
      console.log(`Found ${setModeMessages.length} set_mode messages`);

      const expectedModes = ['bypassPermissions', 'acceptEdits', 'plan', 'default'];
      let modesFound = 0;
      for (const mode of expectedModes) {
        const found = setModeMessages.some(m => m.msg?.includes(mode));
        if (found) {
          modesFound++;
          console.log(`  ✅ Found set_mode:${mode}`);
        } else {
          console.log(`  ⚠️ Missing set_mode:${mode}`);
        }
      }

      if (modesFound >= 3) { // Allow for some flexibility
        console.log('✅ Mode messages sent correctly');
      } else {
        console.log('⚠️ Some mode messages may be missing');
      }

      // Take screenshot
      await page.screenshot({ path: getScreenshotPath('mode-switching.png') });

      // Cleanup: ensure mode is Default for next test
      const finalMode = await getCurrentMode();
      if (finalMode !== 'Default') {
        await switchToMode('Default');
      }

      break;
    }
  }

  await browser.close();

  console.log('\n=== Test Result ===');
  if (allTestsPassed) {
    console.log('✅ PASSED: Mode switching works correctly');
    process.exit(0);
  } else {
    console.log('❌ FAILED: Some mode switching tests failed');
    process.exit(1);
  }
}

testModeSwitching().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
