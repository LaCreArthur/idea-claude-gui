# Codebase Architecture Map

Context gathered for upstream feature porting. Updated 2026-03-15.

## Process Spawning & Lifecycle

### Main Bridge: Daemon Mode

The primary bridge path uses a persistent daemon process (`DaemonConnection.java`). One daemon per `ClaudeSDKBridge` instance, started on first query, kept alive across queries. No one-shot fallback — if daemon fails to start, returns error.

- `ClaudeSDKBridge.getOrCreateDaemon()` — double-checked locking, spawns `node bridge.js --daemon`
- `DaemonConnection.sendQuery()` — sends query JSON with a unique queryId, routes responses via `DaemonQueryCallback`
- `ClaudeSDKBridge.sendViaDaemon()` — creates callback, maps queryId → channelId for abort routing
- Abort: `DaemonConnection.abort(queryId)` sends `{"type":"abort","queryId":"..."}` to daemon stdin

### Other Process Spawning Paths

| Path | File | Method | Command | ProcessManager? | Timeout |
|------|------|--------|---------|-----------------|---------|
| Slash commands | `SlashCommandClient.java` | `getSlashCommands()` | `node bridge.js claude getSlashCommands` | No (fixed channel) | 20s |
| MCP status | `McpStatusClient.java` | `getMcpServerStatus()` | `node bridge.js claude getMcpServerStatus` | No (fixed channel) | 30s |
| Sync query | `SyncQueryClient.java` | `executeQuerySync()` | `node simple-query.js` | No | Configurable |
| Rewind | `RewindOperations.java` | `rewindFiles()` | `node bridge.js claude rewindFiles` | No | 60s |
| Session msgs | `SessionOperations.java` | `getSessionMessages()` | `node bridge.js claude getSession` | No | **None** |

### Process Management

- **ProcessManager.java**: `ConcurrentHashMap<String, Process>` keyed by channelId. `interruptedChannels` Set tracks user-aborted channels. Daemon process registered on start.
- **PlatformUtils.terminateProcess()**: SIGTERM → 3s wait → SIGKILL. Windows: `taskkill /F /T`.
- **Shutdown hook**: `ClaudeSDKToolWindow.registerShutdownHook()` — 3s executor timeout.
- **Window dispose**: `ClaudeChatWindow.dispose()` — interrupt session + cleanupAllProcesses + shutdownDaemon.

### Zombie Process Gaps

- `SessionOperations` — no ProcessManager registration, no timeout
- `RewindOperations` — no ProcessManager registration (has 60s timeout)
- `SyncQueryClient.executeQuerySync()` — no ProcessManager registration

## Environment Variables

### Set by Java (EnvironmentConfigurator.java)

| Variable | Purpose |
|----------|---------|
| `PATH` | Adds Node.js dir + system paths |
| `HOME` | For SDK to find `~/.claude/` |
| `NODE_PATH` | `~/.claude-gui/dependencies/node_modules` + global npm |
| `CLAUDE_PERMISSION_DIR` | `<tmpdir>/claude-permission/` |
| `TMPDIR/TEMP/TMP` | `<tmpdir>/claude-agent-tmp/` |
| `IDEA_PROJECT_PATH` | User's working directory |
| `CLAUDE_USE_STDIN` | `"true"` for stdin-based input |

### Set by Node (bridge.js)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_AUTH_TOKEN` | From settings.json env |
| `ANTHROPIC_API_KEY` | From settings.json env |
| `ANTHROPIC_BASE_URL` | Custom API endpoint |
| `CLAUDE_CODE_TMPDIR` | Working directory |

### Also Forwarded (EnvironmentConfigurator)

- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` — forwarded from system env
- `NODE_TLS_REJECT_UNAUTHORIZED` / `NODE_EXTRA_CA_CERTS` — forwarded from system env

## Session Management

### Session IDs

- **channelId**: Java-generated UUID per bridge process launch (`ClaudeSession.launchClaude()` line 195). Maps to OS process.
- **sessionId**: From Claude SDK. Received via `{ type: "session_id" }` event. Used for resume.
- **Epoch guard**: `setupSessionCallbacks()` captures `final ClaudeSession capturedSession`. All state-mutating callbacks check `this.session == capturedSession` (reference identity) — stale events from old bridge threads silently dropped. See `SessionCallbackFactory.java`.

### Session Lifecycle

1. **Create**: `ClaudeChatWindow.createNewSession()` (line 681) — interrupts old session, creates new ClaudeSession, re-determines CWD
2. **Load history**: `ClaudeChatWindow.loadHistorySession()` (line 554) — creates new ClaudeSession with persisted sessionId
3. **Dispose**: `ClaudeChatWindow.dispose()` (line 819) — interrupt + cleanup

### determineWorkingDirectory() — Two Copies

Exists in both `SessionHandler.java:239` and `ClaudeChatWindow.java:520` (identical logic):
1. `project.getBasePath()` → if null/missing, fall back to `user.home`
2. Check `PluginSettingsService.getCustomWorkingDirectory(projectPath)` — supports relative paths
3. Validate exists + is directory → return, else return raw projectPath

**CWD bug**: No validation that the path is within the project. External files (e.g. `~/.claude/plans/*.md`) as active editor could produce wrong CWD.

## Streaming

### Architecture (active since 0.2.13)

Two parallel data paths during streaming:
- **Delta path** (lightweight): `bridge.js` → `content_delta`/`thinking_delta` → Java `notifyContentDelta()` → frontend `window.onContentDelta()` — character-level updates via refs + 50ms throttle
- **Snapshot path** (structural): Full message JSON on `tool_use`, `stream_end`, and `result` events — ensures in-memory model consistency

### Lifecycle events

`bridge.js` emits `stream_start` before first delta, `stream_end` after the `for await` loop ends.
Java `ClaudeMessageHandler.handleStreamStart/End()` sets `isStreaming` flag which gates whether `handleContent`/`handleAssistantMessage` send full snapshots.

### Key state tracking

- **Java**: `ClaudeMessageHandler` has `currentAssistantMessage`, `isStreaming`, `textSegmentActive/thinkingSegmentActive` booleans. Raw JSON model updated in-place by `applyTextDeltaToRaw`/`applyThinkingDeltaToRaw`.
- **Java**: During streaming, the delta path owns `assistantContent` — `handleAssistantMessage()` does NOT update `assistantContent` or `currentAssistantMessage.content` when `isStreaming` is true.
- **Java**: `MessageMerger` uses synthetic keys (`__text:0`, `__text:1`) for text/thinking blocks (which have no ID) to prevent duplication when merging delta-built raw with event raw.
- **Java**: `StreamingMessageHandler` has `updateSequence` (monotonic), `STREAM_MESSAGE_UPDATE_INTERVAL_MS = 50`
- **React**: `useStreamingCallbacks.ts` has `streamingContentRef`, `streamingMessageIndexRef`, segment arrays. For Claude provider, `useBackendStreamingRenderRef = true` — snapshots create/update messages, deltas provide smooth incremental text.

### Config

Streaming defaults OFF. Config: `~/.claude-gui/config.json` → `streaming.default` (boolean). Read at query time by `ClaudeSession.launchClaude()` → `PluginSettingsService.getStreamingEnabled()`.

## Model Selection Flow

```
React ModelSelect → sendBridgeEvent('set_model', id)
  → MessageDispatcher → SettingsHandler.handleSetModel()
    → resolveActualModelName() (checks env overrides)
    → HandlerContext.setCurrentModel() + SessionState.setModel()
    → window.onModelConfirmed() → React
```

### Model Defaults

All three locations default to `claude-sonnet-4-6`:
- `ChatInputBox.tsx:32`, `ButtonArea.tsx:10`
- `HandlerContext.java:26`
- `SessionState.java:23`

### Parameters Passed to ai-bridge

| Parameter | Source |
|-----------|--------|
| `message` | User input |
| `sessionId` | SessionState (empty string if new) |
| `cwd` | SessionState |
| `permissionMode` | SessionState |
| `model` | SessionState |
| `openedFiles` | EditorContextCollector |
| `agentPrompt` | Selected agent |
| `streaming` | PluginSettingsService |
| `attachments` | Base64-encoded array |

**Not passed**: `maxTokens`, `reasoningEffort` — not configurable via SDK. `maxThinkingTokens` IS passed (as `thinkingBudget` in SDK options).

### SDK query() options (bridge.js lines 336-351)

```javascript
options = { cwd, permissionMode, model, maxTurns: 100,
  enableFileCheckpointing: true, includePartialMessages: true,
  additionalDirectories: [cwd], canUseTool, settingSources, systemPrompt, resume }
```

## File I/O Charset Issues

### Using UTF-8 (correct)

- `ClaudeSDKBridge.java` — bridge process I/O
- `DependencyManager.java` — all file ops
- `HtmlLoader.java` — resource loading
- `ClaudeHistoryReader.java` — session files
- `BridgeDirectoryResolver.java` — version files

### Using platform default (broken on non-UTF-8 systems)

- `PluginSettingsService.java:126,141` — plugin config.json
- `ClaudeSettingsManager.java:42,62,81` — Claude settings.json
- `AgentManager.java:37,55` — agent JSON
- `McpServerManager.java:56,174,243,302,322` — MCP server configs
- `FileExportHandler.java:87` — exported files

## Attachment System

**useAttachmentManagement.ts**: Handles paste, drop, and file input.
- Clipboard images: `item.type.startsWith('image/')` → base64 via FileReader
- Clipboard text: plain text insertion
- Clipboard files: `window.getClipboardFilePath()` (Java-injected)
- Supported image types: jpeg, png, gif, webp, svg+xml

Already handles image paste from clipboard at the React level. The gap for upstream's clipboard paste feature may be smaller than expected — need to verify if `window.getClipboardFilePath()` is implemented on the Java side.

## Token Usage Tracking

- **UsageTracker.java**: Extracts `input_tokens`, `cache_*_tokens`, `output_tokens` from last assistant message, computes % against model context limit, pushes via `window.onUsageUpdate(json)`
- **ClaudeNotifier/StatusBarWidget**: Shows token info in IDE status bar
- **SettingsHandler.getModelContextLimit()**: All models = 200K. Supports `[NNNk]`/`[NNNm]` suffix parsing.
- **Per-message display**: `MessageUsage.tsx` renders `raw.message.usage` as "Xk in (Yk cached) / Zk out" below each assistant message. Hidden during streaming.

## Timeout Config

`TimeoutConfig.java`:
- `QUICK_OPERATION_TIMEOUT` = 30s
- `MESSAGE_TIMEOUT` = 180s (unused)
- `LONG_OPERATION_TIMEOUT` = 600s (unused)
- bridge.js: 30s timeout for initial stdin
