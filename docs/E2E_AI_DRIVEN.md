# AI-Driven E2E Testing

This document describes the new AI-driven approach to E2E testing for Claude GUI.

## Overview

We replaced ~500 lines of brittle Kotlin E2E tests with:
1. **Natural language test specs** in `tests/e2e/*.md`
2. **Fast build verification tests** in Kotlin (5 tests, ~16 seconds)
3. **AI execution** via Claude Code with computer use

## What Changed

### Deleted
- `src/test/kotlin/.../e2e/MessageRoundTripTest.kt` (497 lines)
- `src/test/kotlin/.../e2e/UserStoryTest.kt` (never completed)

### Archived
- `docs/E2E_TESTING_RESEARCH.md` → `docs/archive/`
- `docs/E2E_LEARNINGS.md` → `docs/archive/`
- `docs/E2E_RALPH_LOOP.md` → `docs/archive/`

### Created
- `tests/e2e/README.md` - How to run tests
- `tests/e2e/01-plugin-loads.md` - Plugin installation verification
- `tests/e2e/02-tool-window.md` - Tool window interaction
- `tests/e2e/03-chat-flow.md` - Chat message flow
- `tests/e2e/04-session-mgmt.md` - Session management
- `scripts/run-e2e.sh` - Test runner script
- `src/test/kotlin/.../e2e/BuildVerificationTest.kt` - Fast build tests

## How It Works

### Build Verification (Automated)
```bash
./gradlew testE2E
```
Runs in ~16 seconds, verifies:
- Plugin ZIP exists
- Main JAR present
- ai-bridge.zip with bridge.js
- Webview HTML in JAR

### E2E Tests (AI-Driven)
```bash
# Interactive
claude "Run tests/e2e/02-tool-window.md against running Rider"

# Or use script
./scripts/run-e2e.sh
```

## Tools Used

- **cliclick** - Mouse/keyboard automation on macOS (`brew install cliclick`)
- **screencapture** - macOS screenshot utility
- **osascript** - AppleScript for app activation

## Example Commands

```bash
# Take screenshot
screencapture -x /tmp/screenshot.png

# Activate Rider
osascript -e 'tell application "Rider" to activate'

# Click at coordinates
cliclick c:400,300

# Type text
cliclick t:"Hello Claude"

# Press key
cliclick kp:enter
cliclick kp:esc
```

## Learnings

### What Works
1. Screenshots provide visual verification
2. cliclick enables precise mouse/keyboard control
3. Natural language tests are easier to maintain
4. AI adapts when UI changes slightly

### Challenges
1. Finding correct click coordinates requires screenshot analysis
2. AppleScript keyboard control needs accessibility permissions
3. Popup/dialog dismissal can be tricky
4. Need to wait for UI to settle after actions

### Best Practices
1. Always take screenshots before and after actions
2. Use escape to dismiss popups
3. Wait briefly after clicks before next action
4. Verify state visually, not just by action success

## Test Results Summary

| Test Type | Count | Time | Method |
|-----------|-------|------|--------|
| Build verification | 5 | ~16s | Kotlin/Gradle |
| E2E (tool window) | 1 | ~30s | AI-driven |
| E2E (chat flow) | 1 | ~60s | AI-driven |
| E2E (session mgmt) | 1 | ~45s | AI-driven |

## Why This Is Better

| Aspect | Old (Kotlin) | New (AI-Driven) |
|--------|--------------|-----------------|
| Lines of code | 497+ | ~100 (specs) |
| Test runtime | 5+ min/test | 16s build + on-demand |
| Maintenance | XPath breaks | Self-healing |
| Coverage | Surface level | Deep user flows |
| Debugging | Stack traces | Screenshots + AI analysis |
