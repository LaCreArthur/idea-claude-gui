# AI Automation Learnings

Hard-won lessons from attempting AI-driven E2E testing with computer control.

**Last Updated:** 2026-01-16

---

## Executive Summary

After extensive testing, we discovered:

1. **JCEF webviews have Chrome DevTools on port 9222 by default** - This is the proper automation path
2. **Raw cliclick/osascript cannot interact with JCEF content** - System events don't reach embedded browsers
3. **A hybrid approach works best** - Test utilities + AI orchestration
4. **JetBrains provides testing frameworks** - Driver framework and JBCefTestHelper exist

---

## JCEF Webview Automation (Key Finding)

### The Right Way: Chrome DevTools Protocol (CDP)

JCEF in JetBrains IDEs exposes Chrome DevTools **by default on port 9222**.

From [JetBrains documentation](https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html):
> "The Chrome DevTools, embedded into JCEF, can be used as a debugging and profiling tool. It is active by default, so that a Chrome DevTools client can attach to it via the default port 9222."

#### Using Playwright to Automate JCEF

```javascript
const { chromium } = require('playwright');

async function automateJcefWebview() {
  // Connect to JCEF's DevTools on port 9222
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  // Now you can interact with the webview like any web page
  await page.fill('textarea', 'Hello Claude!');
  await page.click('button[type="submit"]');

  // Read state
  const messages = await page.evaluate(() => window.__testMessageLog);
  console.log('Messages:', messages);
}
```

#### Configuration

| Setting | Default | Registry Key |
|---------|---------|--------------|
| Debug port | 9222 | `ide.browser.jcef.debug.port` |
| DevTools context menu | false | `ide.browser.jcef.contextMenu.devTools.enabled` |

### What We Tried That Didn't Work

| Method | Result | Why |
|--------|--------|-----|
| `cliclick t:"text"` | Text not entered | System events don't reach JCEF |
| `osascript keystroke` | Text not entered | Same reason |
| Clipboard paste (Cmd+V) | Text not entered | Same reason |
| Click coordinates | Inconsistent | May hit container, not DOM |

### Why Raw Automation Fails

JCEF webviews are embedded Chromium browsers with their own event loop. System-level input events (keyboard, mouse) are handled by the JVM/Swing layer and don't propagate into the browser's JavaScript event system.

---

## JetBrains Testing Frameworks

### 1. Driver Framework (UI Testing)

JetBrains provides an [official UI testing framework](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-ui-testing/) with Kotlin DSL.

```kotlin
ideFrame {
    invokeAction("SearchEverywhere")
    searchEverywherePopup {
        // Find and interact with UI elements
        actionButtonByXpath(xQuery { byAccessibleName("Preview") })
            .click()
    }
}
```

**Limitations:** Focuses on Swing/AWT components. Limited JCEF support.

### 2. JBCefTestHelper

JetBrains provides `JBCefTestHelper` for JCEF-specific testing. Located in intellij-community test sources.

### 3. Programmatic DevTools Access

```java
JBCefBrowser myBrowser = new JBCefBrowser(myUrl);
CefBrowser myDevTools = myBrowser.getCefBrowser().getDevTools();
JBCefBrowser myDevToolsBrowser = JBCefBrowser(myDevTools, myBrowser.getJBCefClient());
```

---

## Recommended Hybrid Approach

### Architecture

| Layer | Tool | Purpose |
|-------|------|---------|
| IDE UI | JetBrains Driver / AppleScript | Open windows, navigate menus |
| JCEF Webview | Playwright via CDP:9222 | Interact with React UI |
| Test Logic | Kotlin/TypeScript | Assertions, data setup |
| AI Orchestration | Claude | Handle edge cases, verify visually |

### Example Hybrid Test

```typescript
// test-helper.ts
import { chromium } from 'playwright';
import { exec } from 'child_process';

export async function openClaudeGui() {
  // Use AppleScript for IDE navigation
  await exec(`osascript -e 'tell application "System Events"
    tell process "rider"
      click menu item "Claude GUI" of menu "Tool Windows" of menu item "Tool Windows" of menu "View" of menu bar 1
    end tell
  end tell'`);
}

export async function sendMessage(text: string) {
  // Use Playwright for webview interaction
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  await page.fill('textarea', text);
  await page.click('button:has-text("Send")');
}

export async function waitForAskUser() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForSelector('[data-testid="ask-user-dialog"]', { timeout: 30000 });
}
```

### AI Orchestration Role

The AI should **orchestrate**, not fight with raw automation:

```
✅ AI calls: await testHelper.sendMessage("Ask me a question")
✅ AI calls: await testHelper.waitForAskUser()
✅ AI verifies: screenshot shows expected dialog
✅ AI calls: await testHelper.clickOption(0)

❌ AI tries: cliclick c:320,355 (unreliable)
❌ AI tries: cliclick t:"text" (doesn't work in JCEF)
```

---

## cliclick Reference (For Native UI Only)

cliclick works for native macOS/Swing UI elements, **not JCEF webviews**.

```bash
# Click at coordinates
cliclick c:400,300

# Type text (only works in native text fields)
cliclick t:"Hello World"

# Press special keys
cliclick kp:enter
cliclick kp:esc
cliclick kp:tab

# Modifier keys
cliclick kd:cmd,shift t:a ku:cmd,shift  # Cmd+Shift+A
```

---

## AppleScript for IDE Navigation

AppleScript works for native IDE UI (menus, dialogs).

```bash
# Activate Rider
osascript -e 'tell application "Rider" to activate'

# Click menu items
osascript -e 'tell application "System Events"
    tell process "rider"
        click menu item "Claude GUI" of menu "Tool Windows" of menu item "Tool Windows" of menu "View" of menu bar 1
    end tell
end tell'

# Dismiss system dialogs
osascript -e 'tell application "System Events"
    tell process "UserNotificationCenter"
        click button "Allow" of window 1
    end tell
end tell'
```

---

## Plugin Test Mode

The plugin has a built-in test mode that provides JavaScript helpers.

### Enabling

```
-Dclaude.test.mode=true
```

Add to `~/Library/Application Support/JetBrains/Rider2025.3/rider.vmoptions`

### What It Provides

```javascript
window.__testMode = true;
window.__testMessageLog = [];  // All messages logged here
window.__originalSendToJava = window.sendToJava;

// Wrapped sendToJava logs outgoing messages
window.sendToJava = function(msg) {
  window.__testMessageLog.push({ ts: Date.now(), dir: 'out', msg: msg });
  return window.__originalSendToJava(msg);
};
```

### Using with Playwright

```typescript
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];

// Check test mode is active
const testMode = await page.evaluate(() => window.__testMode);
console.log('Test mode:', testMode);

// Read message log
const log = await page.evaluate(() => window.__testMessageLog);
console.log('Messages:', log);
```

---

## Key Lessons

1. **Use the right tool for each layer** - AppleScript for IDE, Playwright for webview
2. **CDP port 9222 is your friend** - It's enabled by default in JCEF
3. **Don't fight the architecture** - Work with the browser's event system, not against it
4. **AI orchestrates, utilities execute** - Pre-built helpers make AI testing reliable
5. **Test mode helps** - Enable `-Dclaude.test.mode=true` for observability

---

## Sources

- [JetBrains JCEF Documentation](https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html)
- [JetBrains UI Testing Blog (Feb 2025)](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-ui-testing/)
- [Playwright CDP Connection](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
