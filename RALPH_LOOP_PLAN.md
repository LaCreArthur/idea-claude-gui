# Ralph Loop Plan: Plugin Improvement Cycle

**Created:** 2026-01-16
**Methodology:** Test → Learn → Iterate → Get More Efficient

---

## Iteration Protocol

Every iteration MUST follow this cycle:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PLAN      → Define hypothesis, expected outcome, tasks      │
│  2. EXECUTE   → Implement with minimal changes                  │
│  3. TEST      → Verify behavior matches expectations            │
│  4. REFLECT   → What worked? What didn't? Why?                  │
│  5. RESEARCH  → Challenge assumptions, check latest docs        │
│  6. LEARN     → Document in LEARNINGS.md                        │
│  7. LOG       → Update DEVLOG.md with progress                  │
│  8. ITERATE   → Improve approach for next cycle                 │
└─────────────────────────────────────────────────────────────────┘
```

### Reflection Questions (Ask after every iteration)

1. Did the outcome match the hypothesis?
2. What assumption was wrong?
3. Is there a simpler way?
4. What would I do differently next time?
5. Did the SDK/docs change since I last checked?

---

## Task Queue (Priority Order)

### Phase 1: Quick Wins (Low Risk, High Value)

| # | Task | Hypothesis | Test | Est. Effort |
|---|------|-----------|------|-------------|
| 1.1 | Test CLAUDE_CODE_TMPDIR | Setting this env var will eliminate need for path rewriting | Files write to project dir without rewriting | Low |
| 1.2 | Check SDK version | We may be on old SDK missing features | `npm list` shows latest | Low |
| 1.3 | Fix BUG-005 (Shift+Enter) | Simple keyboard event handling fix | Shift+Enter inserts newline | Low |
| 1.4 | Remove Community WeChat QR | Dead link, confuses users | Tab shows GitHub link or removed | Low |

### Phase 2: SDK Modernization (Medium Risk)

| # | Task | Hypothesis | Test | Est. Effort |
|---|------|-----------|------|-------------|
| 2.1 | Upgrade to latest SDK | Get security fixes, new features | All tests pass after upgrade | Medium |
| 2.2 | Add settingSources option | Control which settings load | Plugin behavior consistent | Low |
| 2.3 | Use PermissionRequest hook | Cleaner than PreToolUse for dialogs | Permission dialogs still work | Medium |
| 2.4 | Fix Zod v4 compatibility | SDK requires Zod ^4.0.0 | No Zod errors | Medium |

### Phase 3: Bug Fixes (Medium Risk)

| # | Task | Hypothesis | Test | Est. Effort |
|---|------|-----------|------|-------------|
| 3.1 | Fix BUG-002 (Choice selection) | Tool response handling is broken | AskUserQuestion choices work | Medium |
| 3.2 | Fix BUG-003 (Permission popup) | Need better UX design | Full path visible, diff readable | Medium |
| 3.3 | Fix BUG-006 (Cursor jumping) | ContentEditable cursor management | Can type before file reference | Medium |

### Phase 4: Architecture Improvements (Higher Risk)

| # | Task | Hypothesis | Test | Est. Effort |
|---|------|-----------|------|-------------|
| 4.1 | Evaluate V2 Interface | Simpler multi-turn handling | Prototype works | High |
| 4.2 | Add SessionStart/End hooks | Better lifecycle management | Session events logged | Medium |
| 4.3 | Simplify path rewriting | If TMPDIR works, remove old code | Tests pass, less code | Medium |

### Phase 5: Testing & Stability

| # | Task | Hypothesis | Test | Est. Effort |
|---|------|-----------|------|-------------|
| 5.1 | Add US-8 test | AskUserQuestion custom input works | E2E test passes | Low |
| 5.2 | Test file link clicking | Links with line numbers work | Click opens file at line | Low |
| 5.3 | Decide Permission tab future | Feature needed or remove | Clean UI | Low |

---

## Iteration 1: CLAUDE_CODE_TMPDIR Experiment

### Hypothesis
Setting `CLAUDE_CODE_TMPDIR` to project directory will eliminate the `/tmp` write issue without needing our custom path rewriting logic.

### Expected Outcome
- Files are written to project directory
- No `/tmp` paths in tool calls
- Can remove `rewriteToolInputPaths()` function

### Tasks
- [ ] 1.1.1 Research: Read SDK docs on CLAUDE_CODE_TMPDIR
- [ ] 1.1.2 Implement: Set env var in channel-manager.js
- [ ] 1.1.3 Test: Ask Claude to create a file, verify path
- [ ] 1.1.4 Verify: Check no `/tmp` paths in logs
- [ ] 1.1.5 Reflect: Did it work? Why/why not?
- [ ] 1.1.6 Learn: Document in LEARNINGS.md
- [ ] 1.1.7 Decide: Remove path rewriting or keep as fallback?

### Research Checklist
- [ ] Check Claude Code changelog for CLAUDE_CODE_TMPDIR details
- [ ] Verify env var name is correct (not CLAUDE_TMPDIR or similar)
- [ ] Check if there are other related env vars

### Success Criteria
```
✓ File write to /tmp/test.js → Actually writes to /project/test.js
✓ No custom path rewriting needed
✓ Works on macOS and Windows
```

---

## Iteration 2: SDK Version Check & Upgrade

### Hypothesis
We're on an older SDK version and missing important features/fixes.

### Pre-Research
- [ ] 2.1.1 Run `npm list @anthropic-ai/claude-agent-sdk` in ai-bridge
- [ ] 2.1.2 Check npm for latest version
- [ ] 2.1.3 Read changelog for breaking changes since our version
- [ ] 2.1.4 Check if Zod v4 is installed

### Tasks
- [ ] 2.2.1 Create branch for upgrade
- [ ] 2.2.2 Update package.json
- [ ] 2.2.3 Run npm install
- [ ] 2.2.4 Fix any breaking changes
- [ ] 2.2.5 Run all tests
- [ ] 2.2.6 Test manually in IDE
- [ ] 2.2.7 Document changes in DEVLOG.md

### Rollback Plan
If upgrade breaks things: `git checkout ai-bridge/package.json && npm install`

---

## Iteration 3: Fix Shift+Enter (BUG-005)

### Hypothesis
The chat input doesn't handle Shift+Enter because the keydown handler doesn't check for shift modifier.

### Pre-Research
- [ ] 3.1.1 Find ChatInputBox.tsx
- [ ] 3.1.2 Locate keydown handler
- [ ] 3.1.3 Check how other editors handle this

### Tasks
- [ ] 3.2.1 Add shift key check to keydown handler
- [ ] 3.2.2 Insert newline instead of submitting
- [ ] 3.2.3 Test in IDE
- [ ] 3.2.4 Add unit test
- [ ] 3.2.5 Document fix

### Expected Code Change
```typescript
// Before
if (e.key === 'Enter') {
  handleSubmit();
}

// After
if (e.key === 'Enter' && !e.shiftKey) {
  handleSubmit();
} else if (e.key === 'Enter' && e.shiftKey) {
  // Insert newline (handled by default behavior)
}
```

---

## Iteration 4: Fix BUG-002 (Choice Selection)

### Hypothesis
AskUserQuestion choices don't work because the response isn't being sent back correctly to the SDK.

### Pre-Research
- [ ] 4.1.1 Read SDK docs on AskUserQuestion tool response format
- [ ] 4.1.2 Check permission-handler.js for tool response handling
- [ ] 4.1.3 Check AskUserQuestionDialog.tsx for selection handling
- [ ] 4.1.4 Add logging to trace the flow

### Investigation Steps
1. Trigger AskUserQuestion (ask Claude "what framework should I use?")
2. Select an option
3. Check logs for:
   - Selection event fired?
   - Response file written?
   - Response format correct?
   - SDK received response?

### Tasks
- [ ] 4.2.1 Reproduce bug with logging
- [ ] 4.2.2 Identify where flow breaks
- [ ] 4.2.3 Fix the issue
- [ ] 4.2.4 Test with multiple choice types
- [ ] 4.2.5 Add E2E test (US-8)

---

## Iteration 5: Permission Dialog UX (BUG-003)

### Hypothesis
Permission dialog is unreadable because it shows full path and raw diff.

### Pre-Research
- [ ] 5.1.1 Look at VS Code Claude extension for reference
- [ ] 5.1.2 Check what info users actually need
- [ ] 5.1.3 Research diff visualization in IntelliJ

### Design Goals
1. Show filename prominently (not full path)
2. Truncate path intelligently (show ...project/src/file.js)
3. Collapse diff by default, expand on demand
4. Highlight what's being added/removed

### Tasks
- [ ] 5.2.1 Sketch new dialog layout
- [ ] 5.2.2 Implement path truncation
- [ ] 5.2.3 Add collapsible diff section
- [ ] 5.2.4 Improve diff formatting
- [ ] 5.2.5 Test with various file paths
- [ ] 5.2.6 Get user feedback

---

## Progress Tracking

### Iteration Log

| Iteration | Date | Task | Outcome | Learning |
|-----------|------|------|---------|----------|
| 1 | 2026-01-16 | CLAUDE_CODE_TMPDIR | ✅ Implemented | SDK was already 0.2.9, initial version check was outdated |
| 2 | - | SDK Upgrade | ✅ Already done | SDK at ~/.claude-gui/dependencies is already 0.2.9 |
| 3 | 2026-01-16 | Shift+Enter | ✅ Fixed | beforeinput doesn't have modifier keys; use ref to track from keydown |
| 4 | 2026-01-16 | Choice Selection | ✅ Investigated | Code appears correct; added logging; fixed cancel handling |
| 5 | 2026-01-16 | Permission UX | ✅ Improved | Added path truncation, filename display, tooltips |

### Metrics to Track

| Metric | Start | Current | Target |
|--------|-------|---------|--------|
| Open bugs | 4 | 1 | 0 |
| SDK version | 0.2.9 | 0.2.9 | 0.2.9 (latest) ✅ |
| E2E tests | 13 | 13 | 15+ |
| Code complexity | - | - | Lower |

**SDK Status:** Already at v0.2.9. Task 2 (SDK Upgrade) can be skipped.

---

## Research Resources

### Official Documentation
- [Claude SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude SDK Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Claude SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [Claude Code Changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Project Documentation
- [LEARNINGS.md](./docs/LEARNINGS.md) - Technical learnings
- [DEVLOG.md](./DEVLOG.md) - Development log
- [RALPH_LOOP.md](./RALPH_LOOP.md) - E2E testing loop

### Check Before Each Iteration
1. Has Claude SDK released new version?
2. Are there new GitHub issues with solutions?
3. Did any assumptions change?

---

## Commands

```bash
# Start iteration
echo "Starting Iteration N: [TASK]" >> DEVLOG.md

# Check SDK version
cd ai-bridge && npm list @anthropic-ai/claude-agent-sdk

# Run tests
./scripts/test-all.sh

# Run E2E tests
node tests/e2e/run-all.mjs

# Build plugin
./gradlew clean buildPlugin

# Deploy to IDE
./scripts/deploy-local.sh
```

---

## Notes

- Each iteration should be completable in 1-2 hours
- If blocked for >30 min, step back and research
- Always commit working state before experimenting
- Document failures as learnings, not just successes
