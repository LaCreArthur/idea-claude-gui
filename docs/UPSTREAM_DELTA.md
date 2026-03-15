# Upstream Delta Analysis

**Upstream:** [zhukunpenglinyutong/idea-claude-code-gui](https://github.com/zhukunpenglinyutong/idea-claude-code-gui)
**Fork diverged:** January 2026
**Analysis date:** 2026-03-15
**Upstream versions analyzed:** v0.2.3 through v0.2.9 + open PRs

## Ported Features

| # | Feature | Source | Our Implementation |
|---|---------|--------|--------------------|
| 1 | Zombie process fix | PR #634, v0.2.7 | `ProcessManager.java`, `PlatformUtils.terminateProcess()` (SIGTERM → 3s → SIGKILL) |
| 3 | Reasoning effort selector | PR #475 | Full-stack: `types.ts` constants → `ButtonArea.tsx` → `useChatHandlers` → `SettingsHandler` → bridge.js `thinkingBudget` |
| 4 | UTF-8 enforcement | v0.2.7 | 56 occurrences of `StandardCharsets.UTF_8` across 22 files |
| 5 | Proxy/TLS env forwarding | v0.2.8 | `EnvironmentConfigurator.java` — HTTP_PROXY, HTTPS_PROXY, NODE_TLS vars |
| 6 | Session epoch isolation | PR #611, v0.2.7 | `capturedSession` reference identity guard in `ClaudeChatWindow.setupSessionCallbacks()` — stale events silently dropped |
| 7 | Streaming race fix | PR #650, v0.2.9 | Turn ID counter in `turnIdRef`, guards all `setMessages` updaters and timeout callbacks |
| 8 | Token usage per message | PR #606 | `MessageUsage.tsx` renders `raw.message.usage` as "Xk in (Yk cached) / Zk out" below each assistant message |
| 9 | Clipboard image paste | v0.2.6 | `useAttachmentManagement.ts` + `WebViewInitializer.java` |
| 10 | Sound notification | v0.2.6 | Web Audio API beep, `localStorage` toggle, settings UI |
| 11 | Daemon mode | v0.2.3 | `DaemonConnection.java`, `bridge.js --daemon`, pre-warm on tab creation. One-shot fallback deleted — daemon-only. |
| 12 | Enterprise apiKeyHelper auth | PR #623 | First check in `setupAuthentication()`, 10s timeout, silent fallthrough |

## Not Ported

### 2. CWD Fallback Fix (PR #636)
Crash when a non-project file (e.g. `~/.claude/plans/*.md`) is open in the editor. `SessionHandler.determineWorkingDirectory()` incorrectly uses external file's parent as cwd.
- **Effort:** Low
- **Mitigated by:** `WorkingDirectoryManager` validates paths, but no explicit external-file guard

### 13. Tab Detach to Floating Window (v0.2.5)
Detach chat tabs into independent floating JFrame windows for multi-monitor workflows.
- **Effort:** High — significant Java UI work

## Skipped (Not Relevant)

- All Codex/OpenAI/multi-provider changes
- i18n additions (we stripped i18n)
- "Codemoss" prompt management (we use CLAUDE.md)
- AWS Bedrock support (PR #558)
- File structure refactoring (our architecture already diverged)
- WeChat QR codes, sponsor sections, subscription tutorials
