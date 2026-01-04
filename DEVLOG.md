# Development Log
> Agentic hindsight - reverse chronological
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
