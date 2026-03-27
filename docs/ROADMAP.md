# Roadmap

**Updated:** 2026-03-25

## Architecture

The plugin embeds the `claude` CLI in a TerminalView widget (2025.3 Reworked Terminal API). The CLI is the engine — we build IDE-native UX on top by reading output and injecting responses.

```
TerminalView (renders CLI)
  ↓ outputModels.regular.addListener()
CliOutputParser (detects patterns)
  ↓ callback
Native Swing UI (dialogs, popups)
  ↓ escape sequences / sendText
Terminal (sends answer to CLI)
```

## Phase 1: Core Terminal Wrapper ✅ DONE

- [x] TerminalView embedding (detached from Terminal tool window)
- [x] Input bar with Cmd+Enter send
- [x] Auto-restart on claude exit
- [x] Status indicator (Generating.../Ready)
- [x] Send Selection action (Cmd+Alt+K → editor selection to input bar)
- [x] Slash command autocomplete popup (built-in + user skills)
- [x] Output listener wired via TerminalView API

## Phase 2: Interactive Prompt Detection ← CURRENT

- [x] AskUserQuestion detection (☐ pattern → native dialog → answer sent back)
- [ ] Permission prompt detection (? Allow... → approve/deny dialog)
- [ ] Plan approval detection (plan mode → review/approve dialog)
- [ ] Tool confirmation patterns
- [ ] Refine AskUserQuestion: handle edge cases, free-text input, multi-line questions

## Phase 3: Session & Navigation

- [ ] Multi-tab chat (multiple Claude terminal instances in tool window)
- [ ] Session history sidebar (read ~/.claude/ history → list with resume)
- [ ] Session favorites / custom titles
- [ ] Export session to markdown
- [ ] Prompt history (up/down in input bar)

## Phase 4: Deep IDE Integration

- [ ] File change notifications (detect file writes → show diff in editor)
- [ ] Clickable file paths in terminal → open in editor (terminal link handler)
- [ ] Inject build errors / lint warnings as context
- [ ] Gutter action: "Fix with Claude" on errors
- [ ] `@file` autocomplete in input bar (project file index)
- [ ] Rewind detection + native UI

## Phase 5: Polish & Power Features

- [ ] Toolbar (new session, model selector, settings)
- [ ] Theme-aware styling for dialogs
- [ ] Sound notification on task completion (window unfocused)
- [ ] Keyboard shortcuts: Escape → return to editor, Cmd+Shift+C → focus Claude
- [ ] Status bar widget (session state, model info)
- [ ] Inline editor inlays for Claude suggestions

## Principles

- **Each feature = detect pattern + show native UI + send response.** Same architecture for everything.
- **Minimize code.** The terminal does the heavy lifting. We add what the terminal can't.
- **No new languages.** Kotlin + Swing only. No npm, no JCEF, no React.
- **Ship incrementally.** Each phase is independently useful.
