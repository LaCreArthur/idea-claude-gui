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

### 3. Clean and Simple UI
- Follow VS Code's official Claude extension as a reference for clean design
- Permission dialogs should be readable and actionable
- Show relevant information prominently, hide noise

## Reference Design

The VS Code Claude extension provides the benchmark for what a good GUI layer looks like:
- Clean permission dialogs with clear file names
- Readable diffs when needed
- Simple Allow/Deny/Always actions
- No unnecessary clutter

Screenshots of reference designs should be placed in `docs/screenshots/reference/`.

## Anti-Patterns to Avoid

1. **Arbitrary timeouts** - If the CLI doesn't timeout, neither should we
2. **Overly complex dialogs** - Keep it simple like VS Code
3. **Hidden information** - File paths, tool names should be visible
4. **Behavior divergence** - Don't "improve" on CLI behavior without good reason
