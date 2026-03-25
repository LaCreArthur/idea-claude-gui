# CLAUDE.md

**Navigation:** See `.claude/INDEX.md` for keywords and file routing.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: idea-claude-gui

IntelliJ IDEA plugin providing a GUI for Claude Code. React/TypeScript webview + Java plugin + Kotlin agent runtime.

## Design Philosophy

**Goal: Be as close as possible to the Claude Code CLI experience, with a GUI layer on top.**

See [docs/DESIGN.md](docs/DESIGN.md) for full design principles and reference guidelines.

## Architecture

```
webview/              # React frontend (Vite + TypeScript + Ant Design)
src/main/java/        # IntelliJ plugin (Java)
src/main/kotlin/      # Kotlin agent runtime (sole execution path)
```

### Communication Flow

```
React Webview <--JCEF bridge--> Java Plugin (Kotlin agent) <--Anthropic SDK--> Claude API
     |                              |
     |-- sendToJava('type', data)   |-- MessageDispatcher routes to handlers
     |                              |-- PermissionService handles tool approvals
```

**Key patterns:**
- Webview sends `type:jsonPayload` strings via `window.sendToJava()`
- Java `MessageDispatcher` routes to registered `MessageHandler` implementations
- Kotlin `AgentRuntime` calls the Anthropic SDK directly (no subprocess)
- Permission requests suspend in `PermissionGate` until Java/frontend responds

## Commands

```bash
# Full test suite
./scripts/test-all.sh

# Component-specific tests
npm test --prefix webview           # React/TypeScript tests
./gradlew test                      # Java/Kotlin tests

# Single test file
npm test --prefix webview -- src/components/ChatInputBox/ChatInputBox.test.tsx
npm test --prefix webview -- --watch  # Watch mode

# Development
./gradlew clean runIde              # Debug plugin in sandbox IDE
./gradlew clean buildPlugin         # Build distributable (.zip in build/distributions/)

# Build verification (fast, checks plugin ZIP structure)
./gradlew testE2E

# E2E tests (auto-opens Claude GUI panel, requires Rider running)
node tests/e2e/run-all.mjs          # See docs/E2E_TESTING.md for one-time CDP setup
```

## Testing Guidelines

### The Loop
When implementing features: **code → test → fix → verify**

Run tests after changes. If tests fail, fix before moving on.

### Test-First for New Features
For non-trivial features, write failing tests first:
1. Define expected behavior as test cases
2. Verify tests fail
3. Implement until tests pass

### What to Test
- **React components**: User interactions, state changes, bridge calls
- **Java/Kotlin handlers**: Message routing, file operations, agent lifecycle

### Test Patterns

**React (Vitest + Testing Library):**
```typescript
it('calls sendToJava when clicked', async () => {
  render(<Component />);
  fireEvent.click(screen.getByRole('button'));
  expect(sendToJava).toHaveBeenCalledWith('action', expect.objectContaining({...}));
});
```

**Watch for test cheating** - review that tests verify actual behavior, not hardcoded values.

## Code Style

- English comments only
- No excessive debug logging in production
- Follow existing patterns in codebase
- English strings for all user-facing text (no i18n)

## Key Files

**Webview (React):**
- `webview/src/App.tsx` - Main React app, message rendering, state management
- `webview/src/utils/bridge.ts` - Java bridge communication (`sendToJava`)
- `webview/src/hooks/useProviderConfig.ts` - Model/provider/reasoning effort state
- `webview/src/hooks/useChatHandlers.ts` - Chat handlers, bridge event dispatch
- `webview/src/hooks/useStreamingCallbacks.ts` - Streaming delta accumulation, lifecycle
- `webview/src/components/ChatInputBox/types.ts` - Model and reasoning effort types/constants
- `webview/src/components/MessageItem/MessageUsage.tsx` - Per-message token usage badge
- `webview/src/components/PermissionDialog.tsx` - Tool permission UI

**Kotlin Agent Runtime:**
- `src/main/kotlin/.../agent/AgentRuntime.kt` - Core agentic loop: calls Anthropic SDK, handles tool use, manages conversation history
- `src/main/kotlin/.../agent/KotlinAgentLauncher.kt` - Launches `AgentRuntime` on a coroutine scope, returns cancellable `LaunchResult`
- `src/main/kotlin/.../agent/AuthProvider.kt` - 5-tier auth resolution (apiKeyHelper → settings.json token → settings.json key → env vars → Keychain)
- `src/main/kotlin/.../agent/StreamEmitter.kt` - Translates SDK streaming events to `MessageCallback` calls consumed by Java layer
- `src/main/kotlin/.../agent/PermissionGate.kt` - Suspends coroutine on tool permission requests until `PermissionService` resolves
- `src/main/kotlin/.../agent/ToolRegistry.kt` - Registers built-in tools (bash, read, write, edit, glob, grep) and dispatches tool calls

**Java Plugin:**
- `src/main/java/.../ClaudeSDKToolWindow.java` - Plugin entry, JCEF webview setup
- `src/main/java/.../handler/MessageDispatcher.java` - Routes messages to handlers
- `src/main/java/.../handler/SessionHandler.java` - Chat session management
- `src/main/java/.../handler/SettingsHandler.java` - Settings from webview (model, effort, permissions)
- `src/main/java/.../handler/HandlerContext.java` - Per-window mutable state
- `src/main/java/.../session/SessionState.java` - Per-session state
- `src/main/java/.../session/ClaudeMessageHandler.java` - Bridge event handler, streaming delta routing
- `src/main/java/.../session/CallbackHandler.java` - Callback dispatch to UI layer
- `src/main/java/.../ui/SessionCallbackFactory.java` - Session callback creation with epoch guards
- `src/main/java/.../permission/PermissionService.java` - Tool approval logic
- `src/main/java/.../provider/claude/ClaudeSDKBridge.java` - Gutted stub — slash commands, history, interrupt (Kotlin agent is sole execution path)
- `src/main/java/.../provider/claude/ProcessManager.java` - Process registry, cleanup
- `src/main/java/.../settings/WorkingDirectoryManager.java` - CWD resolution

**Architecture docs:**
- `docs/CODEBASE_MAP.md` - Session lifecycle, streaming, permission flow, authentication
- `docs/UPSTREAM_DELTA.md` - Upstream feature analysis and port candidates

## Release Checklist

1. Update version in `build.gradle`
2. Update `CHANGELOG.md` with release notes (format: `##### **vX.Y.Z** (YYYY-MM-DD)`)
3. Commit: `chore: Bump version to X.Y.Z`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. CI builds and publishes to JetBrains Marketplace automatically on version tags

Note: `build.gradle` auto-generates `<change-notes>` from CHANGELOG.md

## Adding New Features

For full-stack settings/features that span React → Java → bridge.js → SDK, see `.claude/skills/full-stack-feature.md` — documents the exact 11-file path with checklist.

## Writing E2E Tests

See `.claude/skills/e2e-test.md` for the template, Page Object API, and patterns (intercepting React callbacks, writing config directly, etc.).

## Self-Improving Skills

Every piece of work on this project — coding, debugging, testing, exploring — is a pass through the loop: **DO → OBSERVE → IMPROVE**. Not just named skills. Everything.

### The Loop

After completing any task, ask: **what did I learn that the system doesn't know yet?**

- Discovered an architectural pattern? → Update MEMORY.md or the relevant skill
- Hit a gotcha that would trip me up again? → Add to CLAUDE.md (Known Gotchas section) or relevant skill file
- User corrected a workflow mistake? → Update the skill file (guard, step, or failure mode)
- Debugged something and found the root cause? → Capture it where the next session will find it
- A multi-step procedure worked? → Does a skill exist for it? Should one?

This is mandatory before ending any non-trivial task. The system gets smarter every session.

### Skill File Format

Skills in `.claude/skills/` are executable workflows with guards — not static docs. Every skill has:
- **Guards**: Hard preconditions — STOP if any fails
- **Steps**: Exact commands, not descriptions
- **Verification**: Postconditions to check
- **Known Failure Modes**: Table of symptom → cause → fix
- **Amendment Log**: History of failures and fixes (the skill's evolution record)

### Routing — What Goes Where

| What you learned | Where it goes |
|-----------------|---------------|
| Multi-step workflow with preconditions | `.claude/skills/*.md` (create or update) |
| Atomic fact, tool flag, one-liner gotcha | CLAUDE.md (Known Gotchas section) |
| Project state, configuration, current work | `memory/MEMORY.md` |
| Architectural understanding, data flow, how subsystems connect | `memory/MEMORY.md` or dedicated topic file in memory/ |
| Root cause of a bug you just fixed | CLAUDE.md or skill if there's a related workflow |

Skills reference CLAUDE.md facts in their steps — they compose, not duplicate.

### Available Skills

- `e2e-run.md` — Running E2E tests (rebuild guards, run commands, baseline)
- `e2e-test.md` — Writing new E2E tests (template, Page Object API, patterns)
- `build-deploy.md` — Build/deploy/restart cycle
- `full-stack-feature.md` — 11-file path for new settings/features

## Fork History

Originally forked from [zhukunpenglinyutong/idea-claude-code-gui](https://github.com/zhukunpenglinyutong/idea-claude-code-gui). Upstream sync abandoned January 2026. See `docs/UPSTREAM_DELTA.md` for full feature delta analysis.

**Key differences from upstream:**
- English-only (removed i18n)
- Claude-only (removed Codex/multi-provider)
- Simplified architecture
- Ported: UTF-8 enforcement, proxy/TLS forwarding, zombie process fixes, CWD dedup, reasoning effort selector, streaming deltas, session epoch isolation, per-message token usage, streaming race fix (turn ID), sound notification, enterprise apiKeyHelper auth
