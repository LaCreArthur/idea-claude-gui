# Plugin Backlog

## Critical (Workflow Blockers)

### BUG-001: Claude interrupted after permission popup
**Status**: Fixed (2026-01-05)
**Reported**: 2026-01-05
**Root Cause**: Permission dialog had timeouts (35s Java, 60s ai-bridge) that would auto-deny if user took too long to respond.
**Fix**: Removed all timeouts from permission handling - user can now take as long as needed (matches CLI behavior). Changes in:
- `PermissionHandler.java` - removed 35s timeout
- `PermissionService.java` - removed 30s fallback dialog timeout
- `ai-bridge/permission-handler.js` - removed 60s polling timeout

### BUG-002: Choice selection does nothing
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**:
- AskUserQuestion dialog shows choices
- After selecting a choice, nothing happens
- May be related to BUG-001 (same timeout issue?)

---

## High Priority (UX Issues)

### BUG-003: Permission popup not readable
**Status**: Open
**Reported**: 2026-01-05
**Screenshot**: [docs/screenshots/bug-003-permission-popup.png](docs/screenshots/bug-003-permission-popup.png) *(TODO: save screenshot)*
**Symptoms**:
- Can't see what file is being modified (full path is truncated/not readable)
- Full diff shown below is useless and unreadable
- Need better UX: show filename prominently, truncate path intelligently
**Reference**: See VS Code Claude extension for clean permission dialog design

### BUG-004: Chinese characters in diagnostics
**Status**: Fixed (2026-01-05)
**Reported**: 2026-01-05
**Fix**: Translated all Chinese diagnostic strings in ClaudeSDKBridge.java to English

---

## Medium Priority (Input Issues)

### BUG-005: Shift+Enter for new line doesn't work
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**:
- In the chat input, Shift+Enter should insert a new line
- Currently does nothing.

### BUG-006: Drag-drop file cursor jumping
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**:
- Dragging a file into prompt creates '@path-to-file' reference
- When trying to type BEFORE the reference, cursor jumps after it
- Makes it difficult to compose prompts with file references in the middle
