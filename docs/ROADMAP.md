# Simplification & Design Roadmap

**Created:** 2026-03-24
**Status:** Planning
**Ship strategy:** Single release, clean break

## Decisions

- **Auth:** Support both OAuth token (Claude Max / Copilot Pro) and API keys
- **Platform floor:** Raise to IntelliJ 2025.x (enables modern JCEF Chromium features: CSS nesting, `:has()`)
- **Ship cadence:** Single release combining bridge removal + frontend redesign

---

## 1. Executive Summary & Vision

45K LOC across 3 runtimes (Java, React, Node.js), 3 build systems (Gradle, Vite, npm), 216 source files. The complexity tax is compounding — every feature touches 3 languages, every bug requires debugging across process boundaries.

**North Star:** A single-language (Kotlin) plugin with a native-feeling UI that a solo developer can ship features to in an afternoon, not a weekend.

**OKRs:**
1. Reduce runtime dependencies from 3 to 2 (kill Node.js bridge)
2. Cut frontend LOC by 40%
3. Achieve <3s cold start (currently bottlenecked by bridge extraction + daemon warmup)
4. Ship a UI that passes the "is this native?" squint test — JetBrains theme-synced

---

## 2. First-Principles: What Gets Discarded

### Assumption #1: "You need Node.js for Claude API access"

ai-bridge exists because the project started when only `@anthropic-ai/sdk` (JavaScript) was mature. Today, the Anthropic Kotlin/Java SDK is production-ready with streaming, tool use, and full API coverage. The bridge is 599 LOC of JavaScript doing what Kotlin can do natively.

**Kill the bridge.** Port the agent loop to Kotlin. Deletes:
- `ai-bridge/` (599 LOC + npm ecosystem)
- `DependencyManager.java` (583 LOC)
- `BridgeDirectoryResolver.java` (984 LOC)
- `DaemonConnection.java` (365 LOC)
- `ProcessManager.java`, `NodeDetector.java`, `EnvironmentConfigurator.java`
- JSON line protocol + stdin/stdout plumbing
- npm as a build dependency

**Estimated deletion: ~3,500 LOC of Java + 599 LOC of JS + entire npm toolchain.**

### Assumption #2: "The React webview needs a component library"

Ant Design is imported for exactly **one `<Switch>` component**. Kill it, replace with a 10-line CSS toggle. -500KB bundle.

### Assumption #3: "JCEF webviews can't look native"

JetBrains exposes `UIManager` colors. Inject them as CSS variables. The webview inherits the IDE palette automatically — light, dark, custom themes all handled.

---

## 3. Tech Stack: Current → Target

| Layer | Current | Target | Rationale |
|-------|---------|--------|-----------|
| Plugin language | Java (24.6K LOC, 0 Kotlin) | **Kotlin** (incremental) | Already in build.gradle; data classes, coroutines, null safety |
| API client | Node.js bridge → `@anthropic-ai/sdk` | **Anthropic Kotlin SDK** (direct) | Eliminates entire runtime + protocol + process management |
| UI runtime | JCEF + React 19 + Vite | **JCEF + React 19 + Vite** (keep) | Works. Markdown/code rendering is hard to replicate in Compose. |
| UI framework | Ant Design (vestigial) | **None** — pure CSS + HTML | Already 99% there. |
| CSS | Less + 150 CSS variables | **CSS Variables only** (drop Less) | Modern CSS has nesting, variables, `:has()`. Less adds build complexity for zero value. |
| State mgmt | 11 hooks, refs, window callbacks | **Zustand** (1KB) | Replaces window.* callback soup with reactive stores |
| Build | Gradle + Vite + npm | **Gradle + Vite** | npm gone with ai-bridge |
| Concurrency | CompletableFuture + EDT | **Kotlin Coroutines** | Structured concurrency, cancellation |

### Why NOT Compose + Jewel

JCEF markdown/code rendering is too strong. Compose for Desktop markdown is immature. JCEF can look native via theme sync. Keep what works.

---

## 4. UI/Design Strategy

### Principles

1. **IDE-harmonious, not IDE-cloned.** Match JetBrains palette and typography.
2. **Content density over decoration.** Maximize content per pixel.
3. **Progressive disclosure.** Chat default. Settings/history tucked away.
4. **Zero chrome, maximum signal.** No unnecessary borders or containers.

### Theme Sync

```kotlin
fun injectThemeVariables(browser: JBCefBrowser) {
    val bg = UIManager.getColor("Panel.background").toCssRgb()
    val fg = UIManager.getColor("Label.foreground").toCssRgb()
    val accent = UIManager.getColor("Component.focusColor").toCssRgb()
    // ... 15-20 semantic tokens
    browser.executeJavaScript("""
        document.documentElement.style.setProperty('--bg-primary', '$bg');
        // ...
    """)
}
```

Register `LafManagerListener` for live theme switching.

### Visual Target

Claude.ai web interface meets JetBrains New UI:
- Flat message layout (no bubbles), content-dense
- Monochrome tool blocks with subtle borders
- Permission: minimal card, inline or slide-up (not modal overlay)
- Code blocks with IDE-matched syntax theme
- No animations >150ms

### Component Architecture Target

```
App.tsx (<200 LOC, just routing)
├── ChatView/
│   ├── MessageList.tsx (virtualized)
│   ├── MessageItem.tsx (flat, tool block delegation)
│   ├── ToolBlock/ (generic, read, edit, bash, task)
│   ├── PermissionInline.tsx (non-modal)
│   └── StreamingIndicator.tsx
├── InputArea/
│   ├── ChatInput.tsx (contenteditable + attachments)
│   ├── ModelPill.tsx
│   └── CompletionDropdown.tsx
├── HistoryPanel.tsx
├── SettingsPanel.tsx
└── stores/
    ├── chatStore.ts
    ├── sessionStore.ts
    └── settingsStore.ts
```

---

## 5. Phased Roadmap

### Phase 0: Foundation & Quick Wins (1–2 weeks)

| Epic | RICE (R/I/C/E) | Description |
|------|----------------|-------------|
| Kill Ant Design | 10/8/10/1 | Remove `antd`. Replace 1 `Switch` with CSS toggle. -500KB bundle. |
| Drop Less → CSS | 8/6/9/2 | Convert 25 `.less` files to `.css`. Remove `less` from build. |
| Fix charset globally | 10/7/10/1 | Force UTF-8 in 5 files still using platform default. |
| Deduplicate CWD logic | 8/5/10/0.5 | Single source of truth in `WorkingDirectoryManager`. |
| First Kotlin file | 10/3/10/0.5 | Start using Kotlin. Write bridge abstraction interface. |

### Phase 1: Kill the Bridge (3–4 weeks)

| Epic | RICE (R/I/C/E) | Description |
|------|----------------|-------------|
| Anthropic Kotlin SDK integration | 10/10/8/5 | Add `com.anthropic:anthropic-java` to Gradle. Streaming client with coroutines. |
| Port agent loop to Kotlin | 10/10/7/5 | Rewrite bridge.js: system prompt, tool defs, permission callbacks, abort. ~600→400 LOC. |
| Auth: OAuth token + API key | 10/10/9/3 | OAuth token (Claude Max, Copilot Pro) as primary. API key fallback. Both paths in Kotlin. |
| Direct permission flow | 10/9/9/3 | Permission callbacks via coroutine suspension. No stdin/stdout round-trip. |
| Delete bridge infrastructure | 10/8/10/2 | Remove: ai-bridge/, DependencyManager, BridgeDirectoryResolver, DaemonConnection, ProcessManager, NodeDetector. ~4K LOC. |
| Streaming via Kotlin Flow | 9/8/8/3 | Kotlin Flow from SDK streaming → deltas pushed directly to JCEF. |

### Phase 2: Frontend Redesign (2–3 weeks, parallel with Phase 1)

| Epic | RICE (R/I/C/E) | Description |
|------|----------------|-------------|
| IDE theme sync | 10/9/9/2 | Inject UIManager colors as CSS variables. LafManagerListener for live switching. |
| Break up App.tsx | 9/8/9/3 | Extract ChatView, HistoryView, SettingsView, DialogManager. App.tsx → <200 LOC. |
| Zustand state management | 8/7/8/3 | Replace 40+ window.* callbacks with reactive stores. |
| Redesign message layout | 9/9/8/3 | Flat layout, content-dense, IDE-matched typography, collapsible tool blocks. |
| Redesign permission dialog | 10/9/9/1 | Minimal inline card: tool name + paths + Allow/Deny/Always. |
| Redesign input area | 8/7/8/2 | Clean input, attachment chips, model selector as minimal pill. |
| Simplify streaming path | 7/8/7/4 | Unify delta + snapshot into single Zustand-driven flow. |

### Phase 3: Kotlin Migration & Polish (4–6 weeks)

| Epic | RICE (R/I/C/E) | Description |
|------|----------------|-------------|
| Migrate handlers to Kotlin | 8/7/8/4 | 16 handlers → ~6 Kotlin handlers. |
| Break ClaudeChatWindow | 9/8/9/3 | 876 LOC → ChatWindowFactory + SessionManager + CallbackRegistry. |
| Break ClaudeSession | 9/8/9/3 | 785 LOC → MessageStore + QueryExecutor + SessionConfig. |
| Unified config layer | 7/6/8/3 | Single ConfigService reading all 5+ config sources. |
| Raise platform floor to 2025.x | 8/5/10/1 | Update build.gradle platformVersion + sinceBuild. |
| Accessibility pass | 6/7/9/2 | ARIA labels, keyboard nav, focus management. |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Kotlin SDK missing OAuth token auth | Medium | High | Audit SDK before Phase 1. Fallback: minimal HTTP client for OAuth flow. |
| JCEF theme sync breaks on custom themes | Low | Medium | Fallback palette if UIManager colors null. Test 3+ themes. |
| Streaming perf regression | Low | High | Benchmark time-to-first-token before/after. |
| Phase 1 blocks Phase 2 | Medium | Medium | Bridge abstraction interface decouples the two. |

---

## 7. Success Metrics

| Metric | Current | After Release |
|--------|---------|---------------|
| Runtime dependencies | 3 (Java, Node, React) | **2** (Kotlin, React) |
| Build systems | 3 (Gradle, Vite, npm) | **2** (Gradle, Vite) |
| Total LOC | ~45K | **~30K** |
| Cold start time | ~4-5s | **<2s** |
| Largest file (LOC) | 984 | **<400** |
| Theme fidelity | VS Code-ish | **IDE-synced** |
| Window callbacks | 40+ | **0** (Zustand) |

---

## 8. Current Codebase Snapshot (for reference)

### Pain Points Identified

1. **App.tsx is a god component** (916 LOC, 39 hook deps)
2. **ClaudeChatWindow.java** (876 LOC, 106 methods)
3. **ClaudeSession.java** (785 LOC, 71 methods)
4. **16 message handlers**, several 400+ LOC
5. **3 build systems** (Gradle, Vite, npm)
6. **40+ window.* callbacks** (imperative, not React-idiomatic)
7. **5+ config sources** with no unified layer
8. **Charset bugs** in 5 files using platform default
9. **Duplicated CWD logic** in 2 files
10. **Ant Design dependency** for 1 Switch component

### What's Well-Designed (Keep)

- Bridge protocol concept (clean, minimal) — just port to Kotlin in-process
- plugin.xml extension points
- Gradle build orchestration
- Session epoch isolation (reference identity guards)
- Permission flow (three-way coordination)
- Documentation (CODEBASE_MAP.md, DESIGN.md, CLAUDE.md)
