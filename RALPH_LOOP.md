# Ralph Loop: Self-Improving E2E Testing

Autonomous improvement loop for Claude GUI plugin testing and development.

**Started:** 2026-01-16
**Status:** Active

---

## Research Findings

### Key Discoveries from Web Research

1. **Plan Mode SDK**: Issue #2585 closed - use `--permission-mode plan` instead. Claude exits via `ExitPlanMode` tool call with plan in input.

2. **Self-Healing Tests**: 2026 tools (Virtuoso QA, mabl, Checksum) achieve 95% self-healing. Key: multiple fallback locator strategies.

3. **Page Object Model**: Best practice for Playwright - separate page classes from test logic for maintainability.

4. **JetBrains Starter Framework**: Limited JCEF support - confirms CDP approach is correct for webview testing.

5. **Playwright Best Practices**:
   - Use `getByRole()`, `getByLabel()`, `getByTestId()` over CSS selectors
   - Fresh browser contexts per test
   - Parallel test execution
   - CI/CD integration

### Insights Applied

- [x] CDP approach validated (better than Starter for JCEF)
- [ ] Refactor to Page Object Model
- [ ] Add self-healing locator fallbacks
- [ ] Improve test isolation

---

## Untested User Stories (Priority Order)

### P0 - Core Functionality
- [x] **US-1**: Send message, receive streaming response (TESTED)
- [x] **US-2**: Session management (create, switch, delete) (TESTED)
- [x] **US-3**: Resume existing session (TESTED - navigation works)
- [x] **US-4**: Model selection (Sonnet, Opus, Haiku) (TESTED)

### P1 - Important Features
- [x] **US-5**: Permission dialog flow (TESTED)
- [x] **US-6**: Mode switching (TESTED)
- [x] **US-7**: Plan mode behavior (TESTED - SDK limitation documented)
- [ ] **US-8**: AskUserQuestion with custom input ("Other" option)
- [ ] **US-9**: MCP server configuration
- [ ] **US-10**: Skills/Agents execution

### P2 - Secondary Features
- [ ] **US-11**: Favorites (star sessions)
- [ ] **US-12**: Session titles (auto-generated)
- [ ] **US-13**: Settings persistence
- [x] **US-14**: Error handling (TESTED - empty msg, interrupt, UI stability)

---

## Improvement Hypotheses

### H1: Page Object Model will reduce test maintenance
**Prediction:** Refactoring to POM will make adding new tests 50% faster
**Test:** Implement POM, measure time to add US-1 test

### H2: Self-healing locators will reduce flakiness
**Prediction:** Adding fallback selectors will reduce test failures by 80%
**Test:** Track failure rate before/after

### H3: Parallel execution will speed up test suite
**Prediction:** Running tests in parallel will be 2-3x faster
**Test:** Measure suite time sequential vs parallel

### H4: CI integration will catch regressions earlier
**Prediction:** GitHub Actions will catch issues before manual testing
**Test:** Set up CI, track bugs caught

---

## Current Iteration

### Iteration 1: Core Message Flow + More ✅
**Goal:** Test US-1 (send/receive) with improved architecture

**Tasks:**
- [x] 1.1 Refactor helpers to Page Object Model
- [x] 1.2 Create ClaudeGUIPage class with resilient selectors
- [x] 1.3 Implement US-1 test (send message, verify response)
- [x] 1.4 Implement US-2 test (session management)
- [x] 1.5 Implement US-4 test (model selection)
- [x] 1.6 Run and validate all tests
- [ ] 1.7 Document learnings

**Results:**
- 6 tests now passing (up from 3)
- Page Object Model implemented
- Model selector fixed (exclude mode buttons)
- Session isolation verified

### Iteration 2: Extended Coverage (2026-01-16) ✅
**Goal:** Test AskUserQuestion, error scenarios, CI/CD

**Tasks:**
- [x] 2.1 Create test-askuser-custom.mjs
- [x] 2.2 Update E2E_TESTING.md with coverage table
- [x] 2.3 Test error handling scenarios (test-error-handling.mjs)
- [x] 2.4 Add CI/CD integration (GitHub Actions)

**Results:**
- 7 tests now passing (up from 6)
- Error handling test covers: empty message prevention, interrupt recovery, UI stability
- Added test steps to build.yml workflow (webview, ai-bridge, Java tests)
- E2E tests require manual execution (Rider + CDP port)

**Status:** Complete

### Iteration 3: Session Resume and Favorites (In Progress)
**Goal:** Test session lifecycle and secondary features

**Tasks:**
- [x] 3.1 Test US-3 (Resume existing session)
- [ ] 3.2 Test US-11 (Favorites)
- [ ] 3.3 Test US-9 (MCP server configuration)
- [ ] 3.4 Test US-10 (Skills/Agents execution)

**Results:**
- 8 tests now passing (up from 7)
- Session resume test validates navigation and view switching
- Message loading after resume varies (async loading)

**Status:** In Progress

---

## Learnings Log

### Entry 3: Iteration 2 Complete (2026-01-16)
**Tests: 6 → 7 passing**

New test added:
- `test-error-handling.mjs` (US-14) - Empty message, interrupt, UI stability

CI/CD improvements:
- Added test steps to build.yml workflow
- Unit tests run before build (webview, ai-bridge, Java)
- E2E tests remain manual (require Rider with CDP)

Key learnings:
1. **Error messages difficult to test** - window.addErrorMessage exists but rendering detection unreliable
2. **Interrupt recovery works** - Stop button or new session recovers UI
3. **Rapid operations don't crash UI** - Mode/model switches are stable
4. **CI runs unit tests only** - E2E needs actual IDE, not feasible in CI

### Entry 2: Iteration 1 Complete (2026-01-16)
**Tests: 3 → 6 passing**

New tests added:
- `test-message-flow.mjs` (US-1) - Send/receive messages
- `test-session-management.mjs` (US-2) - Session isolation
- `test-model-selection.mjs` (US-4) - Model switching

Key learnings:
1. **Auto-accept mode prevents dialog blocking** - Use for simple tests
2. **Session isolation works** - New sessions don't inherit old messages
3. **Model selector needs careful identification** - Must exclude mode buttons
4. **History view navigation** - Sometimes need to click "Back" first
5. **Leftover dialogs cause flakiness** - Always clean up at test start

Architectural improvements:
- Created `ClaudeGUIPage` Page Object Model
- Added resilient selectors with fallbacks
- Centralized all UI interactions

### Entry 1: Initial State (2026-01-16)
- 3 tests passing: mode-switching, permission-flow, plan-approval
- Tests use inline helpers, not POM
- Selectors are CSS-based, single strategy
- No CI integration yet

---

## Commands

```bash
# Run current tests
node tests/e2e/run-all.mjs

# Run single test
node tests/e2e/test-permission-flow.mjs

# Rebuild and test
./scripts/rebuild-and-test.sh
```
