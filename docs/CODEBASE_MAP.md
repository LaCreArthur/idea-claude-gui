# Codebase Architecture Map

Updated 2026-03-24 after Phase 2 bridge deletion. The Node.js ai-bridge is gone. Kotlin agent runtime is the sole execution path.

## Session Lifecycle

```
ClaudeChatWindow.createNewSession()
  → ClaudeSession (per-session state: sessionId, epoch, CWD, model)
    → ClaudeSDKBridge.sendQuery()
      → KotlinAgentLauncher.launch(AgentRuntime, AgentConfig, userMessage)
        → AgentRuntime.run() — coroutine, calls Anthropic SDK directly
          → Anthropic SDK (streaming beta messages API)
```

- **Epoch guard**: `SessionCallbackFactory` captures `capturedSession` at setup time. All state-mutating callbacks check `this.session == capturedSession` (reference identity) — stale events from old sessions are silently dropped.
- **Cancellation**: `KotlinAgentLauncher.LaunchResult` holds a `Job`. `ClaudeSDKBridge.interrupt()` cancels it.
- **CWD**: Resolved by `WorkingDirectoryManager` — `project.getBasePath()` → custom override → `user.home` fallback.

## Streaming

```
AgentRuntime (SDK event loop)
  → StreamEmitter.contentDelta() / thinkingDelta() / toolUse() / streamStart() / streamEnd()
    → MessageCallback.onMessage(type, payload)
      → ClaudeMessageHandler.handle*(...)
        → CallbackHandler.notify*(...)
          → SessionCallback (epoch-guarded)
            → UI: window.onContentDelta() / window.onMessage() / etc.
```

Two parallel data paths:
- **Delta path** (lightweight): `content_delta` / `thinking_delta` events → `notifyContentDelta()` → `window.onContentDelta()` — character-level updates, 50ms throttle via `StreamingMessageHandler`.
- **Snapshot path** (structural): Full message JSON on `tool_use`, `stream_end`, `result` — ensures in-memory model consistency.

`ClaudeMessageHandler` state: `currentAssistantMessage`, `isStreaming`, `textSegmentActive`, `thinkingSegmentActive`. During streaming, the delta path owns `assistantContent` — `handleAssistantMessage()` skips content updates while `isStreaming` is true.

`MessageMerger` uses synthetic keys (`__text:0`, `__text:1`) for text/thinking blocks (no SDK ID) to prevent duplication when merging delta-built raw with event raw.

## Permission Flow

```
AgentRuntime — tool call requires permission
  → PermissionGate.check(toolName, input) — suspendCancellableCoroutine
    → PermissionService.requestPermission(toolName, input, callback)
      → frontend: window.onPermissionRequest(json) → PermissionDialog
        → user clicks Allow/Deny → sendToJava('permission_response', ...)
          → PermissionService resolves callback
            → PermissionGate.resume(PermissionResult)
              → AgentRuntime proceeds or skips tool
```

`PermissionGate` short-circuits to `allowed=true` when `permissionMode == "acceptEdits"` or `"bypassPermissions"`.

## Authentication

`AuthProvider.createClient(enable1MContext: Boolean = false)` resolves credentials in priority order:

| Tier | Source | Detail |
|------|--------|--------|
| 1 | `apiKeyHelper` | Runs helper script, reads stdout as bearer token |
| 2 | `settings.json` token | `~/.claude/settings.json` → `env.ANTHROPIC_AUTH_TOKEN` |
| 3 | `settings.json` key | `~/.claude/settings.json` → `env.ANTHROPIC_API_KEY` |
| 4 | Env vars | `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` from process env |
| 5 | Keychain / file | macOS Keychain (`Claude Code-credentials` / `Claude Code`), then `~/.claude/.credentials.json` |

**OAuth token handling**:
- `CLI_SESSION` and `AUTH_TOKEN` types require `anthropic-beta: oauth-2025-04-20` header or the API rejects them.
- Expired tokens: checks `expiresAt`, calls `POST /v1/oauth/token` with `refresh_token` + `client_id: 9d1c250a-e61b-44d9-88ed-5944d1962f5e`. Falls back to `console.anthropic.com/api/oauth/token` if primary fails. Logs error body on failure.
- Persists refreshed tokens back to Keychain or `.credentials.json`.

**1M context**: when `enable1MContext=true`, appends `,context-1m-2025-08-07` to the OAuth beta header (or sets it standalone for API key). Client is recreated in `ClaudeSession` when this flag changes.

Returns a configured `AnthropicOkHttpClient`. Throws `IllegalStateException` if no auth found.

## Key Classes

| Class | Role |
|-------|------|
| `AgentRuntime` | Core agentic loop — calls SDK, dispatches tool use, manages conversation history across turns |
| `KotlinAgentLauncher` | Launches `AgentRuntime` on a `CoroutineScope`, returns cancellable `LaunchResult` |
| `AuthProvider` | 5-tier auth resolution, builds `AnthropicClient` |
| `StreamEmitter` | Translates SDK streaming events to typed `MessageCallback.onMessage()` calls |
| `PermissionGate` | Suspends coroutine on permission requests; resumes when `PermissionService` resolves |
| `ToolRegistry` | Registers built-in tools (bash, read, write, edit, glob, grep), dispatches by name |
| `AgentConfig` | Value object: sessionId, cwd, model, permissionMode, maxThinkingTokens, streaming, attachments, enable1MContext |
| `ClaudeSDKBridge` | Gutted Java stub — wires `KotlinAgentLauncher`, handles slash commands and history |
| `ClaudeMessageHandler` | Consumes `MessageCallback` events, maintains streaming state, routes to `CallbackHandler` |
| `CallbackHandler` | Dispatches to `SessionCallback` (epoch-guarded UI callbacks) |
| `SessionCallbackFactory` | Creates epoch-guarded `SessionCallback` instances |
| `PermissionService` | Java side of permission handshake — bridges frontend dialog to `PermissionGate` |
| `MessageDispatcher` | Routes `type:payload` strings from JCEF to registered `MessageHandler` implementations |

## Model Selection Flow

```
React ModelSelect → sendToJava('set_model', id)
  → MessageDispatcher → SettingsHandler.handleSetModel()
    → resolveActualModelName() (checks env overrides)
    → HandlerContext.setCurrentModel() + SessionState.setModel()
    → window.onModelConfirmed() → React
```

Default model is `claude-sonnet-4-6` in `ChatInputBox.tsx`, `HandlerContext.java`, and `SessionState.java`.

## Parameters Passed to AgentRuntime (via AgentConfig)

| Field | Source |
|-------|--------|
| `sessionId` | `SessionState` (empty if new) |
| `cwd` | `SessionState` |
| `model` | `SessionState` |
| `permissionMode` | `SessionState` |
| `maxThinkingTokens` | `SessionState` |
| `streaming` | `PluginSettingsService` |
| `openedFiles` | `EditorContextCollector` |
| `agentPrompt` | Selected agent |
| `attachments` | Base64-encoded array |
| `enable1MContext` | `SessionState` (default false; UI toggle pending) |

## Token Usage Tracking

- `UsageTracker.java`: Extracts `input_tokens`, `cache_*_tokens`, `output_tokens` from last assistant message, pushes via `window.onUsageUpdate(json)`.
- `MessageUsage.tsx`: Renders per-message usage as "Xk in (Yk cached) / Zk out". Hidden during streaming.
- `SettingsHandler.getModelContextLimit()`: All models = 200K.

## File I/O Charset

UTF-8 enforced on SDK/bridge I/O. Still using platform default (broken on non-UTF-8 systems): `PluginSettingsService`, `ClaudeSettingsManager`, `AgentManager`, `McpServerManager`, `FileExportHandler`.
