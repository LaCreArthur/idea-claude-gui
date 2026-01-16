/**
 * Page Object Model: Claude GUI Page
 *
 * Encapsulates all interactions with the Claude GUI webview.
 * Uses resilient selectors with fallback strategies for self-healing.
 */

export class ClaudeGUIPage {
  constructor(page) {
    this.page = page;

    // Selectors with fallbacks (primary, fallback1, fallback2)
    this.selectors = {
      // Chat Input
      chatInput: ['.input-editable', '[contenteditable="true"]', 'div[role="textbox"]'],
      submitButton: ['.submit-button', 'button[type="submit"]', 'button:has-text("Send")'],

      // Messages
      userMessage: ['.message.user', '[data-role="user"]', '.chat-message.user'],
      assistantMessage: ['.message.assistant', '[data-role="assistant"]', '.chat-message.assistant'],
      messageContent: ['.message-content', '.markdown-content', '.prose'],

      // Mode Selector
      modeButton: ['.selector-button', '[data-testid="mode-selector"]'],
      modeOption: ['.selector-option', '[data-testid="mode-option"]'],
      modeDropdown: ['.selector-dropdown', '[role="listbox"]'],

      // Dialogs
      permissionDialog: ['.permission-dialog-v3', '[data-testid="permission-dialog"]'],
      permissionOption: ['.permission-dialog-v3-option', '[data-testid="permission-option"]'],
      askUserDialog: ['.ask-user-question-dialog', '[data-testid="ask-user-dialog"]'],
      askUserOption: ['button.question-option', '[data-testid="question-option"]'],
      planDialog: ['.plan-approval-dialog', '[data-testid="plan-dialog"]'],

      // Actions
      primaryButton: ['.action-button.primary', 'button.primary', '[data-testid="primary-action"]'],
      secondaryButton: ['.action-button.secondary', 'button.secondary'],

      // Session
      newSessionButton: ['.icon-button[data-tooltip="New Session"]', '[data-testid="new-session"]'],
      sessionList: ['.session-list', '[data-testid="session-list"]'],
      sessionItem: ['.session-item', '[data-testid="session-item"]'],

      // Model Selector
      modelButton: ['.model-selector', '[data-testid="model-selector"]'],
      modelOption: ['.model-option', '[data-testid="model-option"]'],

      // Status
      generatingIndicator: ['.generating', '[data-testid="generating"]', ':text("Generating")'],
      errorMessage: ['.error-message', '[data-testid="error"]', '.toast-error'],
    };
  }

  /**
   * Find element using fallback selectors (self-healing)
   */
  async findElement(selectorKey) {
    const selectors = this.selectors[selectorKey];
    if (!selectors) throw new Error(`Unknown selector key: ${selectorKey}`);

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) return { element, usedSelector: selector };
      } catch (e) {
        // Try next selector
      }
    }

    // Try by text content as last resort for buttons
    if (selectorKey.includes('Button') || selectorKey.includes('Option')) {
      const element = await this.page.$(`button, [role="button"]`);
      if (element) return { element, usedSelector: 'fallback-button' };
    }

    return { element: null, usedSelector: null };
  }

  /**
   * Click element with fallback selectors
   */
  async click(selectorKey) {
    const { element, usedSelector } = await this.findElement(selectorKey);
    if (!element) throw new Error(`Element not found: ${selectorKey}`);

    // Use JS click to bypass overlays
    await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, usedSelector);

    return true;
  }

  /**
   * Wait for element to appear
   */
  async waitFor(selectorKey, timeout = 30000) {
    const selectors = this.selectors[selectorKey];
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        const visible = await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el && el.offsetParent !== null;
        }, selector);

        if (visible) return true;
      }
      await this.page.waitForTimeout(200);
    }

    throw new Error(`Timeout waiting for: ${selectorKey}`);
  }

  /**
   * Check if element is visible
   */
  async isVisible(selectorKey) {
    const { element } = await this.findElement(selectorKey);
    if (!element) return false;

    return await this.page.evaluate((el) => {
      return el && el.offsetParent !== null;
    }, element);
  }

  // ==================== Chat Actions ====================

  /**
   * Send a message to Claude
   */
  async sendMessage(text) {
    // Clear and type in input
    await this.page.evaluate((msg) => {
      const input = document.querySelector('.input-editable') ||
                    document.querySelector('[contenteditable="true"]');
      if (input) {
        input.innerText = msg;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, text);

    await this.page.waitForTimeout(200);

    // Click submit
    await this.click('submitButton');
    return true;
  }

  /**
   * Wait for Claude to finish generating
   */
  async waitForResponse(timeout = 120000) {
    const startTime = Date.now();

    // First wait for generation to start
    await this.page.waitForTimeout(1000);

    // Then wait for it to finish
    while (Date.now() - startTime < timeout) {
      const isGenerating = await this.page.evaluate(() => {
        return document.body.innerText?.includes('Generating') ||
               !!document.querySelector('.generating');
      });

      if (!isGenerating) {
        await this.page.waitForTimeout(500); // Brief pause to ensure complete
        return true;
      }

      await this.page.waitForTimeout(500);
    }

    throw new Error('Timeout waiting for response');
  }

  /**
   * Get last assistant message
   */
  async getLastResponse() {
    return await this.page.evaluate(() => {
      const messages = document.querySelectorAll('.message.assistant');
      if (messages.length === 0) return null;
      return messages[messages.length - 1].textContent;
    });
  }

  /**
   * Get all messages
   */
  async getMessages() {
    return await this.page.evaluate(() => {
      const messages = [];
      document.querySelectorAll('.message').forEach((msg) => {
        messages.push({
          role: msg.classList.contains('user') ? 'user' : 'assistant',
          content: msg.textContent,
        });
      });
      return messages;
    });
  }

  // ==================== Mode Actions ====================

  /**
   * Get current permission mode
   */
  async getCurrentMode() {
    return await this.page.evaluate(() => {
      const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
      const buttons = document.querySelectorAll('.selector-button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        for (const kw of modeKeywords) {
          if (text?.includes(kw)) return kw;
        }
      }
      return 'Unknown';
    });
  }

  /**
   * Switch permission mode
   */
  async switchMode(modeName) {
    // Open dropdown
    await this.page.evaluate(() => {
      const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
      const buttons = document.querySelectorAll('.selector-button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (modeKeywords.some((kw) => text?.includes(kw))) {
          btn.click();
          return;
        }
      }
    });

    await this.page.waitForTimeout(300);

    // Click target mode
    await this.page.evaluate((target) => {
      const options = document.querySelectorAll('.selector-option');
      for (const opt of options) {
        if (opt.textContent?.includes(target)) {
          opt.click();
          return true;
        }
      }
      return false;
    }, modeName);

    await this.page.waitForTimeout(300);
    return true;
  }

  // ==================== Dialog Actions ====================

  /**
   * Answer permission dialog
   */
  async answerPermission(choice = 'allow') {
    const optionMap = { allow: 0, always: 1, deny: 2 };
    const idx = optionMap[choice] ?? 0;

    await this.page.evaluate((i) => {
      const options = document.querySelectorAll('.permission-dialog-v3-option');
      if (options[i]) options[i].click();
    }, idx);

    await this.page.waitForTimeout(500);
    return true;
  }

  /**
   * Answer AskUserQuestion dialog
   */
  async answerAskUser(optionIndex = 0, customText = null) {
    if (customText !== null) {
      // Click "Other" and enter custom text
      await this.page.evaluate(() => {
        const options = document.querySelectorAll('button.question-option');
        const otherBtn = Array.from(options).find((o) => o.textContent?.includes('Other'));
        if (otherBtn) otherBtn.click();
      });
      await this.page.waitForTimeout(200);

      // Type custom text
      await this.page.evaluate((text) => {
        const input = document.querySelector('.custom-answer-input, input[type="text"]');
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, customText);
    } else {
      // Click specified option
      await this.page.evaluate((idx) => {
        const options = document.querySelectorAll('button.question-option');
        if (options[idx]) options[idx].click();
      }, optionIndex);
    }

    await this.page.waitForTimeout(200);

    // Click Submit
    await this.page.evaluate(() => {
      const submit = document.querySelector('.ask-user-question-dialog-actions .action-button.primary');
      if (submit && !submit.disabled) submit.click();
    });

    await this.page.waitForTimeout(500);
    return true;
  }

  // ==================== Session Actions ====================

  /**
   * Start a new session
   */
  async newSession() {
    await this.page.evaluate(() => {
      const btn = document.querySelector('.icon-button[data-tooltip="New Session"]');
      if (btn) btn.click();
    });

    await this.page.waitForTimeout(500);

    // Confirm if dialog appears
    await this.page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent?.includes('Confirm')) btn.click();
      }
    });

    await this.page.waitForTimeout(1000);
    return true;
  }

  /**
   * Get session count
   */
  async getSessionCount() {
    return await this.page.evaluate(() => {
      const items = document.querySelectorAll('.session-item, [data-testid="session-item"]');
      return items.length;
    });
  }

  // ==================== Model Actions ====================

  /**
   * Get current model
   */
  async getCurrentModel() {
    return await this.page.evaluate(() => {
      // Model keywords - check for these in any selector button
      const modelKeywords = ['Sonnet', 'Opus', 'Haiku'];
      // Mode keywords - to exclude mode buttons
      const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];

      const buttons = document.querySelectorAll('.selector-button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        // Skip mode buttons
        if (modeKeywords.some((kw) => text.includes(kw))) continue;
        // Check for model keywords
        for (const kw of modelKeywords) {
          if (text.includes(kw)) return kw;
        }
      }
      return 'Unknown';
    });
  }

  /**
   * Switch model
   */
  async switchModel(modelName) {
    // Open model dropdown - find button that contains model keywords but not mode keywords
    await this.page.evaluate(() => {
      const modelKeywords = ['Sonnet', 'Opus', 'Haiku', 'Claude'];
      const modeKeywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];

      const buttons = document.querySelectorAll('.selector-button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        // Skip mode buttons
        if (modeKeywords.some((kw) => text.includes(kw))) continue;
        // Click if it looks like a model button
        if (modelKeywords.some((kw) => text.includes(kw))) {
          btn.click();
          return;
        }
      }
    });

    await this.page.waitForTimeout(300);

    // Click target model
    await this.page.evaluate((target) => {
      const options = document.querySelectorAll('.selector-option');
      for (const opt of options) {
        if (opt.textContent?.includes(target)) {
          opt.click();
          return true;
        }
      }
      return false;
    }, modelName);

    await this.page.waitForTimeout(300);
    return true;
  }

  // ==================== Utility ====================

  /**
   * Take screenshot
   */
  async screenshot(name) {
    const path = `tests/e2e/screenshots/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path });
    return path;
  }

  /**
   * Clear test log
   */
  async clearTestLog() {
    await this.page.evaluate(() => {
      window.__testMessageLog = [];
    });
  }

  /**
   * Get test log
   */
  async getTestLog() {
    return await this.page.evaluate(() => window.__testMessageLog || []);
  }
}

/**
 * Connect to Claude GUI and return page object
 */
export async function connectToClaudeGUI(chromium) {
  const browser = await chromium.connectOverCDP('http://localhost:9222');

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title();
      if (title.includes('Claude')) {
        return { browser, page: new ClaudeGUIPage(page), rawPage: page };
      }
    }
  }

  throw new Error('Claude GUI webview not found. Is the Claude GUI panel open in Rider?');
}
