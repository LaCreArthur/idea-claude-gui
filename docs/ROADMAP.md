# Simplification Roadmap

**Updated:** 2026-03-25
**Status:** Phase 1 complete, Phase 2 in progress

## North Star

**Kotlin everywhere, JCEF only for chat rendering, native UI for everything else.**

A single-language (Kotlin) plugin with a minimal render surface (vanilla HTML/JS in one JCEF panel) that a solo developer can ship features to in an afternoon. Zero npm, zero React, zero Node.js.

## Decisions

- **Auth:** OAuth token (Claude Max / Copilot Pro) + API key. 5-tier resolution.
- **Platform floor:** Raise to IntelliJ 2025.x (modern JCEF Chromium: CSS nesting, `:has()`)
- **UI runtime:** Single JCEF panel with vanilla HTML + marked.js + highlight.js. No React, no framework.
- **State management:** Kotlin owns all state. HTML surface is a dumb renderer. No Zustand, no window.* callback soup.
- **Settings/dialogs:** Kotlin UI DSL + `DialogWrapper`. Not in the webview.
- **Ship cadence:** Incremental. Each phase ships independently.

---

## Tech Stack: Current → Target

| Layer | Current | Target | Rationale |
|-------|---------|--------|-----------|
| Plugin language | Java (~18K LOC) + Kotlin (~2K LOC) | **100% Kotlin** | One language, null safety, coroutines, data classes |
| API client | Kotlin `AgentRuntime` → Anthropic SDK | **Same** (already done) | Direct SDK, no subprocess |
| UI runtime | JCEF + React 19 + Vite | **JCEF + vanilla HTML/JS/CSS** | No framework, no bundler, no npm |
| Markdown | react-markdown + rehype | **marked.js + highlight.js** (~30KB each) | Zero deps, comparable quality |
| CSS | Less + 150 CSS variables | **CSS variables only** (injected from Kotlin `UIManager`) | Native theme sync, no build step |
| Settings UI | React components in webview | **Kotlin UI DSL + DialogWrapper** | True native, zero bridge messages |
| Build | Gradle + Vite + npm (vestigial) | **Gradle only** | npm gone, Vite gone, HTML bundled as resources |
| Concurrency | CompletableFuture + EDT | **Kotlin Coroutines** (already in agent) | Structured concurrency, cancellation |

### Why NOT Compose for Desktop / Full Swing

JCEF markdown/code rendering is too strong. Compose for Desktop markdown is immature. A pure Swing chat UI (`JTextPane` + `EditorTextField` in `JBList`) has documented focus, sizing, and performance problems — no production AI plugin ships a rich chat this way. JetBrains AI Assistant and Continue.dev both use JCEF for their chat panels.

### Why NOT Keep React

React is overkill for what the chat UI actually does: append HTML to a scrollable div, render markdown strings, handle button clicks. `marked.js` + vanilla JS event delegation handles all of it. React costs npm + Vite + node_modules + 40+ window.* callbacks + 11 hooks + a 916-LOC god component. Not worth it.

---

## Phased Roadmap

### Phase 1: Kill Node.js Bridge ✅ Done (2026-03-24)

- Deleted `ai-bridge/` directory (~2,450 LOC JS)
- Deleted 21 Java bridge/dependency classes (~6,200 LOC)
- Built Kotlin agent runtime: `AgentRuntime`, `AuthProvider`, `StreamEmitter`, `PermissionGate`, `ToolRegistry`
- Fixed 3 blocking bugs (Gson/Jackson boundary, DependencyHandler JSON shape, OAuth beta header)
- Hardened OAuth token refresh with dual endpoints + Keychain persistence
- Plumbed 1M context support (UI toggle pending)
- Net deletion: ~8,500 LOC

### Phase 2: Dead Code Cleanup ← Current

- Delete zombie `ClaudeSDKBridge` (199 LOC stub)
- Delete `DependencyHandler`, `RewindHandler` (no-op stubs)
- Remove dependency/Node.js UI from React frontend
- Remove `currentSdkInstalled` gate that blocks sends
- Collapse bridge indirection out of `HandlerContext`

### Phase 3: Ship & Verify

- 1M context UI toggle (all plumbing done, just needs frontend switch)
- Full E2E round-trip verification in Rider (auth works, UI not confirmed)
- Bump version, tag release

### Phase 4: Java → Kotlin Conversion

- Incremental, file-by-file, as files are touched for features/fixes
- Auto-converter handles ~80% of boring files (DTOs, utilities, small handlers)
- Save `ClaudeSession` and `ClaudeChatWindow` for last (hardest, most fragile)
- Target: 100% Kotlin for all plugin logic

### Phase 5: React → Vanilla Frontend

- Replace React + Vite with single HTML + vanilla TS + CSS (bundled as Gradle resources)
- Markdown: `marked.js` + `highlight.js` (no react-markdown)
- Streaming: `browser.executeJavaScript("appendDelta('...')")` — simpler than current React path
- Interactivity: <1KB vanilla JS (copy buttons, collapse tool blocks, permission dialogs)
- Theme sync: inject `UIManager` colors as CSS variables from Kotlin
- Kill npm, Vite, node_modules, package.json entirely
- Settings/permissions move to Kotlin UI DSL + `DialogWrapper`

### Phase 6: Polish

- Break up god classes (`ClaudeSession` 838 LOC, `ClaudeChatWindow` 756 LOC)
- Unified config layer across 5+ config sources
- Accessibility pass (ARIA labels, keyboard nav, focus management)
- UTF-8 enforcement in 5 remaining legacy files

---

## Architecture Target

```
Kotlin (agent runtime + handlers + IDE integration)
  ↕ browser.executeJavaScript() / bridge callbacks
Single JCEF panel (vanilla HTML + marked.js + highlight.js + CSS variables)
```

- One language (Kotlin) for all logic
- One dumb render surface (HTML/JS/CSS, no framework, no build step)
- Zero npm, zero Node, zero React
- Gradle is the only build system

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| marked.js quality < react-markdown | Low | Medium | Test on real conversations before committing to migration |
| Java→Kotlin auto-converter edge cases | Medium | Low | Convert incrementally, test each file |
| JCEF theme sync imperfect on custom themes | Low | Medium | Fallback palette if UIManager colors null |
| React→vanilla migration breaks streaming | Low | High | Benchmark time-to-first-token before/after |

---

## Success Metrics

| Metric | Started | After Phase 1 | Target (Phase 5+) |
|--------|---------|---------------|-------------------|
| Runtime deps | 3 (Java, Node, React) | **2** (Kotlin, React) | **1** (Kotlin + HTML) |
| Build systems | 3 (Gradle, Vite, npm) | **2** (Gradle, Vite) | **1** (Gradle) |
| Total LOC | ~45K | ~35K | ~25K |
| Languages | 3 (Java, TS, JS) | 3 (Java, Kotlin, TS) | **1+HTML** (Kotlin) |
| Cold start | ~4-5s | ~2-3s | <2s |
| Window callbacks | 40+ | 40+ | **0** |
| Largest file | 984 | 838 | <400 |
