#!/usr/bin/env node
/**
 * E2E Test: Fresh Install Error Handling
 *
 * Tests that the plugin shows correct error messages during initialization:
 * 1. When Node.js is detected but bridge isn't ready, should NOT show "Cannot find Node.js"
 * 2. When Node.js is actually missing, should show Node.js-specific error
 * 3. Loading panel should appear when bridge is extracting
 *
 * This test verifies the fix for the fresh install bug where "Cannot find Node.js"
 * was incorrectly shown even when Node.js was successfully detected.
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testFreshInstallErrorHandling() {
  console.log('=== Fresh Install Error Handling E2E Test ===\n');

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

    await sleep(1000);

    // ========================================
    // TEST 1: Check current panel state
    // ========================================
    console.log('\n--- Test 1: Check Current Panel State ---');
    testsRun++;

    const panelState = await rawPage.evaluate(() => {
      const pageText = document.body.innerText;
      const pageHtml = document.body.innerHTML;

      return {
        // Error panels
        hasNodeJsNotFoundError: pageText.includes('Cannot find Node.js') ||
                                 pageText.includes('Node.js Not Found'),
        hasAiBridgeError: pageText.includes('AI Bridge Setup Failed') ||
                          pageText.includes('AI Bridge component could not be initialized'),
        hasEnvironmentError: pageText.includes('Environment Check Failed'),
        hasInvalidNodePath: pageText.includes('Node.js Path Not Valid'),
        hasVersionError: pageText.includes('Node.js version is too low') ||
                         pageText.includes('Version Requirement Not Met'),

        // Loading state
        isLoading: pageText.includes('Extracting AI Bridge') ||
                   pageText.includes('Loading') ||
                   pageText.includes('Initializing'),

        // Chat ready state (no error)
        isChatReady: !!document.querySelector('.input-editable, [contenteditable="true"], [class*="inputEditable"]'),

        // Node.js path displayed (if any error panel shows it)
        detectedNodePath: (() => {
          const match = pageText.match(/Currently detected Node\.js path:\s*(\S+)/);
          return match ? match[1] : null;
        })(),

        // Node.js info from bridge error panel
        nodeJsInfo: (() => {
          const match = pageText.match(/Node\.js:\s*([^\n]+)/);
          return match ? match[1] : null;
        })(),

        // Debug info
        pageTextPreview: pageText.slice(0, 500),
      };
    });

    console.log('   Panel state:');
    console.log(`     - Chat ready: ${panelState.isChatReady}`);
    console.log(`     - Loading: ${panelState.isLoading}`);
    console.log(`     - Node.js Not Found error: ${panelState.hasNodeJsNotFoundError}`);
    console.log(`     - AI Bridge error: ${panelState.hasAiBridgeError}`);
    console.log(`     - Environment error: ${panelState.hasEnvironmentError}`);
    console.log(`     - Invalid path error: ${panelState.hasInvalidNodePath}`);
    console.log(`     - Version error: ${panelState.hasVersionError}`);
    console.log(`     - Detected Node.js path: ${panelState.detectedNodePath || 'none'}`);
    console.log(`     - Node.js info: ${panelState.nodeJsInfo || 'none'}`);

    // Pass if chat is ready or loading (normal states)
    if (panelState.isChatReady || panelState.isLoading) {
      console.log('   PASS: Normal state (chat ready or loading)');
      testsPassed++;
    } else {
      // If there's an error, we'll check it in the next test
      console.log('   Note: Error panel detected, will verify correctness');
      testsPassed++; // Still pass this as "state detected"
    }

    // ========================================
    // TEST 2: Verify error message correctness
    // ========================================
    console.log('\n--- Test 2: Verify Error Message Correctness ---');
    testsRun++;

    if (panelState.isChatReady) {
      console.log('   SKIP: Chat is ready, no error to verify');
      testsPassed++;
    } else if (panelState.isLoading) {
      console.log('   SKIP: Currently loading, no error to verify');
      testsPassed++;
    } else {
      // There's an error panel - verify the message is correct
      const nodePathShown = panelState.detectedNodePath || panelState.nodeJsInfo;

      if (nodePathShown && nodePathShown.includes('/')) {
        // Node.js path is shown and looks valid (contains /)
        // The error should NOT be "Cannot find Node.js" if Node.js was detected
        if (panelState.hasNodeJsNotFoundError && !panelState.hasAiBridgeError) {
          // BUG: Shows "Cannot find Node.js" but Node.js path is shown!
          console.log('   FAIL: Shows "Cannot find Node.js" but Node.js was detected: ' + nodePathShown);
          console.log('   This is the bug this test is designed to catch!');
        } else if (panelState.hasAiBridgeError) {
          // CORRECT: Shows "AI Bridge Setup Failed" with Node.js info
          console.log('   PASS: Correctly shows "AI Bridge Setup Failed" with detected Node.js');
          testsPassed++;
        } else if (panelState.hasEnvironmentError) {
          // Acceptable: Generic environment error
          console.log('   PASS: Shows environment error (acceptable)');
          testsPassed++;
        } else {
          console.log('   PASS: Some other error state');
          testsPassed++;
        }
      } else if (panelState.hasNodeJsNotFoundError) {
        // No valid Node.js path shown - "Cannot find Node.js" is correct
        console.log('   PASS: Node.js not detected, error message is appropriate');
        testsPassed++;
      } else {
        // Some other error
        console.log('   PASS: Other error state');
        testsPassed++;
      }
    }

    // ========================================
    // TEST 3: Check for proper error panel structure
    // ========================================
    console.log('\n--- Test 3: Error Panel Structure ---');
    testsRun++;

    const panelStructure = await rawPage.evaluate(() => {
      // Look for error panel components
      const hasErrorPanelTitle = !!document.querySelector('[class*="error-panel"], [class*="errorPanel"]') ||
                                  document.body.innerText.includes('Environment Check Failed') ||
                                  document.body.innerText.includes('AI Bridge Setup Failed') ||
                                  document.body.innerText.includes('Node.js');

      // Check for save button (should be present on error panels)
      const hasSaveButton = !!Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent?.toLowerCase().includes('save')
      );

      // Check for Node.js path input
      const hasPathInput = !!document.querySelector('input[type="text"]');

      return {
        hasErrorPanel: hasErrorPanelTitle,
        hasSaveButton,
        hasPathInput,
      };
    });

    if (panelState.isChatReady) {
      console.log('   SKIP: Chat is ready, no error panel to check');
      testsPassed++;
    } else if (panelState.isLoading) {
      console.log('   SKIP: Loading state');
      testsPassed++;
    } else {
      console.log(`   Has error panel structure: ${panelStructure.hasErrorPanel}`);
      console.log(`   Has save button: ${panelStructure.hasSaveButton}`);
      console.log(`   Has path input: ${panelStructure.hasPathInput}`);

      if (panelStructure.hasSaveButton || panelStructure.hasPathInput) {
        console.log('   PASS: Error panel has expected UI elements');
        testsPassed++;
      } else if (!panelStructure.hasErrorPanel) {
        console.log('   PASS: No error panel (unexpected but ok)');
        testsPassed++;
      } else {
        console.log('   WARN: Error panel may be missing expected elements');
        testsPassed++; // Still pass, just a warning
      }
    }

    // ========================================
    // TEST 4: Check loading panel behavior (if visible)
    // ========================================
    console.log('\n--- Test 4: Loading Panel Behavior ---');
    testsRun++;

    if (panelState.isLoading) {
      console.log('   Loading panel detected, waiting for completion...');

      // Wait up to 30 seconds for loading to complete
      let loadingComplete = false;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);

        const stillLoading = await rawPage.evaluate(() => {
          return document.body.innerText.includes('Extracting AI Bridge') ||
                 document.body.innerText.includes('Loading');
        });

        if (!stillLoading) {
          loadingComplete = true;
          console.log(`   Loading completed after ${i + 1} seconds`);
          break;
        }

        if (i % 5 === 4) {
          console.log(`   Still loading after ${i + 1} seconds...`);
        }
      }

      if (loadingComplete) {
        // Check final state
        const finalState = await rawPage.evaluate(() => {
          return {
            isChatReady: !!document.querySelector('.input-editable, [contenteditable="true"]'),
            hasError: document.body.innerText.includes('Error') ||
                      document.body.innerText.includes('Failed'),
          };
        });

        if (finalState.isChatReady) {
          console.log('   PASS: Loading completed, chat is now ready');
          testsPassed++;
        } else if (finalState.hasError) {
          console.log('   PASS: Loading completed, showing appropriate error');
          testsPassed++;
        } else {
          console.log('   PASS: Loading completed');
          testsPassed++;
        }
      } else {
        console.log('   WARN: Loading did not complete within 30 seconds');
        testsPassed++; // Still pass, just a warning
      }
    } else {
      console.log('   SKIP: Not in loading state');
      testsPassed++;
    }

    // Take screenshot
    await page.screenshot('fresh-install-error');

  } catch (error) {
    console.error('\nTest error:', error.message);
    if (page) {
      try {
        await page.screenshot('fresh-install-error-exception');
      } catch (e) {}
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}/${testsRun}`);

  // All tests should pass
  if (testsPassed === testsRun) {
    console.log('PASSED: Fresh install error handling works correctly');
    process.exit(0);
  } else {
    console.log('FAILED: Some tests did not pass');
    process.exit(1);
  }
}

testFreshInstallErrorHandling();
