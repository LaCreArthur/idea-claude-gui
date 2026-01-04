# Project: idea-claude-code-gui

IntelliJ IDEA plugin providing a GUI for Claude Code. React/TypeScript webview + Java plugin + Node.js ai-bridge.

## Architecture

```
webview/          # React frontend (Vite + TypeScript)
ai-bridge/        # Node.js Claude API bridge
src/main/java/    # IntelliJ plugin (Java)
```

## Commands

```bash
./scripts/test-all.sh      # Run all tests (webview + ai-bridge + Java)
./gradlew clean runIde     # Debug plugin in sandbox IDE
./gradlew clean buildPlugin # Build distributable
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
- **ai-bridge**: Message handling, API responses
- **Java handlers**: Message routing, file operations

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
- i18n for all user-facing strings (6 locales)

## Key Files

- `webview/src/App.tsx` - Main React app
- `ai-bridge/permission-handler.js` - File-based IPC
- `src/main/java/.../ClaudeSDKToolWindow.java` - Plugin entry
- `src/main/java/.../handler/` - Message handlers
