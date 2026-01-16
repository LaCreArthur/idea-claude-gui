# E2E Learning Loop - AI-Driven Testing

## Goal

Learn how to reliably perform AI-driven E2E testing for the Claude GUI plugin.

**Specific test scenario:**
1. Send a message to Claude Code in the plugin
2. Trigger an AskUser question from Claude
3. Choose a reply option
4. Verify Claude continues (doesn't hang indefinitely)
5. If it hangs, fix the codebase and retry

## Safety Rules

**CRITICAL - Follow these rules:**

1. **NO DESTRUCTIVE OPERATIONS**
   - Never `rm -rf` or delete directories
   - Never overwrite files without reading first
   - Never force push to git

2. **COMMIT CHANGES**
   - Commit learnings and improvements regularly
   - Use descriptive commit messages

3. **CAREFUL AI OPERATIONS**
   - Always screenshot BEFORE clicking
   - Always screenshot AFTER clicking
   - Verify state before proceeding
   - Use keyboard navigation over mouse when possible
   - If uncertain, STOP and assess

4. **NON-DESTRUCTIVE CLICKS**
   - Never click on "Delete", "Remove", "Clear" buttons
   - Avoid clicking near dangerous areas
   - Prefer clicking on safe areas (input fields, view buttons)

## Current Iteration

**Iteration:** 1
**Status:** Starting

## Learnings Reference

See `docs/AI_AUTOMATION_LEARNINGS.md` for accumulated knowledge.

## Approach

### Phase 1: Observe
- Take screenshots of Rider with Claude GUI
- Document exact layout and coordinates
- Identify safe click targets

### Phase 2: Navigate
- Use `Cmd+Shift+A` to find Claude GUI
- Focus the tool window via keyboard
- Verify focus with screenshot

### Phase 3: Interact
- Click on input field (verified safe area)
- Type test message
- Verify message appears
- Send message

### Phase 4: Verify
- Watch for Claude response
- Look for AskUser dialog
- Select option if presented
- Verify no hang

### Phase 5: Document
- Record what worked
- Record what failed
- Update learnings
- Commit changes

## Progress Log

### Iteration 1 - COMPLETED
**Date:** 2026-01-16

**Actions:**
- [x] Screenshot current state
- [x] Identify Claude GUI panel location (CENTER panel, not left)
- [x] Navigate via keyboard (Tab, Cmd+Shift+A)
- [x] Attempt safe interaction (click, type, paste, Enter)
- [x] Document results

**Critical Finding:** JCEF webview doesn't receive system input!

| Method Tried | Result |
|-------------|--------|
| `cliclick t:"text"` | Failed - no input |
| `osascript keystroke` | Failed - no input |
| Clipboard paste | Failed - no input |
| Click + Enter | Failed - no send |

**Learnings:**
1. Claude GUI panel is in CENTER (not LEFT - that's Git/Changes panel)
2. Input field shows "Hello Claude" text
3. JCEF webviews have their own event handling
4. Standard automation tools cannot interact with webview content
5. Need alternative approach (JS injection, plugin API, etc.)

**Next Steps:**
- Investigate JCEF JavaScript injection
- Look at plugin's test mode hooks
- Consider API-level testing instead of UI

**Commit:** `1d37675` - docs: Add AI-driven E2E testing learnings
