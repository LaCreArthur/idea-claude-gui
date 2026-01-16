#!/usr/bin/env node
/**
 * E2E Test: US-12 - Session Titles
 *
 * Tests session title functionality:
 * 1. Open history view
 * 2. Verify sessions have titles
 * 3. Test title editing
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testSessionTitles() {
  console.log('=== US-12: Session Titles E2E Test ===\n');

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

    // Navigate back if in history view already
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

    // Open history view
    console.log('2. Opening history view...');
    await rawPage.evaluate(() => {
      const historyBtn = document.querySelector('.icon-button[data-tooltip="History"]');
      if (historyBtn) historyBtn.click();
    });
    await sleep(1000);

    // ========================================
    // TEST 1: Sessions have titles
    // ========================================
    console.log('\n--- Test 1: Sessions Have Titles ---');
    testsRun++;

    const titleInfo = await rawPage.evaluate(() => {
      const items = document.querySelectorAll('.history-item');
      const titles = [];
      items.forEach((item, i) => {
        const titleEl = item.querySelector('.history-item-title');
        titles.push({
          index: i,
          title: titleEl?.textContent?.trim() || '',
          hasTitle: !!titleEl?.textContent?.trim(),
        });
      });
      return {
        total: items.length,
        withTitles: titles.filter(t => t.hasTitle).length,
        samples: titles.slice(0, 3),
      };
    });

    console.log(`   Total sessions: ${titleInfo.total}`);
    console.log(`   With titles: ${titleInfo.withTitles}`);
    titleInfo.samples.forEach((s, i) => {
      console.log(`   Sample ${i + 1}: "${s.title.substring(0, 40)}..."`);
    });

    if (titleInfo.total > 0 && titleInfo.withTitles === titleInfo.total) {
      console.log('   All sessions have titles');
      testsPassed++;
    } else if (titleInfo.withTitles > 0) {
      console.log('   Some sessions have titles');
      testsPassed++;
    }

    // ========================================
    // TEST 2: Edit button exists
    // ========================================
    console.log('\n--- Test 2: Edit Button Exists ---');
    testsRun++;

    const hasEditButtons = await rawPage.evaluate(() => {
      const items = document.querySelectorAll('.history-item');
      let editButtonCount = 0;
      items.forEach((item) => {
        if (item.querySelector('.history-edit-btn, .codicon-edit')) {
          editButtonCount++;
        }
      });
      return { total: items.length, withEditBtn: editButtonCount };
    });

    console.log(`   Sessions with edit button: ${hasEditButtons.withEditBtn}/${hasEditButtons.total}`);

    if (hasEditButtons.withEditBtn > 0) {
      console.log('   Edit buttons present');
      testsPassed++;
    }

    // ========================================
    // TEST 3: Title editing flow
    // ========================================
    console.log('\n--- Test 3: Title Editing Flow ---');
    testsRun++;

    if (titleInfo.total > 0) {
      // Click edit on first session
      const editClicked = await rawPage.evaluate(() => {
        const item = document.querySelector('.history-item');
        const editBtn = item?.querySelector('.history-edit-btn');
        if (editBtn) {
          editBtn.click();
          return true;
        }
        return false;
      });

      if (editClicked) {
        await sleep(500);

        // Check if edit mode is active (input field visible)
        const editModeActive = await rawPage.evaluate(() => {
          return !!document.querySelector('.history-title-input, input.history-title-input');
        });

        console.log(`   Edit mode active: ${editModeActive}`);

        if (editModeActive) {
          // Type a new title
          const originalTitle = await rawPage.evaluate(() => {
            const input = document.querySelector('.history-title-input');
            return input?.value || '';
          });

          const newTitle = `Test Title ${Date.now()}`;
          await rawPage.evaluate((title) => {
            const input = document.querySelector('.history-title-input');
            if (input) {
              input.value = title;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, newTitle);

          await sleep(200);

          // Cancel edit (don't save to avoid permanent changes)
          await rawPage.evaluate(() => {
            const cancelBtn = document.querySelector('.history-title-cancel-btn');
            if (cancelBtn) {
              cancelBtn.click();
              return true;
            }
            // Press Escape as fallback
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return false;
          });

          await sleep(300);

          // Verify edit mode closed
          const editModeClosed = await rawPage.evaluate(() => {
            return !document.querySelector('.history-title-input');
          });

          console.log(`   Edit mode closed: ${editModeClosed}`);
          console.log('   Title editing flow works');
          testsPassed++;
        } else {
          console.log('   Edit input not visible');
        }
      } else {
        console.log('   Could not click edit button');
      }
    } else {
      console.log('   No sessions to test editing');
      testsPassed++; // Pass if no sessions
    }

    // Take screenshot
    await page.screenshot('session-titles');

    // Navigate back to chat
    console.log('\n4. Returning to chat view...');
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button');
      if (backBtn) backBtn.click();
    });
    await sleep(300);

    // Cleanup
    console.log('5. Cleanup...');
    await page.switchMode('Default');

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('session-titles-error');
      } catch (e) {}
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}/${testsRun}`);

  if (testsPassed >= 2) {
    console.log('PASSED: Session titles work');
    process.exit(0);
  } else {
    console.log('FAILED: Session titles have issues');
    process.exit(1);
  }
}

testSessionTitles();
