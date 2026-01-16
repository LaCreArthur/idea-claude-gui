# E2E Testing Ralph Loop

## Goal
Provide comprehensive E2E tests ensuring the Claude GUI plugin works as a GUI for Claude Code.

## Loop Tasks

### 1. Run E2E Tests
Execute `./gradlew testE2E` and analyze results.

### 2. Fix Failures
If tests fail, diagnose and fix. Update test code or plugin code as needed.

### 3. Expand Coverage
After passing tests, add new E2E tests for untested features:
- [x] Tool window opens (claudeToolWindow_opensSuccessfully)
- [x] UI component search (toolWindowStripeButton_exists)
- [x] Webview loads (toolWindowContent_loads)
- [x] Tool window toggle (toolWindow_canBeToggled)
- [x] Test isolation (testIsolation_projectsAreIndependent)
- [ ] Message send/receive round-trip (requires bridge)
- [ ] Session management (requires bridge)
- [ ] Settings persistence (requires IDE restart)
- [ ] Bridge process lifecycle (complex setup)
- [ ] Error handling (requires failure injection)

### 4. Update Learning Doc
After each iteration, append learnings to `docs/E2E_LEARNINGS.md`:
- What worked/failed
- Tool usage efficiency (grep vs Task agent, parallel calls)
- Context management insights
- Test patterns discovered

### 5. Self-Improve
Review learnings and apply them. Be more efficient each iteration:
- Use parallel tool calls when possible
- Use Task agents for exploration
- Avoid redundant reads
- Cache knowledge across iterations

## Completion Criteria
Output `<promise>E2E COMPLETE</promise>` when:
- All core features have passing E2E tests
- Learning doc has actionable insights
- Test suite is stable and maintainable

## Current State (Iteration 6)

### What Exists
- JetBrains Starter Framework configured in `build.gradle`
- **9 passing tests** in `src/test/kotlin/com/github/claudecodegui/e2e/MessageRoundTripTest.kt`:
  - **Fast tests (no IDE):**
    - `pluginBuild_containsRequiredFiles()` - verifies plugin ZIP
    - `testMode_flagsAreConfigured()` - verifies system properties
    - `testIsolation_projectsAreIndependent()` - verifies test isolation
    - `aiBridge_hasRequiredStructure()` - verifies ai-bridge.zip internals
    - `webviewHtml_existsInPlugin()` - verifies HTML in plugin JAR
  - **IDE tests (launch Rider):**
    - `claudeToolWindow_opensSuccessfully()` - verifies plugin loads
    - `toolWindowStripeButton_exists()` - uses xQuery UI search
    - `toolWindowContent_loads()` - verifies webview loads
    - `toolWindow_canBeToggled()` - opens, closes, reopens tool window
- xQuery UI search works (requires macOS Accessibility)
- Modern E2E research completed (Claude computer use, Playwright MCP, natural language tests)

### What's Needed
- **User story-based tests** (more realistic scenarios)
- Screenshot-based visual validation
- Natural language test definitions
- Bridge lifecycle testing

## Key Files
- `src/test/kotlin/com/github/claudecodegui/e2e/MessageRoundTripTest.kt` - E2E tests
- `build.gradle` - testE2E task and Starter Framework deps
- `src/main/resources/META-INF/plugin.xml` - tool window ID is "Claude GUI"
- `docs/E2E_LEARNINGS.md` - learnings document (create if missing)

## Commands
```bash
./gradlew testE2E           # Run E2E tests
./gradlew buildPlugin       # Build plugin ZIP
```

## To Resume
Start a new Ralph loop with:
```
/ralph-loop "Continue E2E testing loop. Read docs/E2E_RALPH_LOOP.md for context and current state. Run tests, fix failures, expand coverage, update learnings." --max-iterations 50 --completion-promise "E2E COMPLETE"
```
