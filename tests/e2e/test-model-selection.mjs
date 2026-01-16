#!/usr/bin/env node
/**
 * E2E Test: US-4 - Model Selection
 *
 * Tests model switching functionality:
 * 1. Get current model
 * 2. Switch between Sonnet, Opus, Haiku
 * 3. Verify model changes
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testModelSelection() {
  console.log('=== US-4: Model Selection E2E Test ===\n');

  let browser, page, rawPage;
  let testPassed = false;

  try {
    // Connect
    console.log('1. Connecting to Claude GUI...');
    const connection = await connectToClaudeGUI(chromium);
    browser = connection.browser;
    page = connection.page;
    rawPage = connection.rawPage;
    console.log('   ✅ Connected');

    // Dismiss any leftover dialogs
    let dialogCount = 0;
    while (dialogCount < 5) {
      const hasDialog = await rawPage.evaluate(() => !!document.querySelector('.permission-dialog-v3'));
      if (!hasDialog) break;
      console.log('   Dismissing leftover dialog...');
      await rawPage.evaluate(() => {
        const options = document.querySelectorAll('.permission-dialog-v3-option');
        for (const opt of options) {
          if (opt.textContent?.includes('Deny')) { opt.click(); return; }
        }
      });
      await sleep(1000);
      dialogCount++;
    }

    // Navigate back if in history view
    await rawPage.evaluate(() => {
      const backBtn = document.querySelector('.back-button');
      if (backBtn) backBtn.click();
    });
    await sleep(300);

    // Start fresh session
    console.log('2. Starting new session...');
    await page.newSession();
    await sleep(500);

    // Get current model
    console.log('3. Getting current model...');
    const initialModel = await page.getCurrentModel();
    console.log(`   Current model: ${initialModel}`);

    // Helper to switch and verify model
    async function switchAndVerify(targetModel) {
      console.log(`\n   Switching to ${targetModel}...`);
      await page.switchModel(targetModel);
      await sleep(500);
      const newModel = await page.getCurrentModel();
      console.log(`   New model: ${newModel}`);
      return newModel.includes(targetModel);
    }

    // Test switching to different models
    let switchSuccesses = 0;
    const modelsToTest = ['Sonnet', 'Opus', 'Haiku'];

    console.log('4. Testing model switching...');
    for (const model of modelsToTest) {
      const success = await switchAndVerify(model);
      if (success) {
        console.log(`   ✅ ${model} switch successful`);
        switchSuccesses++;
      } else {
        console.log(`   ⚠️ ${model} switch may have failed`);
      }
    }

    // Return to a common model
    console.log('\n5. Returning to Sonnet...');
    await page.switchModel('Sonnet');
    await sleep(300);

    // Verify at least some switches worked
    console.log(`\n6. Results: ${switchSuccesses}/${modelsToTest.length} switches successful`);

    if (switchSuccesses >= 2) {
      testPassed = true;
    }

    // Check test log for model messages
    console.log('7. Checking for model selection messages...');
    await page.clearTestLog();

    // Do one more switch to capture the message
    await page.switchModel('Opus');
    await sleep(500);

    const log = await page.getTestLog();
    const modelMessages = log.filter((e) =>
      e.msg?.includes('model') || e.msg?.includes('Model')
    );
    console.log(`   Found ${modelMessages.length} model-related messages`);

    // Take screenshot
    console.log('8. Taking screenshot...');
    await page.screenshot('model-selection');

    // Cleanup: return to Sonnet
    console.log('9. Cleanup: returning to Sonnet...');
    await page.switchModel('Sonnet');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    if (page) {
      try {
        await page.screenshot('model-selection-error');
      } catch (e) {}
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Result ===');
  if (testPassed) {
    console.log('✅ PASSED: Model selection works');
    process.exit(0);
  } else {
    console.log('❌ FAILED: Model selection has issues');
    process.exit(1);
  }
}

testModelSelection();
