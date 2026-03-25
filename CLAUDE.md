# CLAUDE.md

## Project: idea-claude-gui

JetBrains plugin that embeds the `claude` CLI in a TerminalView widget with native IDE UX layered on top. Full Sonnet 4.6 / Opus 4.6 access via Max/Pro subscription — no API key needed.

## Architecture

```
src/main/kotlin/com/github/claudecodegui/
├── ClaudeToolWindowFactory.kt   # ClaudePanel: terminal + input bar + output wiring (258 LOC)
├── CliOutputParser.kt           # Output pattern detection + AskUserQuestion dialog (204 LOC)
├── SendSelectionAction.kt       # Cmd+Alt+K: editor selection → input bar (41 LOC)
├── SlashCommandCompletion.kt    # Slash command autocomplete popup (160 LOC)
├── SlashCommandRenderer.kt      # Popup cell renderer (32 LOC)
src/main/resources/
├── META-INF/plugin.xml          # Plugin manifest
├── icons/                       # SVG/PNG icons
```

**Total: 695 LOC Kotlin. No Java, no TypeScript, no npm.**

### How It Works

1. Tool window "Claude" embeds a `TerminalView` (2025.3 Reworked Terminal API) running `claude` interactively
2. Input bar (bottom) lets users compose prompts with Cmd+Enter to send
3. Output listener reads all terminal output via `outputModels.regular.addListener()`
4. `CliOutputParser` detects interactive prompts (AskUserQuestion `☐` pattern) → shows native Swing dialog → sends answer back via escape sequences
5. The CLI handles everything: auth, streaming, tools, permissions, CLAUDE.md

### Key API (TerminalView, 2025.3)

```kotlin
// Create detached terminal (not in Terminal tool window)
val tab = TerminalToolWindowTabsManager.getInstance(project)
    .createTabBuilder()
    .shouldAddToToolWindow(false)  // @Internal but Agent Workbench uses it
    .deferSessionStartUntilUiShown(true)
    .createTab()

// Send text
tab.view.createSendTextBuilder().shouldExecute().send(text)

// Read output (THE BIG UNLOCK)
tab.view.outputModels.regular.addListener(disposable, listener)

// Session lifecycle
tab.view.sessionState  // StateFlow<NotStarted | Running | Terminated>
```

**Do NOT use `useBracketedPasteMode()`** — injects text but doesn't submit.

### Output → Native UI Pattern (proven)

```
Terminal output → CliOutputParser.feed(text)
    ↓ detects ☐ ... ──── pattern
AskUserQuestionDialog (native DialogWrapper)
    ↓ user picks option
Escape sequences sent back: \u001b[B (down) + \r (enter)
    ↓
CLI receives the answer
```

This same pattern applies to permissions, plan approval, and any interactive prompt.

## Commands

```bash
./gradlew clean buildPlugin      # Build plugin ZIP (build/distributions/)
./gradlew compileKotlin          # Quick compile check
./gradlew clean runIde           # Debug in sandbox IDEA
```

### Install in Rider

```bash
./gradlew clean buildPlugin && \
rm -rf "$HOME/Library/Application Support/JetBrains/Rider2025.3/plugins/idea-claude-gui" && \
unzip -oq build/distributions/idea-claude-gui-*.zip \
  -d "$HOME/Library/Application Support/JetBrains/Rider2025.3/plugins/" && \
pkill -f Rider && sleep 2 && open -a Rider
```

## Key Decisions

- **Embedded terminal, not custom renderer**: The CLI handles all rendering (ANSI, markdown, tool cards). We add UX on top.
- **CLI subprocess, not direct SDK**: OAuth + SDK = Haiku only. CLI = all Max models.
- **Output parsing, not NDJSON**: We read the rendered terminal output and detect patterns. No `--output-format stream-json` needed.
- **No React/npm/JCEF**: Pure Kotlin + Swing. Gradle is the only build system.
- **Native dialogs over terminal prompts**: Detect interactive CLI prompts → show IntelliJ DialogWrapper → send answer back. Best of both worlds.

## Code Style

- Kotlin only (no Java)
- English comments and strings
- Minimize code — the terminal does the heavy lifting
- Each new feature = detect output pattern + show native UI + send response

## Release Checklist

1. Update version in `build.gradle`
2. Update `CHANGELOG.md` with release notes (format: `##### **vX.Y.Z** (YYYY-MM-DD)`)
3. Commit: `chore: Bump version to X.Y.Z`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. CI builds and publishes to JetBrains Marketplace on version tags
