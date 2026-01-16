/**
 * E2E Test: Permission Dialog Flow
 *
 * Tests that the permission dialog appears in Default mode for commands
 * NOT in the Claude Code allow list, and that the response flow works.
 *
 * NOTE: Commands in .claude/settings.local.json "allow" list are auto-approved
 * by the SDK. This test uses a command (curl) that's NOT in any allow pattern.
 */

import { chromium } from 'playwright';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testPermissionFlow() {
  console.log('=== Permission Dialog E2E Test ===\n');

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  let testPassed = false;

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title();
      if (!title.includes('Claude')) continue;

      console.log('1. Found Claude webview');

      // Step 1: Start new session
      console.log('2. Starting new session...');
      await page.evaluate(() => {
        const btn = document.querySelector('.icon-button[data-tooltip="New Session"]');
        if (btn) btn.click();
      });
      await sleep(500);

      // Confirm dialog if it appears
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.includes('Confirm')) btn.click();
        }
      });
      await sleep(2000);

      // Wait for any ongoing generation to complete
      for (let i = 0; i < 30; i++) {
        const isGenerating = await page.evaluate(() => {
          return document.body.innerText?.includes('Generating');
        });
        if (!isGenerating) break;
        await sleep(1000);
      }

      // Dismiss any leftover permission dialogs from previous tests
      let dialogCount = 0;
      while (dialogCount < 5) { // Max 5 dialogs to prevent infinite loop
        const hasExistingDialog = await page.evaluate(() => {
          return !!document.querySelector('.permission-dialog-v3');
        });
        if (!hasExistingDialog) break;

        console.log('   (Dismissing leftover dialog from previous test...)');
        await page.evaluate(() => {
          // Click Deny to dismiss
          const options = document.querySelectorAll('.permission-dialog-v3-option');
          for (const opt of options) {
            if (opt.textContent?.includes('Deny')) {
              opt.click();
              return;
            }
          }
        });
        await sleep(1000);
        dialogCount++;
      }

      // Verify no messages
      const msgCount = await page.evaluate(() => {
        return document.querySelectorAll('.message').length;
      });
      console.log(`3. Session has ${msgCount} messages (should be 0)`);

      // Verify mode is Default
      const modeText = await page.evaluate(() => {
        const btns = document.querySelectorAll('.selector-button');
        for (const btn of btns) {
          if (btn.textContent?.includes('Default') || btn.textContent?.includes('Auto-accept')) {
            return btn.textContent;
          }
        }
        return 'not found';
      });
      console.log(`4. Current mode: ${modeText}`);

      // Clear log
      await page.evaluate(() => { window.__testMessageLog = []; });

      // Step 2: Send message requiring a command NOT in allow list
      // curl is typically not in allow lists and should trigger permission
      const testUrl = 'https://httpbin.org/uuid';
      const message = `Run this bash command and show me the output: curl -s ${testUrl}`;
      console.log(`5. Sending message: ${message}`);

      await page.evaluate((msg) => {
        const input = document.querySelector('.input-editable');
        if (input) {
          input.innerText = msg;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, message);
      await sleep(300);

      await page.evaluate(() => {
        const btn = document.querySelector('.submit-button');
        if (btn) btn.click();
      });

      // Step 3: Wait for permission dialog
      console.log('6. Waiting for permission dialog...');
      try {
        await page.waitForSelector('.permission-dialog-v3', { timeout: 60000 });
        console.log('7. ✅ Permission dialog appeared');

        // Verify dialog shows our command
        const dialogText = await page.evaluate(() => {
          return document.querySelector('.permission-dialog-v3')?.innerText || '';
        });

        if (dialogText.includes('curl') && dialogText.includes(testUrl)) {
          console.log('8. ✅ Dialog shows correct command');
        } else {
          console.log('8. ⚠️ Dialog shows different command');
          console.log('   Got:', dialogText.substring(0, 300));
        }

        // Step 4: Click "Allow Once"
        console.log('9. Clicking "Allow Once"...');
        await page.evaluate(() => {
          const options = document.querySelectorAll('.permission-dialog-v3-option');
          for (const opt of options) {
            if (opt.textContent?.includes('Allow Once')) {
              opt.click();
              return true;
            }
          }
          if (options.length > 0) {
            options[0].click(); // Fallback
            return true;
          }
          return false;
        });

        // Step 5: Wait for response
        console.log('10. Waiting for command execution...');
        await sleep(2000);

        // Check dialog dismissed
        const dialogStillVisible = await page.evaluate(() => {
          return !!document.querySelector('.permission-dialog-v3');
        });
        if (!dialogStillVisible) {
          console.log('11. ✅ Permission dialog dismissed');
        } else {
          console.log('11. ⚠️ Dialog still visible');
        }

        // Wait for Claude to finish
        console.log('12. Waiting for response...');
        for (let i = 0; i < 30; i++) {
          const isLoading = await page.evaluate(() => {
            return document.body.innerText?.includes('Generating');
          });
          if (!isLoading) break;
          await sleep(1000);
        }

        // Verify response contains UUID (httpbin returns a UUID)
        const response = await page.evaluate(() => {
          const msgs = document.querySelectorAll('.message.assistant');
          if (msgs.length > 0) {
            return msgs[msgs.length - 1].textContent || '';
          }
          return '';
        });

        // httpbin.org/uuid returns {"uuid": "..."}
        if (response.includes('uuid')) {
          console.log('13. ✅ Command executed successfully');
          testPassed = true;
        } else {
          console.log('13. ⚠️ Response does not contain expected output');
          console.log('    Response:', response.substring(0, 400));
        }

      } catch (e) {
        console.log('7. ❌ Permission dialog did not appear');
        console.log('   Error:', e.message);

        // If a command in the allow list was used, explain
        console.log('\n   NOTE: If the command was auto-approved, it may be in');
        console.log('   .claude/settings.local.json allow list. Try a different command.');
      }

      // Take final screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/permission-flow-final.png' });
      break;
    }
  }

  await browser.close();

  console.log('\n=== Test Result ===');
  if (testPassed) {
    console.log('✅ PASSED: Permission flow works correctly');
    process.exit(0);
  } else {
    console.log('❌ FAILED: Permission flow has issues');
    process.exit(1);
  }
}

testPermissionFlow().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
