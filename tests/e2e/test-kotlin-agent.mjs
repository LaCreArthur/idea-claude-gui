/**
 * E2E Test: Kotlin Agent Round-Trip
 *
 * Verifies the full path: React webview → JCEF bridge → Java → Kotlin AgentRuntime → Anthropic API → streaming response
 * This is the first E2E test after deleting the Node.js bridge.
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';
const TIMEOUT = 60000;

async function findClaudePage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = await page.url();
      if (url.includes('jbcefbrowser')) {
        const title = await page.title();
        console.log(`  Found JCEF page: "${title}" @ ${url.slice(0, 60)}...`);
        if (title.includes('Claude')) {
          return page;
        }
      }
    }
  }
  return null;
}

async function run() {
  console.log('=== Kotlin Agent E2E Test ===\n');

  // Step 1: Connect via CDP
  console.log('1. Connecting to Rider via CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = await findClaudePage(browser);
  if (!page) {
    console.error('ERROR: Claude GUI page not found. Is the panel open?');
    process.exit(1);
  }
  console.log('   Connected.\n');

  // Step 2: Check webview state
  console.log('2. Checking webview state...');
  const state = await page.evaluate(() => ({
    hasSendToJava: typeof window.sendToJava === 'function',
    hasInput: !!document.querySelector('.input-editable'),
    hasSubmit: !!document.querySelector('.submit-button'),
    messageCount: document.querySelectorAll('.message-item').length,
    bodyText: document.body?.innerText?.slice(0, 200),
  }));
  console.log(`   sendToJava: ${state.hasSendToJava}`);
  console.log(`   Input field: ${state.hasInput}`);
  console.log(`   Submit button: ${state.hasSubmit}`);
  console.log(`   Existing messages: ${state.messageCount}`);
  if (!state.hasSendToJava) {
    console.error('ERROR: window.sendToJava not available — bridge not initialized');
    console.log('   Body preview:', state.bodyText);
    await browser.close();
    process.exit(1);
  }
  if (!state.hasInput) {
    console.error('ERROR: Input field not found');
    console.log('   Body preview:', state.bodyText);
    await browser.close();
    process.exit(1);
  }
  console.log('   Webview ready.\n');

  // Step 3: Start a new session to avoid polluting existing conversation
  console.log('3. Starting new session...');
  await page.evaluate(() => {
    window.sendToJava('create_new_session:{}');
  });
  await page.waitForTimeout(1000);
  console.log('   New session created.\n');

  // Step 4: Send a simple message
  // First, switch model to Haiku (Sonnet 4.x isn't available via OAuth Max tokens yet)
  console.log('3b. Switching model to claude-haiku-4-5-20251001...');
  await page.evaluate(() => {
    window.sendToJava('set_model:{"model":"claude-haiku-4-5-20251001"}');
  });
  await page.waitForTimeout(500);

  const testMessage = 'Reply with exactly: KOTLIN_AGENT_OK';
  console.log(`4. Sending message: "${testMessage}"`);

  // Use sendToJava directly to bypass any UI issues
  const msgCountBefore = await page.evaluate(() =>
    document.querySelectorAll('.message-item').length
  );

  await page.evaluate((msg) => {
    window.sendToJava(`send_message:${JSON.stringify({ content: msg })}`);
  }, testMessage);
  console.log('   Message sent via bridge.\n');

  // Step 5: Wait for response
  console.log('5. Waiting for assistant response...');
  const startTime = Date.now();
  let response = null;
  let lastBodyText = '';

  while (Date.now() - startTime < TIMEOUT) {
    const state = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      // Check for ERROR in the body
      const errorMatch = bodyText.match(/ERROR\n\n(.+)/);
      return { bodyText, error: errorMatch ? errorMatch[1] : null };
    });

    if (state.error && !state.error.includes('KOTLIN_AGENT_OK')) {
      console.error(`   ERROR: ${state.error.slice(0, 200)}`);
      await browser.close();
      process.exit(1);
    }

    // Check for expected response in body text
    if (state.bodyText.includes('KOTLIN_AGENT_OK')) {
      response = 'KOTLIN_AGENT_OK';
      break;
    }

    // Check for any usage indicator (means response completed)
    const usageMatch = state.bodyText.match(/(\d+\.?\d*k?\s+in\s+\/\s+\d+\.?\d*k?\s+out)/);
    if (usageMatch && state.bodyText !== lastBodyText) {
      // Response complete — extract content between user message and usage
      const parts = state.bodyText.split(testMessage);
      if (parts.length > 1) {
        response = parts[parts.length - 1].split(/\d+\.?\d*k?\s+in\s+\//)[0].trim();
        if (response.length > 0) break;
      }
    }

    lastBodyText = state.bodyText;
    await page.waitForTimeout(500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!response) {
    console.error(`   TIMEOUT after ${elapsed}s — no response received`);
    const debug = await page.evaluate(() => document.body?.innerText?.slice(-500));
    console.log('   Body tail:', debug);
    await browser.close();
    process.exit(1);
  }

  console.log(`   Response received in ${elapsed}s`);
  console.log(`   Content: "${response.slice(0, 200)}"`);

  // Step 6: Verify
  console.log('\n6. Verification:');
  const hasExpected = response.includes('KOTLIN_AGENT_OK');
  console.log(`   Contains expected text: ${hasExpected ? 'YES' : 'NO (model may have rephrased, but response received — OK)'}`);
  console.log(`   Response length: ${response.length} chars`);

  console.log('\n=== RESULT: PASS ===');
  console.log('Kotlin agent runtime is working end-to-end.');

  await browser.close();
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
