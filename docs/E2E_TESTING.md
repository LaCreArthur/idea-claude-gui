# E2E Testing Guide

Consolidated guide for E2E testing of Claude GUI plugin.

**Last Updated:** 2026-01-16

---

## Quick Start

```bash
# Run all E2E tests (requires Rider running with CDP enabled)
node tests/e2e/run-all.mjs

# Or run individual tests
node tests/e2e/test-permission-flow.mjs
node tests/e2e/test-mode-switching.mjs
node tests/e2e/test-plan-approval.mjs

# Rebuild plugin and restart Rider (after code changes)
./scripts/rebuild-and-test.sh
```

---

## Prerequisites

### 1. Enable CDP Port 9222

Add to `~/Library/Application Support/JetBrains/Rider2025.3/options/ide.general.xml`:

```xml
<component name="Registry">
  <entry key="ide.browser.jcef.debug.port" value="9222" />
</component>
```

Then restart Rider.

### 2. Install Playwright

```bash
npm install playwright --save-dev
```

### 3. Verify Connection

```bash
node tests/e2e/helpers/verify-connection.mjs
```

---

## Architecture

```
Playwright via CDP:9222
         │
         ▼
┌─────────────────────┐
│  JCEF Webview       │
│  (Claude GUI)       │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Test Helpers       │
│  tests/e2e/helpers/ │
└─────────────────────┘
```

**Key Insight:** Use `page.evaluate()` for clicks when overlays block Playwright native clicks.

---

## Component Selectors

| Component | Container | Options | Actions |
|-----------|-----------|---------|---------|
| **Chat Input** | `.input-editable` | - | `.submit-button` |
| **AskUserQuestion** | `.ask-user-question-dialog` | `button.question-option` | `.action-button.primary` (Submit) |
| **Permission** | `.permission-dialog-v3` | `.permission-dialog-v3-option` | Keys: 1/2/3 |
| **Mode Select** | `.selector-button` | `.selector-option` | Click option |
| **Plan Approval** | `.plan-approval-dialog` | `.plan-approval-mode-option` | `.action-button.primary` (Execute) |

---

## User Stories to Test

### 1. Send Message and Receive Response
**Status:** Not yet tested
**Priority:** P0 - Core functionality

**Steps:**
1. Type message in `.input-editable`
2. Click `.submit-button`
3. Wait for response in chat
4. Verify no errors

### 2. AskUserQuestion Flow
**Status:** TESTED
**Priority:** P0 - Core functionality

**Steps:**
1. Send message that triggers AskUserQuestion
2. Wait for `.ask-user-question-dialog`
3. Click `button.question-option` (first option)
4. Click Submit (`.action-button.primary`)
5. Verify dialog closes, Claude continues

### 3. Permission Dialog
**Status:** TESTED ✅
**Priority:** P0 - Core functionality
**Test file:** `tests/e2e/test-permission-flow.mjs`

**Steps:**
1. Send message that triggers tool use NOT in allow list (e.g., `curl`)
2. Wait for `.permission-dialog-v3`
3. Click "Allow Once" (first option)
4. Verify command executes

**Notes:**
- Commands in `.claude/settings.local.json` allow list are auto-approved by SDK
- Use `curl` or other non-allowed commands to trigger permission dialog

### 4. Mode Switching
**Status:** TESTED ✅
**Priority:** P1 - Important feature
**Test file:** `tests/e2e/test-mode-switching.mjs`

**Steps:**
1. Click mode selector button
2. Switch through all modes: Default, Plan, Accept Edits, Auto-accept
3. Verify mode changes (button text updates)
4. Verify `set_mode` messages sent to backend

### 5. Plan Mode Flow
**Status:** TESTED ✅ (UI only)
**Priority:** P1 - Important feature
**Test file:** `tests/e2e/test-plan-approval.mjs`

**Steps:**
1. Switch to "Plan" mode
2. Send message requiring planning
3. Observe behavior

**Notes:**
- SDK docs state Plan mode is "Not currently supported in SDK"
- UI switching works, but SDK doesn't trigger plan approval dialog
- Claude proceeds directly to execution with permission prompts

### 6. Session Management
**Status:** Not yet tested
**Priority:** P2 - Important

**Steps:**
1. Create new session
2. Send message
3. Create another session
4. Switch between sessions
5. Verify messages persist per session

---

## Test Helper Module

The `tests/e2e/helpers/webview.mjs` module provides ready-to-use helpers:

```javascript
import {
  getPage,
  sendMessage,
  clickViaJS,
  waitForDialog,
  startNewSession,
  clearTestLog,
  getLastAssistantMessage,
  sleep,
  // Permission
  waitForPermission,
  answerPermission,
  // AskUser
  waitForAskUser,
  answerAskUser,
  // Mode
  getCurrentMode,
  switchMode,
  // Plan
  waitForPlanApproval,
  approvePlan,
  rejectPlan,
  // State
  isGenerating,
  waitForGenerationComplete,
  getTestLog,
} from './helpers/webview.mjs';
```

**Example usage:**
```javascript
import { getPage, startNewSession, sendMessage, waitForPermission, answerPermission } from './helpers/webview.mjs';

const { page, browser } = await getPage();
await startNewSession();
await sendMessage('Run: curl https://httpbin.org/uuid');
await waitForPermission();
await answerPermission('allow');
```

---

## Efficiency Tips

1. **Reuse browser connection** - Don't reconnect for each test
2. **Use JS clicks** - `page.evaluate()` bypasses overlays
3. **Short waits** - 200-300ms between actions is enough
4. **Check state first** - Don't blindly click; verify element exists
5. **Screenshot on failure** - Capture state for debugging

---

## Running Tests

### Single Test
```bash
node tests/e2e/test-askuser.mjs
```

### All Tests
```bash
node tests/e2e/run-all.mjs
```

### Debug Mode
```bash
DEBUG=1 node tests/e2e/test-permissions.mjs
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to CDP" | Check Rider is running, CDP port enabled, restart Rider |
| "Element not found" | Check selector, take screenshot, verify dialog is open |
| "Click intercepted by overlay" | Use `page.evaluate()` for JS-based click |
| "Timeout waiting for dialog" | Verify Claude is actually processing, check for errors |

---

## Test Results Log

| Test | Date | Status | Notes |
|------|------|--------|-------|
| Message Flow | 2026-01-16 | PASS | Send/receive with Auto-accept mode |
| Session Mgmt | 2026-01-16 | PASS | Session isolation verified |
| Model Selection | 2026-01-16 | PASS | Sonnet/Opus/Haiku switching |
| Mode Switch | 2026-01-16 | PASS | All modes switch correctly |
| Permission | 2026-01-16 | PASS | Works for non-allowed commands (curl) |
| Plan Approval | 2026-01-16 | PASS* | UI works; SDK doesn't support plan mode yet |
| AskUserQuestion | 2026-01-16 | PASS | Dialog interaction validated |

**Run all tests:**
```bash
node tests/e2e/run-all.mjs
# Expected: Passed: 6/6
```

**Architecture:**
- Page Object Model: `tests/e2e/pages/ClaudeGUIPage.mjs`
- Resilient selectors with fallbacks
- Auto-cleanup of leftover dialogs

**Fixed Bugs:**
- Default permission mode was `bypassPermissions` instead of `default` (fixed in App.tsx)
- Model selector now excludes mode buttons
