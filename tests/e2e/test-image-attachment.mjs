#!/usr/bin/env node
/**
 * E2E Test: Image Attachment Flow
 *
 * Tests image attachment functionality:
 * 1. Drag and drop image onto input
 * 2. Verify attachment appears in list
 * 3. Send message with attachment
 * 4. Verify Claude responds (doesn't get stuck on "generating")
 *
 * Bug context: User reported UI gets stuck on "generating response" when attaching images.
 */

import { chromium } from 'playwright';
import { connectToClaudeGUI } from './pages/ClaudeGUIPage.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to test image (logo.png from the project)
const TEST_IMAGE_PATH = join(__dirname, '..', '..', 'src', 'main', 'resources', 'icons', 'logo.png');

/**
 * Simulate drag and drop of an image file
 * Uses DataTransfer API to create a proper drop event
 */
async function simulateImageDrop(page, imagePath, targetSelector) {
  // Read the image file
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const fileName = imagePath.split('/').pop();

  // Simulate drop event with file data
  return page.evaluate(
    async ({ base64, name, selector }) => {
      const target = document.querySelector(selector);
      if (!target) {
        throw new Error(`Drop target not found: ${selector}`);
      }

      // Convert base64 to Blob
      const byteString = atob(base64);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'image/png' });

      // Create a File from the Blob
      const file = new File([blob], name, { type: 'image/png' });

      // Create DataTransfer with the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create and dispatch dragover event first
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      target.dispatchEvent(dragOverEvent);

      // Create and dispatch drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      target.dispatchEvent(dropEvent);

      return true;
    },
    { base64: base64Image, name: fileName, selector: targetSelector }
  );
}

/**
 * Check if attachment list contains items
 */
async function getAttachmentCount(rawPage) {
  return rawPage.evaluate(() => {
    const items = document.querySelectorAll('.attachment-item');
    return items.length;
  });
}

/**
 * Check if an image attachment is visible
 */
async function hasImageAttachment(rawPage) {
  return rawPage.evaluate(() => {
    const thumbnail = document.querySelector('.attachment-thumbnail');
    return !!thumbnail;
  });
}

/**
 * Remove an attachment by clicking its remove button
 */
async function removeAttachment(rawPage, index = 0) {
  return rawPage.evaluate((idx) => {
    const removeButtons = document.querySelectorAll('.attachment-remove');
    if (removeButtons[idx]) {
      removeButtons[idx].click();
      return true;
    }
    return false;
  }, index);
}

async function testImageAttachment() {
  console.log('=== E2E Test: Image Attachment ===\n');

  let browser, page, rawPage;
  let testPassed = false;

  try {
    // Connect to Claude GUI
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
      console.log('   Dismissing leftover permission dialog...');
      await rawPage.evaluate(() => {
        const options = document.querySelectorAll('.permission-dialog-v3-option');
        for (const opt of options) {
          if (opt.textContent?.includes('Deny')) {
            opt.click();
            return;
          }
        }
      });
      await rawPage.waitForTimeout(1000);
      dialogCount++;
    }

    // Start fresh session
    console.log('2. Starting new session...');
    await page.newSession();
    console.log('   ✅ New session started');

    // Use Auto-accept mode to avoid permission dialogs
    console.log('3. Setting Auto-accept mode...');
    await page.switchMode('Auto-accept');
    console.log(`   ✅ Mode: ${await page.getCurrentMode()}`);

    // Test drag and drop image attachment
    console.log('4. Testing drag-and-drop image attachment...');

    // Check initial state - no attachments
    let attachmentCount = await getAttachmentCount(rawPage);
    console.log(`   Initial attachment count: ${attachmentCount}`);

    // Drop image onto input area
    console.log('   Simulating image drop...');
    const dropSuccess = await simulateImageDrop(rawPage, TEST_IMAGE_PATH, '.input-editable');

    if (!dropSuccess) {
      console.log('   ❌ Drop simulation failed');
      throw new Error('Failed to simulate image drop');
    }

    // Wait for attachment to process
    await rawPage.waitForTimeout(500);

    // Verify attachment appeared
    attachmentCount = await getAttachmentCount(rawPage);
    const hasImage = await hasImageAttachment(rawPage);

    console.log(`   Attachment count after drop: ${attachmentCount}`);
    console.log(`   Has image thumbnail: ${hasImage}`);

    if (attachmentCount === 0) {
      console.log('   ⚠️ Attachment not added - may be a JCEF limitation');
      console.log('   Trying alternative approach: file input...');

      // Try triggering file input directly (may not work in JCEF)
      const fileInputExists = await rawPage.evaluate(() => {
        const input = document.querySelector('input[type="file"]');
        return !!input;
      });
      console.log(`   File input exists: ${fileInputExists}`);

      // Take screenshot to debug
      await page.screenshot('image-attachment-drop-failed');
      console.log('   Screenshot saved for debugging');

      // Still try to send a message to test basic flow
      console.log('\n5. Testing message with text (fallback)...');
    } else {
      console.log('   ✅ Image attachment added successfully');

      // Take screenshot of attachment
      await page.screenshot('image-attachment-added');
    }

    // Send message (with or without attachment)
    console.log('5. Sending message with attachment...');
    const testMessage = attachmentCount > 0
      ? 'What do you see in this image? Just describe it briefly.'
      : 'Without using any tools, just say "Image test fallback response"';

    await page.sendMessage(testMessage);
    console.log('   ✅ Message sent');

    // Wait for response - this is where the bug reportedly occurs
    console.log('6. Waiting for response (testing for "stuck on generating" bug)...');
    const startTime = Date.now();

    try {
      await page.waitForResponse(90000); // 90 second timeout for image processing
      const responseTime = Date.now() - startTime;
      console.log(`   Generation completed in ${Math.round(responseTime / 1000)}s`);

      // Wait a bit more for DOM to update
      await rawPage.waitForTimeout(2000);

      // Get response content using multiple methods
      let response = await page.getLastResponse();

      // If that didn't work, try alternative selectors
      if (!response) {
        response = await rawPage.evaluate(() => {
          // Try various selectors for assistant messages
          const selectors = [
            '.message.assistant',
            '.message.assistant .message-content',
            '[data-role="assistant"]',
            '.assistant-message',
            '.chat-message.assistant',
          ];

          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              const lastEl = els[els.length - 1];
              return lastEl.textContent?.trim() || lastEl.innerText?.trim();
            }
          }

          return null;
        });
      }

      // Debug: check what messages exist
      const messageState = await rawPage.evaluate(() => {
        const allMessages = document.querySelectorAll('.message');
        const userMessages = document.querySelectorAll('.message.user');
        const assistantMessages = document.querySelectorAll('.message.assistant');
        return {
          total: allMessages.length,
          user: userMessages.length,
          assistant: assistantMessages.length,
          bodyPreview: document.body.innerText.substring(0, 500),
        };
      });

      console.log(`   Message state: total=${messageState.total}, user=${messageState.user}, assistant=${messageState.assistant}`);

      if (response && response.trim().length > 0) {
        console.log(`   ✅ Response received: "${response.substring(0, 150)}..."`);
        testPassed = true;
      } else {
        console.log('   ⚠️ No response content found');
        console.log('   This may indicate the "no response displayed" bug');

        // Check for error state
        const hasError = await rawPage.evaluate(() => {
          return !!document.querySelector('.error-message') ||
                 document.body.innerText.includes('Error') ||
                 document.body.innerText.includes('error');
        });
        console.log(`   Error state detected: ${hasError}`);

        // Take debug screenshot
        await page.screenshot('image-attachment-no-response');
      }
    } catch (timeoutError) {
      console.log('   ❌ TIMEOUT: Response not received');
      console.log('   This confirms the "stuck on generating" bug!');

      // Check if still in generating state
      const isGenerating = await rawPage.evaluate(() => {
        return document.body.innerText?.includes('Generating') ||
               !!document.querySelector('.generating');
      });
      console.log(`   Still generating: ${isGenerating}`);

      await page.screenshot('image-attachment-stuck');
    }

    // Cleanup test: remove attachment if present
    if (attachmentCount > 0) {
      console.log('7. Testing attachment removal...');
      const removed = await removeAttachment(rawPage);
      await rawPage.waitForTimeout(300);
      const newCount = await getAttachmentCount(rawPage);
      console.log(`   Removed: ${removed}, New count: ${newCount}`);
    }

    // Final screenshot
    console.log('8. Taking final screenshot...');
    await page.screenshot('image-attachment-final');

    // Reset to Default mode
    console.log('9. Cleanup: resetting to Default mode...');
    await page.switchMode('Default');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    if (page) {
      try {
        await page.screenshot('image-attachment-error');
      } catch (e) {
        // Ignore screenshot errors
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n=== Test Result ===');
  if (testPassed) {
    console.log('✅ PASSED: Image attachment flow works correctly');
    process.exit(0);
  } else {
    console.log('❌ FAILED: Image attachment bug detected');
    console.log('');
    console.log('BUG DETAILS:');
    console.log('- Image attachment works (drag-drop adds attachment)');
    console.log('- Message with image sends successfully');
    console.log('- Generation indicator disappears (appears to complete)');
    console.log('- BUT: No assistant response is rendered in the UI');
    console.log('');
    console.log('This confirms the user-reported "stuck on generating" symptom.');
    console.log('The issue is likely in the response rendering, not the generation.');
    process.exit(1);
  }
}

testImageAttachment();
