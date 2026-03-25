# Design Philosophy

## Goal

**Be as close as possible to the Claude Code CLI experience, with a GUI layer on top.**

This plugin aims to bring the full power of Claude Code into JetBrains IDEs while maintaining the same behavior, reliability, and user experience that developers expect from the CLI.

## Guiding Principles

### 1. CLI Parity First
- Every feature should work exactly like the CLI
- If the CLI waits indefinitely for user input, so do we
- If the CLI auto-approves certain tools, so do we
- Error messages and diagnostics should match CLI format

### 2. GUI as Enhancement, Not Replacement
- The GUI should make Claude Code more accessible, not change its behavior
- Visual elements should enhance understanding (diffs, file trees, etc.)
- Never add friction that doesn't exist in the CLI

### 3. Single-Language Simplicity
- Kotlin for all plugin logic (agent runtime, handlers, IDE integration)
- HTML surface is a dumb renderer — Kotlin owns all state
- No framework tax: vanilla HTML/JS/CSS in one JCEF panel
- Settings and dialogs use Kotlin UI DSL + `DialogWrapper` (native)

### 4. Clean and Simple UI
- Follow VS Code's official Claude extension as a reference for clean design
- Permission dialogs should be readable and actionable
- Show relevant information prominently, hide noise

## Architecture Boundary

```
Kotlin (all logic)
  ↕ executeJavaScript / bridge callbacks
Single JCEF panel (vanilla HTML + marked.js + highlight.js)
```

**Why JCEF for chat:** Rich markdown rendering (headers, tables, nested code blocks with syntax highlighting), streaming text appends, collapsible tool-use blocks, and inline permission dialogs. This is the same approach JetBrains AI Assistant and Continue.dev use — it's the 2026 production standard for AI chat in IDEs.

**Why NOT full Swing:** `JTextPane` + `EditorTextField` in `JBList` for hundreds of messages has documented focus, sizing, and performance problems. No production AI plugin ships a rich chat UI this way.

**Why NOT React:** Overkill for append-to-div + render-markdown + handle-clicks. The framework tax (npm, Vite, node_modules, 40+ window callbacks, 11 hooks) isn't justified.

## Reference Design

The VS Code Claude extension provides the benchmark for what a good GUI layer looks like:
- Clean permission dialogs with clear file names
- Readable diffs when needed
- Simple Allow/Deny/Always actions
- No unnecessary clutter

## Anti-Patterns to Avoid

1. **Arbitrary timeouts** — If the CLI doesn't timeout, neither should we
2. **Overly complex dialogs** — Keep it simple like VS Code
3. **Hidden information** — File paths, tool names should be visible
4. **Behavior divergence** — Don't "improve" on CLI behavior without good reason
5. **Framework tax** — Don't add build dependencies for things vanilla JS handles
6. **Two-language features** — New features should be one Kotlin file + maybe a JS snippet, not touch 11 files across 3 languages
