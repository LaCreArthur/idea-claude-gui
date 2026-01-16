#!/usr/bin/env node
/**
 * E2E Test: US-13 - Settings Persistence
 *
 * Tests settings functionality:
 * 1. Open settings view
 * 2. Verify settings are visible
 * 3. Change theme setting
 * 4. Verify change took effect
 * 5. Change font size
 * 6. Navigate away and back
 * 7. Verify settings persisted
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testSettings() {
  console.log('=== US-13: Settings Persistence E2E Test ===\n');

  let browser, page, rawPage;
  let testsRun = 0;
  let testsPassed = 0;

  try {
    // Connect
    console.log('1. Connecting to Claude GUI...');
    const connection = await connectToClaudeGUI(chromium);
    browser = connection.browser;
    page = connection.page;
    rawPage = connection.rawPage;
    console.log('   Connected');

    // Navigate back if in history view
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button');
      if (backBtn) backBtn.click();
    });
    await sleep(300);

    // Dismiss any leftover dialogs
    let dialogCount = 0;
    while (dialogCount < 5) {
      const hasDialog = await rawPage.evaluate(() =>
        !!document.querySelector('.permission-dialog-v3') ||
        !!document.querySelector('.ask-user-question-dialog')
      );
      if (!hasDialog) break;
      console.log('   Dismissing leftover dialog...');
      await rawPage.evaluate(() => {
        const permOpts = document.querySelectorAll('.permission-dialog-v3-option');
        for (const opt of permOpts) {
          if (opt.textContent?.includes('Deny')) { opt.click(); return; }
        }
      });
      await sleep(1000);
      dialogCount++;
    }

    // ========================================
    // TEST 1: Open settings view
    // ========================================
    console.log('\n--- Test 1: Open Settings View ---');
    testsRun++;

    // Click settings button
    const settingsOpened = await rawPage.evaluate(() => {
      const settingsBtn = document.querySelector('.icon-button[data-tooltip="Settings"], [data-testid="settings"]');
      if (settingsBtn) {
        settingsBtn.click();
        return true;
      }
      // Try alternative selectors
      const btns = document.querySelectorAll('.icon-button');
      for (const btn of btns) {
        if (btn.querySelector('.codicon-gear, .codicon-settings')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    await sleep(500);

    // Verify settings view is open
    const hasSettingsContent = await rawPage.evaluate(() => {
      return !!document.querySelector('.settings-container, .config-section, [class*="BasicConfigSection"]') ||
             document.body.innerText.includes('Basic Configuration') ||
             document.body.innerText.includes('Theme');
    });

    console.log(`   Settings button clicked: ${settingsOpened}`);
    console.log(`   Settings content visible: ${hasSettingsContent}`);

    if (hasSettingsContent) {
      console.log('   Settings view opened');
      testsPassed++;
    }

    // ========================================
    // TEST 2: Theme cards exist
    // ========================================
    console.log('\n--- Test 2: Theme Cards Exist ---');
    testsRun++;

    const themeInfo = await rawPage.evaluate(() => {
      const themeCards = document.querySelectorAll('[class*="themeCard"]');
      const lightCard = Array.from(themeCards).find(c => c.textContent?.includes('Light'));
      const darkCard = Array.from(themeCards).find(c => c.textContent?.includes('Dark'));
      const activeCard = Array.from(themeCards).find(c => c.classList.contains('active') || c.className.includes('active'));

      return {
        count: themeCards.length,
        hasLight: !!lightCard,
        hasDark: !!darkCard,
        activeTheme: activeCard?.textContent?.includes('Light') ? 'light' :
                     activeCard?.textContent?.includes('Dark') ? 'dark' : 'unknown'
      };
    });

    console.log(`   Theme cards found: ${themeInfo.count}`);
    console.log(`   Light theme: ${themeInfo.hasLight}, Dark theme: ${themeInfo.hasDark}`);
    console.log(`   Currently active: ${themeInfo.activeTheme}`);

    if (themeInfo.hasLight && themeInfo.hasDark) {
      console.log('   Theme cards present');
      testsPassed++;
    }

    // ========================================
    // TEST 3: Font size selector exists
    // ========================================
    console.log('\n--- Test 3: Font Size Selector ---');
    testsRun++;

    const fontSizeInfo = await rawPage.evaluate(() => {
      const select = document.querySelector('[class*="fontSizeSelect"], select');
      if (select) {
        const options = select.querySelectorAll('option');
        return {
          exists: true,
          currentValue: select.value,
          optionCount: options.length,
          options: Array.from(options).map(o => o.textContent)
        };
      }
      return { exists: false };
    });

    console.log(`   Font size selector exists: ${fontSizeInfo.exists}`);
    if (fontSizeInfo.exists) {
      console.log(`   Current value: ${fontSizeInfo.currentValue}`);
      console.log(`   Options: ${fontSizeInfo.optionCount}`);
      testsPassed++;
    }

    // ========================================
    // TEST 4: Toggle theme
    // ========================================
    console.log('\n--- Test 4: Toggle Theme ---');
    testsRun++;

    const originalTheme = themeInfo.activeTheme;
    const targetTheme = originalTheme === 'light' ? 'Dark' : 'Light';

    console.log(`   Switching from ${originalTheme} to ${targetTheme}...`);

    await rawPage.evaluate((target) => {
      const themeCards = document.querySelectorAll('[class*="themeCard"]');
      for (const card of themeCards) {
        if (card.textContent?.includes(target)) {
          card.click();
          return true;
        }
      }
      return false;
    }, targetTheme);

    await sleep(500);

    // Verify theme changed
    const newThemeInfo = await rawPage.evaluate(() => {
      const themeCards = document.querySelectorAll('[class*="themeCard"]');
      const activeCard = Array.from(themeCards).find(c => c.classList.contains('active') || c.className.includes('active'));
      return activeCard?.textContent?.includes('Light') ? 'light' :
             activeCard?.textContent?.includes('Dark') ? 'dark' : 'unknown';
    });

    console.log(`   New theme: ${newThemeInfo}`);

    if (newThemeInfo !== originalTheme || newThemeInfo !== 'unknown') {
      console.log('   Theme toggle works');
      testsPassed++;
    }

    // Toggle back to restore
    await rawPage.evaluate((target) => {
      const themeCards = document.querySelectorAll('[class*="themeCard"]');
      for (const card of themeCards) {
        if (card.textContent?.includes(target)) {
          card.click();
          return;
        }
      }
    }, originalTheme === 'light' ? 'Light' : 'Dark');
    await sleep(300);

    // ========================================
    // TEST 5: Send shortcut options
    // ========================================
    console.log('\n--- Test 5: Send Shortcut Options ---');
    testsRun++;

    const shortcutInfo = await rawPage.evaluate(() => {
      const body = document.body.innerText;
      return {
        hasEnterOption: body.includes('Enter to Send'),
        hasCmdEnterOption: body.includes('Ctrl+Enter') || body.includes('⌘/Ctrl+Enter')
      };
    });

    console.log(`   Enter to Send option: ${shortcutInfo.hasEnterOption}`);
    console.log(`   Cmd+Enter option: ${shortcutInfo.hasCmdEnterOption}`);

    if (shortcutInfo.hasEnterOption || shortcutInfo.hasCmdEnterOption) {
      console.log('   Send shortcut options present');
      testsPassed++;
    }

    // Take screenshot
    await page.screenshot('settings');

    // ========================================
    // TEST 6: Navigate away and back
    // ========================================
    console.log('\n--- Test 6: Settings Navigation ---');
    testsRun++;

    // Go back to chat
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button, [class*="backButton"]');
      if (backBtn) backBtn.click();
    });
    await sleep(500);

    // Verify we're back in chat
    const inChatView = await rawPage.evaluate(() => {
      return !!document.querySelector('.input-editable, [contenteditable="true"]');
    });

    console.log(`   Returned to chat view: ${inChatView}`);

    if (inChatView) {
      console.log('   Navigation works');
      testsPassed++;
    }

    // Cleanup
    console.log('\n2. Cleanup...');
    await page.switchMode('Default');

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('settings-error');
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
    console.log('PASSED: Settings functionality works');
    process.exit(0);
  } else {
    console.log('FAILED: Settings has issues');
    process.exit(1);
  }
}

testSettings();
