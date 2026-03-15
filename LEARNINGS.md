# Project Learnings

Format: `[YYYY-MM-DD] #tag: insight`
Greppable: `grep "#hooks" LEARNINGS.md`

---

[2025-01-19] #e2e #paths: Screenshot paths must use __dirname-based absolute paths, not relative paths like `tests/e2e/screenshots/`. Relative paths double up when working directory changes.

[2025-01-19] #architecture #files: Files over 1000 lines cause Claude token limit errors. Target max ~800 lines per file.

[2025-01-19] #react #hooks: When extracting hooks from large components, group related state together (e.g., all permission dialog state into usePermissionDialog).

[2025-01-19] #java #refactoring: Inner classes in Java (like ClaudeChatWindow inside ClaudeSDKToolWindow) should be extracted to separate files when they exceed ~500 lines.

[2026-01-19] #java #duplication: When utility methods are duplicated across 3+ files, extract to a static utility class. Creates a single source of truth and reduces maintenance burden.

[2026-01-20] #e2e #jcef: Drag-drop can be simulated via DataTransfer API + DragEvent in page.evaluate(). Native file dialogs cannot be automated in JCEF.

[2026-01-20] #e2e #debugging: Message counting (user=1, assistant=0) reveals rendering bugs faster than inspecting content. Check DOM state before/after.

[2026-01-20] #bugs #symptoms: "Stuck on generating" can mean 2 things: (1) infinite loading, or (2) generation completes but response never renders. Count messages to distinguish.

[2026-01-20] #intellij #services: Singletons cause cross-IDE-instance bugs. Convert to `@Service(Service.Level.PROJECT)` + `project.getService(Foo.class)` for per-project isolation.

[2026-01-20] #e2e #automation: Full E2E flow: `./scripts/rebuild-and-test.sh` handles build→deploy→restart→open GUI. Script auto-detects last opened project from `recentSolutions.xml` to bypass Rider's welcome screen. CDP only works after webview loads (~20s after Rider start).

[2026-02-25] #rider #startup: `open -a Rider` without a project path lands on the welcome/project selection screen, blocking E2E tests. Fix: `open -a Rider ~/path/to/project.sln`. Last opened project found in `~/Library/Application Support/JetBrains/Rider2025.3/options/recentSolutions.xml` — look for `opened="true"` or highest `activationTimestamp`.

[2026-02-25] #e2e #auth: Auth warning bar E2E tests use CDP to inject fake auth state via `window.updateAuthStatus('{"authenticated":false,"authType":"none"}')` — no real credentials touched. Pattern: inject state → check DOM → restore state. Submit guard also testable this way (message count before/after).

[2026-01-20] #sdk #multimodal: Claude Agent SDK query() expects `prompt: string | AsyncIterable<SDKUserMessage>`, NOT content array. For images, yield SDKUserMessage with `message: { role: 'user', content: [...] }` via async generator.

[2026-02-25] #build #deploy: Java 21 not default — must `export JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home` before `./gradlew clean buildPlugin`. Deploy: `rm -rf` then `unzip` to `~/Library/Application Support/JetBrains/Rider2025.3/plugins/`. Restart Rider after.

[2026-02-25] #models #architecture: Model IDs are scattered across 9 files (TS types, selectors, defaults in 4 Java files, pricing). When adding/replacing models, grep for old IDs across `*.{ts,tsx,java}` to catch all occurrences. Pricing in ClaudeHistoryReader uses substring matching — new versions in same family match automatically.

[2026-03-15] #feature #full-stack: Adding a new user-facing setting touches 11-12 files across 4 layers (React types → selector → hooks → App.tsx → Java handler → HandlerContext → SessionState → ClaudeSDKBridge → bridge.js → SDK). See `.claude/skills/full-stack-feature.md` for the exact path. Reference impl: reasoning effort selector.

[2026-03-15] #java #charset: 13 instances of `new FileReader()`/`new FileWriter()` without charset use platform default encoding — breaks on Windows with non-UTF-8 locale. Always use `new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8)` and equivalent for writers.

[2026-03-15] #process #zombie: 6 process spawning paths exist (see `docs/CODEBASE_MAP.md`). Only the main bridge was registered with ProcessManager. Unregistered processes without timeouts (SessionOperations) can become zombies. Always register with ProcessManager + add a timeout for any new process spawning path.

[2026-03-15] #proxy #env: Corporate proxy users need `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `SSL_CERT_FILE`, `SSL_CERT_DIR` forwarded to spawned Node processes. Done via `EnvironmentConfigurator.configureNetworkEnv()`.

[2026-03-15] #sdk #thinking: Claude Agent SDK `query()` accepts `thinkingBudget` in options to control reasoning depth. Pass as integer (token count). Values: Low=1024, Medium=10000, High=32000. Omit to let SDK decide.

[2026-03-15] #streaming #architecture: Streaming data flow: bridge.js emits `stream_start` → `content_delta`/`thinking_delta` → `stream_end`. Java `ClaudeMessageHandler` routes deltas to `CallbackHandler.notifyContentDelta()` (lightweight) instead of `notifyMessageUpdate()` (full snapshot). Raw JSON model (`applyTextDeltaToRaw`/`applyThinkingDeltaToRaw`) still updated in-place for when snapshots DO fire (tool_use, stream_end). Frontend streaming infra (`useStreamingCallbacks.ts`) is fully built — just needs signals.

[2026-03-15] #streaming #config: Streaming defaults to OFF. Config at `~/.claude-gui/config.json` key `streaming.default` (boolean). Read at query time by `ClaudeSession.launchClaude()` → `PluginSettingsService.getStreamingEnabled()`. When null/missing, bridge.js defaults `streaming = false` and SDK never emits `stream_event` messages.

[2026-03-15] #streaming #bridge-events: bridge.js event ordering for streaming: `stream_event` deltas (via `continue`, skip line 381) → non-stream events pass through normally → `assistant` message (has `raw.message.usage`) → `result` event (has cumulative usage) → AFTER loop: `stream_end` → `done`. The `result` event arrives BEFORE `stream_end`, so `handleResult` can inject usage into `currentAssistantMessage.raw` before the final snapshot.

[2026-03-15] #session #epoch: Session epoch isolation pattern: capture `final ClaudeSession capturedSession = this.session` at callback creation time. Guard state-mutating callbacks with `this.session == capturedSession` (reference identity, atomic on JVM). Don't guard `onSessionIdReceived` (always valid) or `onPermissionRequested` (must always show). Stale events from old bridge threads silently dropped.

[2026-03-15] #e2e #streaming-instrumentation: React `useEffect` reassigns `window.onStreamStart` etc. on every render, destroying any simple wrapper. Use `Object.defineProperty` with custom getter/setter to intercept all future assignments. The setter wraps each new function in a recording proxy. Must handle the case where the function is already set before defineProperty (re-trigger setter for existing value).

[2026-03-15] #e2e #config-write: For E2E tests that need config changes (e.g., enabling streaming), write `~/.claude-gui/config.json` directly via `fs.writeFileSync` instead of round-tripping through `sendToJava('set_streaming_enabled', ...)`. The Java handler's async response may not arrive before the test proceeds. Always restore config in cleanup.

[2026-03-15] #java #packages: Java package is `com.github.claudecodegui`, NOT `com.github.nicholasgasior.intellijclaudecode`. The plan may reference old paths — always `Glob` for files first.

[2026-03-15] #streaming #race: Stale `setTimeout` callbacks in `onContentDelta`/`onThinkingDelta` can fire after `onStreamEnd` clears refs, wiping final message content. Fix: `turnIdRef` counter incremented at `onStreamStart`, captured in every `setMessages` updater and timeout callback — stale callbacks see mismatched turn ID and bail. Same guard in `window.updateMessages` snapshot handler during non-backend-streaming path.

[2026-03-15] #auth #enterprise: Enterprise auth via `apiKeyHelper` in `~/.claude/managed-settings.json`. Bridge executes the helper command (10s timeout), uses output as `ANTHROPIC_API_KEY`. Must be FIRST check in `setupAuthentication()` — takes priority over `settings.json`, keychain, and credentials file.

[2026-03-15] #sound #notification: Sound notification uses Web Audio API (no asset files). `localStorage.getItem('sound-on-complete')` toggle. Plays only when `document.hidden === true` (window not focused). Triggered in `window.showLoading(false)` path. Settings toggle in BasicConfigSection.
