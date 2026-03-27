# Design: Claude GUI for JetBrains

## Vision

The best way to use Claude Code is inside your IDE — not in a separate terminal. We embed the full `claude` CLI in a JetBrains tool window and layer native IDE UX on top: dialogs for interactive prompts, editor integration for context injection, and keyboard shortcuts that feel native.

Full Sonnet 4.6 / Opus 4.6 access via Max/Pro subscription. No API keys. No reimplementation.

## Core Insight

The `claude` CLI is a complete agent: auth, tools, permissions, streaming, CLAUDE.md, MCP servers. We don't fight it — we **instrument** it. The TerminalView API (2025.3) gives us:

1. **Full rendering** — the CLI handles ANSI, markdown, tool cards, streaming
2. **Output reading** — `outputModels.regular.addListener()` lets us see everything
3. **Input injection** — `createSendTextBuilder().shouldExecute().send()` for prompts, raw escape sequences for interactive menus

This means we can **detect** any CLI pattern and **respond** programmatically, while the terminal shows the full CLI experience.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Tool Window (right sidebar)         │
│  ┌───────────────────────────────────────┐  │
│  │  TerminalView                         │  │
│  │  - Full claude CLI rendering          │  │
│  │  - ANSI colors, streaming, tool cards │  │
│  │  - Output listener → CliOutputParser  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Input Bar (JTextArea)                │  │
│  │  [/ autocomplete] [Send ⏎] [Status]  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │ output listener (read)
         ▼
┌─────────────────────────────────────────────┐
│  CliOutputParser                            │
│  Detects: ☐ AskUserQuestion                │
│           ? Permission prompts              │
│           Plan approval                     │
│           Spinner/status patterns            │
│  → Shows native IntelliJ dialogs            │
│  → Sends answers via escape sequences       │
└─────────────────────────────────────────────┘
```

## What We Own vs What the CLI Owns

| Concern | Owner |
|---------|-------|
| Model access & auth | CLI (Keychain/OAuth, Max subscription) |
| Agent loop & tool execution | CLI |
| Permission management | CLI (we detect + show native dialog) |
| CLAUDE.md / system prompt | CLI |
| MCP servers | CLI |
| Streaming & rendering | CLI (ANSI terminal) |
| **Interactive prompt UX** | **Us** (detect pattern → native dialog → send answer) |
| **Prompt editing** | **Us** (input bar with slash completion) |
| **IDE context injection** | **Us** (selection, errors → input bar) |
| **Session management** | **Us** (tabs, history sidebar, auto-restart) |
| **Keyboard shortcuts** | **Us** (Cmd+Alt+K, Escape, Cmd+Enter) |

## The Output → Dialog Pattern

Every IDE-native feature follows the same pattern:

```
1. CLI renders interactive prompt in terminal
2. Output listener feeds text to CliOutputParser
3. Parser detects pattern (regex on stripped ANSI)
4. Parser fires callback with parsed data
5. Swing dialog shown on EDT
6. User responds in native UI
7. Answer sent back to terminal (escape sequences or text)
```

**Proven for:** AskUserQuestion (☐ → numbered options → dialog → arrow keys + enter)
**Next:** Permission prompts, plan approval, tool confirmation

## Anti-Patterns

1. **Don't reimplement the agent loop** — the CLI is the engine
2. **Don't parse NDJSON** — we read rendered terminal output, not structured events
3. **Don't use JCEF/React/npm** — pure Kotlin + Swing, terminal handles rendering
4. **Don't intercept tool execution** — we can't and don't need to
5. **Don't add API key auth** — this is Max-subscription-only via CLI
6. **Don't use `useBracketedPasteMode()`** — it doesn't submit to the CLI
7. **Don't use `dispatchEvent(KeyEvent)` for terminal input** — synthetic Swing events don't reach the PTY; use escape sequences via `send()`

## Success Metrics

| Metric | Old Plugin (v0.2) | New Plugin (v0.3) |
|--------|-------------------|-------------------|
| Total LOC | ~5,000+ (Java+Kotlin+TypeScript+CSS) | 695 (Kotlin only) |
| Languages | 4 | 1 |
| Build systems | 2 (Gradle + npm/Vite) | 1 (Gradle) |
| Runtime deps | React, marked.js, JCEF | None (CLI is external) |
| Auth code | 460 LOC | 0 (CLI handles it) |
| Models available | Haiku only (SDK) → All (CLI) | All Max models |
| Interactive prompts | Broken (no output access) | Working (TerminalView output listener) |
| Files | ~50 | 5 |
