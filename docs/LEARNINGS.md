# Development Learnings

Hard-won lessons from building this IntelliJ plugin for Claude Code.

**Last Updated:** 2026-01-16

---

## Table of Contents

1. [Project Decisions & History](#project-decisions--history)
2. [SDK Integration](#sdk-integration)
3. [Windows Compatibility](#windows-compatibility)
4. [JCEF/Webview Automation](#jcefwebview-automation)
5. [E2E Testing](#e2e-testing)
6. [File & Path Handling](#file--path-handling)

---

## Project Decisions & History

### Fork Strategy: Upstream Sync Abandoned (January 2026)

**Context:** This project was forked from [zhukunpenglinyutong/idea-claude-code-gui](https://github.com/zhukunpenglinyutong/idea-claude-code-gui).

**Decision:** Abandon upstream synchronization.

**Why:**
- Upstream uses Chinese UI/comments; we're English-only
- Upstream supports multiple LLM providers (Codex, etc.); we're Claude-only
- Merge conflicts were frequent and painful (60+ localized files)
- Architectural directions diverged significantly

**What we tried:**
1. **Git merge** - Worked initially (18% conflict rate), but too much ongoing effort
2. **Cherry-picking features** - Required understanding upstream's different architecture
3. **Maintaining compatibility layer** - Added complexity without benefit

**Outcome:** Independent development. Cherry-pick specific features manually when valuable.

---

### Simplification: Removed i18n and Multi-Provider Support

**Decision:** Remove all internationalization (i18n) and non-Claude provider support.

**Why:**
- i18n added complexity with minimal benefit for target audience
- Multi-provider abstraction was over-engineered for Claude-only use
- Reduced codebase by ~30% and simplified maintenance

**What was removed:**
- All `i18n/locales/*.json` files (6 languages)
- `i18next` dependency and translation function calls
- Codex SDK integration and `services/codex/` directory
- Provider abstraction layer in Java
- LLM selection UI components

**What worked:**
- Ralph Loop methodology for systematic removal (one file at a time, test, commit)
- State tracking files to resume after context loss
- Parallel agents for planning phase, sequential execution

**What didn't work:**
- Trying to remove everything at once (broke too many things)
- Relying on IDE refactoring tools (missed string references)

---

### Architecture Decision: File-Based IPC for Permissions

**Context:** Need Java plugin to communicate with Node.js ai-bridge for permission dialogs.

**Options considered:**
1. **WebSocket** - Overkill, connection management overhead
2. **HTTP server** - Port conflicts, firewall issues
3. **Stdin/stdout** - Works for messages, but permission dialogs need async bidirectional
4. **File-based IPC** - Simple, reliable, cross-platform

**Decision:** File-based IPC with polling.

**How it works:**
1. Node writes `request-{uuid}.json` to permission directory
2. Java polls directory, shows dialog, writes `response-{uuid}.json`
3. Node polls for response, continues execution

**Tradeoffs:**
- (+) Simple implementation
- (+) Works across all platforms
- (+) Survives process restarts
- (-) Polling latency (~100ms)
- (-) File cleanup needed

---

### Plan Mode: SDK Doesn't Support It Natively

**Research finding:** Claude Agent SDK has `permissionMode: 'plan'` in types, but it doesn't actually work. The SDK doesn't enforce read-only behavior or return plans.

**Solution:** Implement plan mode ourselves:
1. Use mutable session reference pattern to track mode changes mid-conversation
2. Intercept tool calls in PreToolUse hook
3. When in plan mode, block write operations and return guidance to Claude
4. Store plan in persistent file for user review

**What failed:**
- Relying on SDK's `permissionMode: 'plan'` - does nothing
- Trying to use `canUseTool` for mode enforcement - not called for streaming input

**What worked:**
- PreToolUse hooks for all permission/mode logic
- Mutable reference object passed to hooks for dynamic mode changes

---

### Rewind Feature: Checkpoint UUID Mismatch

**Problem:** Rewind failed with "No file checkpoint found for message {uuid}".

**Research:** The SDK creates file checkpoints keyed by user message UUIDs. But the message stream contains TWO types of "user" messages:
1. Actual user prompts (has text content) - SDK checkpoints these
2. Tool result messages (synthetic, only contains `tool_result`) - SDK ignores these

**What failed:**
- Passing any user message UUID to `rewindFiles()` - tool_result UUIDs don't have checkpoints

**Solution:**
1. Frontend: Filter out tool_result-only messages from rewind button display
2. Backend: If rewind fails, walk up `parentUuid` chain to find real user message
3. Retry with candidate UUIDs until success

---

### Failed Approaches Archive

#### Approach: Use `claude-vscode` entrypoint for workspace trust
**Why tried:** VSCode version has workspace trust built-in, might prevent `/tmp` writes.
**Why failed:** Forces official authentication flow, doesn't work with custom API endpoints or self-managed keys.
**Better solution:** Use `sdk-ts` entrypoint + path rewriting in permission handler.

#### Approach: System Claude CLI discovery
**Why tried:** Respect user's installed Claude version.
**Why failed:** Windows `where` returns shim files that can't be spawned; macOS paths vary; version mismatches cause bugs.
**Better solution:** Always use SDK's bundled `cli.js`.

#### Approach: canUseTool callback for all permission handling
**Why tried:** SDK documentation suggests this is the permission entry point.
**Why failed:** Not called when `prompt` is AsyncIterable (required for multimodal messages).
**Better solution:** PreToolUse hooks work regardless of prompt type.

#### Approach: Direct mouse/keyboard automation for E2E tests
**Why tried:** Simple approach using cliclick/osascript.
**Why failed:** System events don't reach JCEF embedded browser - they stop at the Swing container.
**Better solution:** Playwright via Chrome DevTools Protocol (CDP) port 9222.

---

## SDK Integration

### Multimodal Messages Bypass canUseTool

**Problem:** When sending messages with images (multimodal), the SDK's `canUseTool` callback is never triggered. Tools execute without permission checks.

**Root Cause:** When `prompt` is an `AsyncIterable<SDKUserMessage>` (required for images), the SDK doesn't invoke `canUseTool`.

**Solution:** Use PreToolUse hooks instead of relying on `canUseTool`:

```javascript
const preToolUseHook = async (input, toolUseID, options) => {
  if (normalizedPermissionMode !== 'default') {
    return { decision: 'approve' };
  }

  const result = await canUseTool(input.tool_name, input.tool_input);

  if (result.behavior === 'allow') {
    return { decision: 'approve' };
  } else if (result.behavior === 'deny') {
    return {
      decision: 'block',
      reason: result.message || 'Permission denied'
    };
  }
  return {};
};

const options = {
  hooks: {
    PreToolUse: [{ hooks: [preToolUseHook] }]
  }
};
```

**Hook Return Values:**
- `{ decision: 'approve' }` - Allow execution
- `{ decision: 'block', reason: '...' }` - Deny execution
- `{}` - Let SDK decide (shows default prompt)

**Test Checklist:**
- [ ] Text-only message + Write tool -> permission dialog
- [ ] Text-only message + Bash tool -> permission dialog
- [ ] Image+text message + Write tool -> permission dialog
- [ ] Image+text message + Bash tool -> permission dialog
- [ ] Denied permission -> tool doesn't execute

---

### AbortController Must Be Inside Options

**Problem:** Query timeout doesn't work even though AbortController is configured.

**Root Cause:** AbortController was passed at the wrong level.

```javascript
// WRONG
query({ abortController, prompt, options })

// CORRECT
query({ prompt, options: { ..., abortController } })
```

Reference: GitHub issue #2970

---

### TMPDIR and Permission Channel Sync

**Problem:** Permission dialogs time out and auto-deny.

**Root Cause:** If `TMPDIR` is changed, Node's `permission-handler` and Java's `PermissionService` watch different directories.

**Solution:**
1. Set `CLAUDE_PERMISSION_DIR` environment variable pointing to `System.getProperty("java.io.tmpdir")/claude-permission`
2. Both Node and Java read this variable
3. Node writes permission requests there, Java watches the same directory

**Related cleanup:** Set custom `TMPDIR` to `java.io.tmpdir/claude-agent-tmp` to prevent `claude-*-cwd` files from polluting project directory.

---

## Windows Compatibility

### Command-Line Argument Escaping (PowerShell)

**Problem:** Messages containing special characters (parentheses, quotes, newlines) get corrupted when passed as command-line arguments on Windows.

**Root Cause:** PowerShell interprets:
- `()` as subexpressions
- `"` requires special escaping
- `\r\n` splits arguments
- `%` triggers variable substitution

**Solution:** Pass user input via stdin, not command-line arguments.

**Java side:**
```java
JsonObject stdinInput = new JsonObject();
stdinInput.addProperty("message", message);
stdinInput.addProperty("sessionId", sessionId);
String stdinJson = gson.toJson(stdinInput);

ProcessBuilder pb = new ProcessBuilder(command);
pb.environment().put("CLAUDE_USE_STDIN", "true");

Process process = pb.start();
try (OutputStream stdin = process.getOutputStream()) {
    stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
    stdin.flush();
}
```

**Node side:**
```javascript
async function readStdinData() {
  if (process.env.CLAUDE_USE_STDIN !== 'true') {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    setTimeout(() => resolve(null), 100);
  });
}
```

**Rule:** Never pass user-input free text via command-line arguments. Only pass fixed, known-safe values (command names, UUIDs).

---

### Windows Claude CLI Path Resolution

**Problem:** Plugin fails to start with ENOENT error on Windows.

**Root Cause:** `where claude` returns multiple results:
```
D:\Apps\...\claude      <- This one can't be spawned
D:\Apps\...\claude.cmd  <- This one works
```

The first result (no extension) is a shim file that can't be directly executed by Node's `spawn()`.

**Solution:** Don't look for system Claude CLI at all. Use SDK's built-in CLI:

```javascript
// DON'T do this
const claudeCliPath = getClaudeCliPath();
const options = { pathToClaudeCodeExecutable: claudeCliPath };

// DO this - SDK uses built-in cli.js automatically
const options = { /* no pathToClaudeCodeExecutable */ };
```

**Benefits:**
- Works on all platforms
- CLI version matches SDK version
- `ANTHROPIC_BASE_URL` still respected
- Reads `~/.claude/settings.json` normally

---

### Claude Writes to /tmp Instead of Project Directory

**Problem:** Claude CLI writes files to `/tmp/xxx` instead of the project directory.

**Solution:** In `permission-handler.js`, rewrite tool input paths before execution:

```javascript
rewriteToolInputPaths(toolName, input);
```

This function:
1. Recursively checks tool input for `file_path` fields
2. If path points to `/tmp`, `/var/tmp`, etc., rewrites to project root
3. Logs all rewrites for debugging

Also set `CLAUDE_CODE_ENTRYPOINT=sdk-ts` to use the SDK directly.

---

## JCEF/Webview Automation

### Use Chrome DevTools Protocol (CDP)

**Key Finding:** JCEF in JetBrains IDEs exposes Chrome DevTools on port 9222 by default.

**What doesn't work:**
| Method | Result |
|--------|--------|
| `cliclick t:"text"` | Text not entered - system events don't reach JCEF |
| `osascript keystroke` | Text not entered - same reason |
| Clipboard paste (Cmd+V) | Text not entered - same reason |

**What works:** Playwright via CDP:

```javascript
const { chromium } = require('playwright');

const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];

await page.fill('textarea', 'Hello Claude!');
await page.click('button[type="submit"]');
```

**Registry settings:**
| Setting | Default | Key |
|---------|---------|-----|
| Debug port | 9222 | `ide.browser.jcef.debug.port` |
| DevTools menu | false | `ide.browser.jcef.contextMenu.devTools.enabled` |

---

### Hybrid Testing Architecture

| Layer | Tool | Purpose |
|-------|------|---------|
| IDE UI | AppleScript | Open windows, navigate menus |
| JCEF Webview | Playwright via CDP:9222 | Interact with React UI |
| Test Logic | TypeScript | Assertions, data setup |

AppleScript for native IDE navigation:
```bash
osascript -e 'tell application "System Events"
    tell process "rider"
        click menu item "Claude GUI" of menu "Tool Windows" ...
    end tell
end tell'
```

Playwright for webview:
```typescript
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];
await page.fill('.input-editable', text);
```

---

## E2E Testing

### Pre-Flight Checklist

```bash
# Verify CDP is available
curl -s http://localhost:9222/json/version | head -1

# If CDP fails: Open Claude GUI panel in IDE
```

### After Code Changes - Always Rebuild

```bash
./gradlew clean buildPlugin
rm -rf ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/idea-claude-gui
unzip -o build/distributions/idea-claude-gui-*.zip -d ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/
# Restart IDE
```

Cost of forgetting: 10-30 minutes debugging old code.

### Component Selectors

| Component | Selector |
|-----------|----------|
| Chat Input | `.input-editable` |
| Submit Button | `.submit-button` |
| Permission Dialog | `.permission-dialog-v3` |
| Permission Options | `.permission-dialog-v3-option` (0=Allow, 1=Always, 2=Deny) |
| AskUser Dialog | `.ask-user-question-dialog` |
| New Session | `.icon-button[data-tooltip="New Session"]` |

### Common Bug Patterns

**Default Values Wrong:** React state initialized incorrectly. Check `useState()` calls.

**Persistent Settings Override:** Old value saved in storage overrides code fix. Clear storage.

**SDK Bypasses Callback:** SDK has its own allow rules in `.claude/settings.local.json`. Use commands not in the allow list.

---

## File & Path Handling

### Protocol-Based IPC

ai-bridge uses prefixes for Java-side parsing:
- `[MESSAGE]` - Chat messages
- `[CONTENT]` - Content blocks
- `[SESSION_ID]` - Session identifiers

These are NOT debug logs. Do not remove.

### Key File Locations

| What | Path |
|------|------|
| Plugin install | `~/Library/Application Support/JetBrains/Rider2025.3/plugins/idea-claude-gui/` |
| IDE logs | `~/Library/Logs/JetBrains/Rider2025.3/idea.log` |
| Claude settings | `~/.claude/settings.json` |
| Project rules | `.claude/settings.local.json` |
| Built plugin | `build/distributions/idea-claude-gui-*.zip` |

---

## Research Updates (January 2026)

### Validated: Plan Mode NOT Supported in SDK

**Official documentation confirms:**
> `plan` mode is not currently supported in the SDK.

Source: [Claude SDK Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)

Our workaround using PreToolUse hooks is the correct approach. The SDK has `permissionMode: 'plan'` in types but it does nothing.

---

### CLAUDE_CODE_TMPDIR Implementation (January 2026)

**Discovery:** SDK v2.1.5 added `CLAUDE_CODE_TMPDIR` environment variable to override temp directory.

**Implementation:** Added `process.env.CLAUDE_CODE_TMPDIR = workingDirectory` in bridge.js.

**Location:** `ai-bridge/bridge.js:375-378`

**How it works:**
1. Java passes `cwd` (project directory) to bridge.js
2. Before SDK query, we set `CLAUDE_CODE_TMPDIR` to `cwd`
3. SDK uses this directory for temp files instead of `/tmp`

**Result:** Files are written to project directory. The old path rewriting approach (rewriteToolInputPaths) was removed during simplification.

**Note:** This only affects the SDK's internal temp file handling. If Claude explicitly writes to `/tmp/...`, that's Claude's decision based on the prompt.

---

### New SDK Feature: V2 Interface (Preview)

**Discovery:** A simplified interface with `send()` and `receive()` patterns is now in preview.

Source: [TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)

**Impact:** Could simplify our multi-turn conversation handling in ai-bridge.

**Action:** Evaluate migration to V2 interface when it stabilizes.

---

### New SDK Feature: settingSources Option

**Discovery:** SDK now allows controlling which settings are loaded via `settingSources` option.

```typescript
settingSources: ['user', 'project', 'local']  // Load all
settingSources: ['project']  // Only project settings
settingSources: []  // No filesystem settings (default)
```

**Impact:** We could use this to ensure consistent behavior and avoid user settings interfering with plugin operation.

---

### Clarified: canUseTool vs Hooks

**Finding:** The permission flow is:
1. PreToolUse Hooks (run first, can allow/deny/continue)
2. Permission rules (deny -> allow -> ask)
3. Permission mode check
4. canUseTool callback (last resort)

**Our assumption was partially wrong:** canUseTool IS called for AsyncIterable prompts, but only if hooks and rules don't resolve it first. Our issue was likely that we weren't using hooks consistently.

**Better approach:** Always use PreToolUse hooks for permission logic. They run first and work for all prompt types.

---

### New Hook Events Available

SDK now supports these hook events we're not using:
- `PermissionRequest` - Called when permission is needed
- `SessionStart` - Called when session begins
- `SessionEnd` - Called when session ends
- `SubagentStart/Stop` - Called for subagent lifecycle
- `PreCompact` - Called before message compaction

**Potential use:** `PermissionRequest` hook might be cleaner than PreToolUse for our permission dialog flow.

---

### SDK Breaking Changes to Address

1. **Zod ^4.0.0 required** - Check if our ai-bridge needs update
2. **Legacy SDK entrypoint removed** - Ensure we're using `@anthropic-ai/claude-agent-sdk`
3. **Windows managed settings path changed** - Not relevant for us

---

## Improvement Opportunities

### High Priority

1. **Try CLAUDE_CODE_TMPDIR** - May eliminate path rewriting complexity
2. **Upgrade to latest SDK** - Get security fixes and new features
3. **Use PermissionRequest hook** - Cleaner permission handling

### Medium Priority

4. **Evaluate V2 Interface** - Simpler multi-turn conversations
5. **Add settingSources** - Control which settings load
6. **Use new hook events** - SessionStart/End for lifecycle management

### Low Priority

7. **Unix sockets for IPC** - Faster than file-based, but more complex
8. **node-ipc library** - Consider for better cross-platform IPC

---

## Open Bugs

### BUG-002: Choice selection does nothing
AskUserQuestion dialog shows choices but selecting does nothing.
**Hypothesis:** May be related to how we handle the tool response.

### BUG-003: Permission popup not readable
Full path truncated, diff unreadable.
**Fix needed:** Better UX design for permission dialog.

### BUG-005: Shift+Enter doesn't work
Should insert newline in chat input.
**Fix needed:** Handle keyboard event in React component.

### BUG-006: Drag-drop cursor jumping
Cursor jumps after file reference when typing before it.
**Fix needed:** ContentEditable cursor position management.

---

## Sources

- [JetBrains JCEF Documentation](https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html)
- [Playwright CDP Connection](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Claude SDK Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Claude SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Code Changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [Claude Code Changelog Summary](https://claudelog.com/claude-code-changelog/)
