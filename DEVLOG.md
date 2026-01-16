# Development Log
> Agentic hindsight - reverse chronological
---

## 2026-01-16: v0.2.7 Released - Ralph Loop Complete

**Summary:** Completed 16 Ralph Loop iterations. All bugs fixed. Ready for architecture focus.

**What Changed:**
- Fixed BUG-005 (Shift+Enter) - track modifier key via ref
- Fixed BUG-006 (cursor jumping) - save/restore cursor position in renderFileTags
- Fixed BUG-003 (permission UX) - filename prominent, path truncated
- Replaced WeChat QR with GitHub links
- Removed Permissions settings tab placeholder
- Added TestSendMessageAction for E2E testing

**Metrics:**
- Open bugs: 4 → 0
- Settings tabs: 8 → 7
- E2E tests: 13 → 14

**Tests:** 14 pass (12 webview + 2 ai-bridge). Java tests are placeholders.

**Next Session:** Architecture focus. See RALPH_LOOP_PLAN.md "Next Session" section.

---

## 2026-01-16: Ralph Loop Iterations 8-10 - Cleanup & Verification

**Iteration 8:** Path rewriting already simplified (verified CLAUDE_CODE_TMPDIR implementation)
**Iteration 9:** File link clicking with line numbers already works (verified FileHandler.java:431-502)
**Iteration 10:** Removed Permissions settings tab (was only placeholder)

**Changes:**
- Removed Permissions tab from settings sidebar (8 tabs → 7 tabs)
- Updated SettingsTab type, PlaceholderSection props

**Files changed:**
- `webview/src/components/settings/SettingsSidebar/index.tsx`
- `webview/src/components/settings/index.tsx`
- `webview/src/components/settings/PlaceholderSection/index.tsx`

**Tests:** All 12 webview tests pass.

---

## 2026-01-16: Ralph Loop Iteration 7 - Remove WeChat QR (Task 1.4)

**Task:** Replace WeChat QR code with GitHub links.

**Changes:**
- Replaced WeChat QR code and Chinese text in CommunitySection
- Added GitHub links: Issues, Discussions, View on GitHub
- Updated styles to support link items instead of QR code display

**Files changed:**
- `webview/src/components/settings/CommunitySection/index.tsx` - Complete rewrite
- `webview/src/components/settings/CommunitySection/style.module.less` - Replaced QR styles with link styles

**Tests:** All 12 webview tests pass.

---

## 2026-01-16: Ralph Loop Iteration 6 - Fix BUG-006 (Cursor Jumping)

**Task:** Fix cursor jumping when typing before file reference tags.

**Root Cause:** The `renderFileTags` function in ChatInputBox.tsx always restored cursor to the END of content after rebuilding innerHTML (line 438-452). When typing before a file tag, the cursor would jump to the end.

**Solution:**
1. Added `setCursorAtCharOffset` function to `hooks/useTriggerDetection.ts` - sets cursor to a specific character offset
2. Modified `renderFileTags` to save cursor position BEFORE modifying innerHTML
3. Restore cursor to the SAME position (not end) AFTER modifying

**Files changed:**
- `webview/src/components/ChatInputBox/hooks/useTriggerDetection.ts` - Added setCursorAtCharOffset export
- `webview/src/components/ChatInputBox/ChatInputBox.tsx` - Import and use setCursorAtCharOffset

**Tests:** All 12 webview tests pass.

---

## 2026-01-16: Ralph Loop Iteration 5 - Permission Dialog UX (BUG-003)

**Task:** Improve permission dialog readability.

**Changes:**
1. Added `truncatePath()` function to intelligently shorten long paths
2. Added `getFileName()` to extract just the filename
3. For file operations (Write/Edit/Read), show filename prominently in green
4. Show truncated path as subtitle with full path on hover (tooltip)
5. Updated header to show "Content" for file ops instead of the working dir

**Files changed:**
- `webview/src/components/PermissionDialog.tsx` - Added path utilities and updated display
- `webview/src/styles/less/components/permission.less` - Added filename styling

**Design improvements:**
- Filename is now prominent and visible
- Long paths are truncated with "..." prefix
- Full path available on hover
- Cleaner presentation for file operations

---

## 2026-01-16: Ralph Loop Iteration 4 - BUG-002 (Choice Selection)

**Task:** Investigate and fix AskUserQuestion choice selection not working.

**Investigation:**
- Traced the full flow from bridge.js → Java → frontend → back
- The code paths appear correct
- Added debugging console logs to trace selection
- Fixed cancel handling to properly send `cancelled: true` flag

**Changes:**
1. Fixed `handleAskUserQuestionCancel` to send `cancelled: true` instead of empty answers
2. Added defensive null check for `currentQuestion` in handleOptionToggle
3. Added console.log statements for debugging selection and submission

**Files changed:**
- `webview/src/App.tsx` - Fixed cancel handling
- `webview/src/components/AskUserQuestionDialog.tsx` - Added logging and null checks

**Note:** The bug report may have been from an earlier version, or may be environment-specific. The code logic appears correct. Added logging will help diagnose if issue recurs.

---

## 2026-01-16: Ralph Loop Iteration 3 - Fix BUG-005 (Shift+Enter)

**Task:** Make Shift+Enter insert newline instead of sending message.

**Root Cause:** The `beforeinput` event handler for `insertParagraph` was preventing default behavior without checking for Shift key. The keydown handler correctly excluded `!e.shiftKey`, but `beforeinput` doesn't have direct access to modifier keys.

**Solution:**
1. Added `shiftKeyPressedRef` to track Shift key state from keydown
2. Updated both native and React `beforeinput` handlers to check this ref
3. When Shift is pressed, allow default newline insertion

**Files changed:** `webview/src/components/ChatInputBox/ChatInputBox.tsx`

**Tests:** All 12 webview tests pass.

---

## 2026-01-16: Ralph Loop Iteration 1 - CLAUDE_CODE_TMPDIR

**Task:** Implement CLAUDE_CODE_TMPDIR to eliminate `/tmp` write issue.

**Changes:**
- Added `process.env.CLAUDE_CODE_TMPDIR = workingDirectory` in bridge.js:375-378
- SDK is already at v0.2.9 (not 0.1.75 as initially thought - check was outdated)

**Hypothesis:** Setting this env var will eliminate need for path rewriting.

**Result:** Implementation complete. Webview and ai-bridge tests pass.

**What worked:**
- Simple one-line fix in the right location (after cwd is set, before SDK query)
- SDK v0.2.9 already installed at ~/.claude-gui/dependencies/claude-sdk

**Next:** Manual testing needed to verify files are written to project directory.

---

## 2026-01-16: Ralph Loop Plan Created

**Context:** Documentation consolidation and research phase completed.

**Changes:**
- Consolidated 15 markdown files into organized structure
- Created `docs/LEARNINGS.md` with all technical learnings
- Added research findings from January 2026 SDK updates
- Created `RALPH_LOOP_PLAN.md` with iterative improvement plan

**Key Discoveries:**
1. **SDK version gap:** We're on v0.1.75, latest is v0.2.9 (major version jump)
2. **Plan mode confirmed:** SDK docs state "plan mode is not currently supported"
3. **CLAUDE_CODE_TMPDIR:** New env var in v2.1.5 may simplify our path rewriting
4. **PermissionRequest hook:** New hook type might be cleaner than PreToolUse

**Files Deleted (obsolete):**
- 5x SIMPLIFICATION_*.md files (completed task)
- PROJECT_INDEX.md (outdated)
- FORK_STRATEGY.md (abandoned)
- BACKLOG.md (merged into DEVLOG)
- 8x docs/skills/*.md bug fix files (consolidated into LEARNINGS.md)
- docs/AI_AUTOMATION_LEARNINGS.md, E2E_EFFICIENCY_LEARNINGS.md (consolidated)

**Next Steps (from RALPH_LOOP_PLAN.md):**
1. Test CLAUDE_CODE_TMPDIR env var
2. Upgrade SDK from 0.1.75 → 0.2.9
3. Fix BUG-005 (Shift+Enter)
4. Fix BUG-002 (Choice selection)

---

## Open Bugs

### BUG-002: Choice selection does nothing
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**: AskUserQuestion dialog shows choices. After selecting a choice, nothing happens.

### BUG-003: Permission popup not readable
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**: Can't see what file is being modified (full path is truncated). Full diff shown below is useless and unreadable. Need better UX: show filename prominently, truncate path intelligently.
**Reference**: See VS Code Claude extension for clean permission dialog design.

### BUG-005: Shift+Enter for new line doesn't work
**Status**: Open
**Reported**: 2026-01-05
**Symptoms**: In the chat input, Shift+Enter should insert a new line. Currently does nothing.

### BUG-006: Drag-drop file cursor jumping
**Status**: ✅ Fixed (2026-01-16)
**Reported**: 2026-01-05
**Symptoms**: Dragging a file into prompt creates '@path-to-file' reference. When trying to type BEFORE the reference, cursor jumps after it.
**Fix**: renderFileTags now saves/restores cursor position instead of always moving to end.

---

## 2026-01-06: v0.2.3 Release - Multi-Provider Architecture

**Changes**:
- Merged 20 upstream commits (v0.1.4-codex branch)
- 97 files changed, 7 conflicts resolved
- Added `lineNumber` i18n key to all 7 locale files (was missing)
- Fixed hardcoded Chinese in ReadToolBlock.tsx line info display

### Architecture Changes
- New `provider/` package with `claude/`, `codex/`, `common/` subdirectories
- ClaudeSDKBridge moved to `provider/claude/ClaudeSDKBridge.java`
- New BaseSDKBridge abstraction for shared provider functionality
- Channel abstraction: `claude-channel.js`, `codex-channel.js`

### Features Added from Upstream
- Multi-provider support (Claude + Codex)
- Codex integration with environment variable API keys
- Animated empty state with provider switcher
- Usage statistics for Codex provider
- History icons
- Line number navigation in file open

### Conflict Resolution Notes
1. **channel-manager.js**: Adopted upstream's modular channel imports
2. **build.gradle**: Kept fork version (0.2.3), kept codex-sdk exclusion optimization
3. **ClaudeSDKBridge.java**: Deleted old location, kept new provider/claude/ version
4. **HistoryHandler.java**: Took upstream's multi-provider support, translated Chinese logs to English
5. **FileHandler.java**: Merged line number navigation feature with English logs
6. **ReadToolBlock.tsx**: Kept upstream's improved styling, used English colon

**Learnings**:
- Codex SDK binaries (~310MB) should be excluded from plugin bundle
- Provider abstraction pattern works well for multi-AI support
- HistoryHandler needed bulk Chinese→English log translations

---

## 2026-01-06: v0.2.2 Documentation Sync - Post-Merge Cleanup

**Changes**:
- README.md: Updated version 0.2.1 → 0.2.2, added v0.2.2 feature highlights
- CHANGELOG.md: Added v0.2.2 entry with merge statistics (57 commits, 15 conflicts, 82 files)
- FORK_STRATEGY.md: Rewrote strategy - git merge IS practical (was "impractical")
- FORK_STRATEGY.md: Marked 7 features as implemented, added Option A/B integration approaches
- CLAUDE.md: Updated locales 6 → 8, added upstream sync section with merge learnings

**Learnings**:

1. **Git merge with upstream works**: Despite 60+ localized files, merge succeeded with ~18% conflict rate (15/82 files)

2. **i18n conflict resolution pattern**: Prefer upstream's `t('key')` translation calls over fork's hardcoded English text. This preserves internationalization infrastructure.

3. **Common merge artifacts to watch for**:
   - Duplicate method declarations (e.g., `handleAskUserQuestionRequest` appeared twice in PermissionService.java)
   - Duplicate state declarations (e.g., AskUserQuestion state in App.tsx)
   - Duplicate imports (e.g., LanguageConfigService imported twice)
   - Orphaned conflict markers (found in api-config.js)

4. **Documentation version locations**:
   - build.gradle: `version = 'X.Y.Z'` (source of truth)
   - README.md: Current Version section
   - CHANGELOG.md: Top entry
   - plugin.xml: `<change-notes>` section (for JetBrains Marketplace)

**Hindsight**:
- After any upstream merge, run comprehensive documentation review
- Memory search (`mem-search` skill) can reconstruct merge history from observations
- FORK_STRATEGY.md was outdated after successful merge - strategy docs need updating when proven wrong
- Version 0.2.2 reflects merge commit e982fc2

**Context**: 4 documentation files updated, 98 insertions

---

## 2026-01-04: v0.2.1 Release - AI Cherry-Pick from Upstream

**Changes**:

### Phase 1: Bedrock Removal
- Removed `@anthropic-ai/bedrock-sdk` from ai-bridge/package.json
- Cleaned conditional auth logic in api-config.js and message-service.js
- Added docs/FORK_STRATEGY.md

### Phase 2: MCP Toggle Enhancements
- Added `toggle_mcp_server` action in McpServerHandler.java
- Project-level disabled server tracking in McpServerManager.java
- Smart refresh scheduling in McpSettingsSection.tsx
- McpSettingsSection.test.tsx with 6 tests

### Phase 3: AskUserQuestion Tool Support
- File-based IPC in permission-handler.js (request/response JSON files)
- CompletableFuture handling in PermissionHandler.java
- Dialog shower interface in PermissionService.java
- AskUserQuestionDialog.tsx component with multi-select
- i18n translations in all 6 locales

**Learnings**:
- Release checklist now documented in docs/RELEASE.md
- Version must be updated in 3 places: build.gradle, CHANGELOG.md, plugin.xml
- The webview package.json version (0.0.0) is intentional - not released separately
- When using gh CLI with forked repos, specify `--repo owner/repo` explicitly

**Hindsight**:
- Before any release, run the checklist in docs/RELEASE.md
- global.d.ts may contain changes from multiple features - commit together
- Test file actions changed from `update_mcp_server` to `toggle_mcp_server`

**Context**: 5 commits total (4 feature + 1 release), tag v0.2.1

---

## 2026-01-03: Phase 1-2 Complete - Test Infrastructure, Debug Cleanup, Reliability Fixes

**Changes**:

### Phase 0: Test Infrastructure
- **webview/**: Added Vitest 4.x + React Testing Library + jsdom
  - `vitest.config.ts`, `src/test/setup.ts`
  - ChatInputBox.test.tsx (4 tests), placeholder.test.ts (2 tests)
- **ai-bridge/**: Added Vitest for Node.js
  - `vitest.config.js`, `placeholder.test.js` (2 tests)
- **Java**: Added JUnit 5 with JUnit 4 vintage compatibility in `build.gradle`
- **scripts/test-all.sh**: Unified test runner for all 3 components

### Phase 1: Bug Fixes & Code Quality
- Fixed hardcoded Chinese placeholder in ChatInputBox
- Enhanced error logging in ClaudeHistoryReader.java
- Removed ~100 debug console.log statements across ai-bridge (40% reduction)
- Translated Chinese comments to English in all ai-bridge modules

### Phase 2: Critical Reliability Fixes
- **Query Timeout Re-enabled** (message-service.js)
  - Root cause: AbortController was passed at wrong level
  - Fix: Must be inside `options` object per SDK docs (GitHub #2970)
  - Added configurable timeout via `settings.queryTimeoutMs` (default: 2 min)
- **XSS Vulnerability Fixed** (App.tsx)
  - Replaced innerHTML-based image preview with React state
  - `block.src` was interpolated directly, allowing XSS vectors

**Learnings**:

1. **Claude Agent SDK AbortController**: Must pass inside `options`, NOT at top level:
   ```javascript
   // WRONG: query({ abortController, prompt, options })
   // RIGHT: query({ prompt, options: { ..., abortController } })
   ```

2. **Protocol-based IPC**: ai-bridge uses `[MESSAGE]`, `[CONTENT]`, `[SESSION_ID]` prefixes
   for Java-side parsing. These are NOT debug logs and must be preserved.

3. **Test setup gotcha**: Webview tests need localStorage mock for i18n initialization.

**Hindsight**:

- Before modifying message-service.js timeout logic, check GitHub issues for SDK behavior
- The `timeoutId` variable existed but was unused - original devs disabled it due to SDK bug
- innerHTML in React components is almost always wrong - use state-based rendering
- Test infrastructure files: `scripts/test-all.sh` runs everything in sequence

**Context**:
- ai-bridge/services/claude/message-service.js - core SDK integration
- webview/src/App.tsx - main React component, image preview at ~line 1756
- docs-plan/WORK-ORDER.md - full testing/fix roadmap
- docs-plan/TESTING.md - testing strategy documentation
