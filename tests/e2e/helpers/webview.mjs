/**
 * E2E Test Helpers for Claude GUI
 *
 * Uses Playwright via CDP to interact with JCEF webview.
 * Key pattern: Use page.evaluate() for clicks to bypass overlay interception.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

let cachedBrowser = null;
let cachedPage = null;

/**
 * Connect to Claude GUI webview via CDP
 * Reuses connection if already established
 */
export async function getPage() {
  if (cachedPage) {
    try {
      // Verify connection still works
      await cachedPage.title();
      return { browser: cachedBrowser, page: cachedPage };
    } catch {
      cachedBrowser = null;
      cachedPage = null;
    }
  }

  const browser = await chromium.connectOverCDP('http://localhost:9222');

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title();
      if (title.includes('Claude')) {
        cachedBrowser = browser;
        cachedPage = page;
        return { browser, page };
      }
    }
  }

  throw new Error('Claude webview not found. Is Claude GUI panel open in Rider?');
}

/**
 * Close the cached connection
 */
export async function closeConnection() {
  if (cachedBrowser) {
    await cachedBrowser.close();
    cachedBrowser = null;
    cachedPage = null;
  }
}

/**
 * Send a message to Claude
 */
export async function sendMessage(text) {
  const { page } = await getPage();

  const input = await page.$('.input-editable');
  if (!input) throw new Error('Input field not found');

  await input.click();
  await page.keyboard.type(text);

  // Wait for submit button to be enabled
  await page.waitForTimeout(200);

  const submitEnabled = await page.evaluate(() => {
    const btn = document.querySelector('.submit-button');
    return btn && !btn.disabled;
  });

  if (!submitEnabled) {
    throw new Error('Submit button is disabled');
  }

  await page.click('.submit-button');
  return true;
}

/**
 * Click element via JavaScript (bypasses overlay interception)
 */
export async function clickViaJS(selector) {
  const { page } = await getPage();
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, selector);
}

/**
 * Wait for a dialog to appear
 */
export async function waitForDialog(dialogSelector, timeout = 30000) {
  const { page } = await getPage();
  await page.waitForSelector(dialogSelector, { timeout });
  return true;
}

/**
 * Check if dialog is visible
 */
export async function isDialogVisible(dialogSelector) {
  const { page } = await getPage();
  return page.evaluate((sel) => !!document.querySelector(sel), dialogSelector);
}

/**
 * Get absolute path for a screenshot file
 * @param {string} name - Screenshot name (without path, with or without extension)
 */
export function getScreenshotPath(name) {
  const filename = name.endsWith('.png') ? name : `${name}-${Date.now()}.png`;
  return join(SCREENSHOTS_DIR, filename);
}

/**
 * Take a screenshot
 * @param {string} nameOrPath - Either a simple name (will use screenshots dir) or full path
 */
export async function screenshot(nameOrPath) {
  const { page } = await getPage();
  // If it looks like a relative path with directories, convert to absolute
  const path = nameOrPath.includes('/') ? nameOrPath : getScreenshotPath(nameOrPath);
  await page.screenshot({ path, fullPage: true });
  return path;
}

// ============ AskUserQuestion ============

/**
 * Wait for AskUserQuestion dialog
 */
export async function waitForAskUser(timeout = 30000) {
  return waitForDialog('.ask-user-question-dialog', timeout);
}

/**
 * Answer AskUserQuestion dialog
 * @param {number} optionIndex - Which option to select (0-based)
 */
export async function answerAskUser(optionIndex = 0) {
  const { page } = await getPage();

  // Click option
  await page.evaluate((idx) => {
    const options = document.querySelectorAll('button.question-option');
    if (options[idx]) options[idx].click();
  }, optionIndex);

  await page.waitForTimeout(200);

  // Click Submit
  await page.evaluate(() => {
    const submit = document.querySelector('.ask-user-question-dialog-actions .action-button.primary');
    if (submit && !submit.disabled) submit.click();
  });

  // Wait for dialog to close
  await page.waitForTimeout(500);

  const stillVisible = await isDialogVisible('.ask-user-question-dialog');
  return !stillVisible;
}

// ============ Permission Dialog ============

/**
 * Wait for Permission dialog
 */
export async function waitForPermission(timeout = 30000) {
  return waitForDialog('.permission-dialog-v3', timeout);
}

/**
 * Answer Permission dialog
 * @param {'allow'|'always'|'deny'} option
 */
export async function answerPermission(option = 'allow') {
  const { page } = await getPage();

  const optionMap = { allow: 0, always: 1, deny: 2 };
  const idx = optionMap[option] ?? 0;

  await page.evaluate((i) => {
    const options = document.querySelectorAll('.permission-dialog-v3-option');
    if (options[i]) options[i].click();
  }, idx);

  await page.waitForTimeout(500);

  const stillVisible = await isDialogVisible('.permission-dialog-v3');
  return !stillVisible;
}

// ============ Mode Switching ============

/**
 * Get current mode
 */
export async function getCurrentMode() {
  const { page } = await getPage();
  return page.evaluate(() => {
    // Find the mode selector button (contains Auto-accept, Default, Plan, etc.)
    const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
    const buttons = document.querySelectorAll('.selector-button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      if (modeKeywords.some(k => text?.includes(k))) {
        return text;
      }
    }
    return 'Unknown';
  });
}

/**
 * Switch permission mode
 * @param {'Default'|'Plan'|'Auto-accept'|'Accept Edits'} modeName
 */
export async function switchMode(modeName) {
  const { page } = await getPage();

  // First close any open dropdowns by clicking elsewhere
  await page.evaluate(() => {
    document.body.click();
  });
  await page.waitForTimeout(100);

  // Find and click the mode selector button (not model selector)
  const clicked = await page.evaluate(() => {
    const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
    const buttons = document.querySelectorAll('.selector-button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      if (modeKeywords.some(k => text?.includes(k))) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error('Mode selector button not found');
  }

  await page.waitForTimeout(200);

  // Verify dropdown opened
  const dropdownOpen = await isDialogVisible('.selector-dropdown');
  if (!dropdownOpen) {
    throw new Error('Mode dropdown did not open');
  }

  // Click mode option
  const optionClicked = await page.evaluate((mode) => {
    const options = document.querySelectorAll('.selector-option');
    for (const opt of options) {
      if (opt.textContent?.includes(mode)) {
        opt.click();
        return true;
      }
    }
    return false;
  }, modeName);

  if (!optionClicked) {
    throw new Error(`Mode "${modeName}" not found in dropdown`);
  }

  await page.waitForTimeout(200);

  // Verify mode changed
  const newMode = await getCurrentMode();
  return newMode.includes(modeName);
}

// ============ Plan Approval ============

/**
 * Wait for Plan Approval dialog
 */
export async function waitForPlanApproval(timeout = 60000) {
  return waitForDialog('.plan-approval-dialog', timeout);
}

/**
 * Approve plan with execution mode
 * @param {'Default'|'Accept Edits'|'Full Auto'} executionMode
 */
export async function approvePlan(executionMode = 'Default') {
  const { page } = await getPage();

  // Select execution mode
  await page.evaluate((mode) => {
    const options = document.querySelectorAll('.plan-approval-mode-option');
    for (const opt of options) {
      if (opt.textContent?.includes(mode)) {
        opt.click();
        return true;
      }
    }
    return false;
  }, executionMode);

  await page.waitForTimeout(200);

  // Click Execute Plan
  await page.evaluate(() => {
    const btn = document.querySelector('.plan-approval-dialog-actions .action-button.primary');
    if (btn) btn.click();
  });

  await page.waitForTimeout(500);

  const stillVisible = await isDialogVisible('.plan-approval-dialog');
  return !stillVisible;
}

/**
 * Reject plan
 */
export async function rejectPlan() {
  const { page } = await getPage();

  await page.evaluate(() => {
    const btn = document.querySelector('.plan-approval-dialog-actions .action-button.secondary');
    if (btn) btn.click();
  });

  await page.waitForTimeout(500);

  const stillVisible = await isDialogVisible('.plan-approval-dialog');
  return !stillVisible;
}

// ============ State Checking ============

/**
 * Check if Claude is generating a response
 */
export async function isGenerating() {
  const { page } = await getPage();
  return page.evaluate(() =>
    !!document.querySelector('[class*="generating"], [class*="streaming"]')
  );
}

/**
 * Wait for Claude to finish generating
 */
export async function waitForGenerationComplete(timeout = 120000) {
  const { page } = await getPage();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const generating = await isGenerating();
    if (!generating) return true;
    await page.waitForTimeout(500);
  }

  throw new Error('Timeout waiting for generation to complete');
}

/**
 * Get test message log (if test mode enabled)
 */
export async function getTestLog() {
  const { page } = await getPage();
  return page.evaluate(() => window.__testMessageLog || []);
}

/**
 * Check if test mode is enabled
 */
export async function isTestMode() {
  const { page } = await getPage();
  return page.evaluate(() => !!window.__testMode);
}

// ============ Session Management ============

/**
 * Start a new session (clears chat history)
 */
export async function startNewSession() {
  const { page } = await getPage();

  // Click New Session button
  await page.evaluate(() => {
    const btn = document.querySelector('.icon-button[data-tooltip="New Session"]');
    if (btn) btn.click();
  });

  await page.waitForTimeout(500);

  // Confirm dialog if it appears
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.includes('Confirm')) btn.click();
    }
  });

  await page.waitForTimeout(1000);

  // Verify empty session
  const msgCount = await page.evaluate(() =>
    document.querySelectorAll('.message').length
  );

  return msgCount === 0;
}

/**
 * Clear test log
 */
export async function clearTestLog() {
  const { page } = await getPage();
  await page.evaluate(() => {
    window.__testMessageLog = [];
  });
}

/**
 * Get last assistant message
 */
export async function getLastAssistantMessage() {
  const { page } = await getPage();
  return page.evaluate(() => {
    const msgs = document.querySelectorAll('.message.assistant');
    if (msgs.length > 0) {
      return msgs[msgs.length - 1].textContent || '';
    }
    return '';
  });
}

/**
 * Sleep helper
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
