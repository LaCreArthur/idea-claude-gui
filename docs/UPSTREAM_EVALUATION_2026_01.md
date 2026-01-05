# Upstream Feature Evaluation - January 2026

> Analysis of upstream commits from December 2025 to January 2026

**Evaluation Date**: January 5, 2026  
**Fork Version**: v0.2.1  
**Upstream Version**: v0.1.4  
**Upstream Repository**: [zhukunpenglinyutong/idea-claude-code-gui](https://github.com/zhukunpenglinyutong/idea-claude-code-gui)

---

## Executive Summary

Evaluated 28 upstream commits from December 2025 - January 2026. Identified **3 high-value features** for adoption in v0.3.0:

1. ✅ **ACCEPT_EDITS Permission Mode** - Auto-approve file editing tools
2. ✅ **IDE Language Detection** - Auto-select UI locale from IDEA settings  
3. ✅ **macOS Keychain Support** - Secure credential storage on macOS

These features align with fork's strategy: enhance UX, maintain quality standards, and serve user needs.

---

## Feature Analysis

### 1. ACCEPT_EDITS Permission Mode ⭐⭐⭐ HIGH VALUE

**Upstream Commit**: `ca73535` (Jan 5, 2026)  
**Status**: Not in fork  
**Recommendation**: **ADOPT**

#### What It Does
- Adds ACCEPT_EDITS permission mode for auto-approving file editing tools
- Users can enable a mode that auto-approves `write_to_file`, `str_replace_in_file`, etc.
- Implements PreToolUse hook for unified permission handling across message services
- Includes dialog concurrency fixes with queue mechanism

#### Why It Fits Fork
- High user demand - reduces friction during coding sessions
- Fork already has `PermissionMode` enum (DEFAULT, ALLOW_ALL, DENY_ALL)
- ACCEPT_EDITS adds valuable granularity between DEFAULT and ALLOW_ALL
- Concurrency fixes improve stability

#### Implementation Approach
1. Add `ACCEPT_EDITS` to `PermissionManager.PermissionMode` enum
2. Implement PreToolUse hook in `message-service.js`
3. Add queue mechanism for dialog concurrency (prevents multiple dialogs)
4. Update permission dialog UI to show new mode
5. Add tests for concurrent permission requests
6. Update i18n strings across all 6 locales

#### Estimated Effort
2-3 days

---

### 2. IDE Language Detection ⭐⭐⭐ HIGH VALUE

**Upstream Commit**: `d692a81` (Jan 4, 2026)  
**Status**: Not in fork  
**Recommendation**: **ADOPT**

#### What It Does
- Reads IntelliJ IDEA's language setting to auto-select UI locale
- Adds `LanguageConfigService.java` for language detection
- Sends detected language to webview on initialization
- Falls back to browser/system language if detection fails

#### Why It Fits Fork
- **Perfect alignment** with fork's English localization focus
- Fork already supports 6 locales (en, es, fr, hi, ja, zh, zh-TW)
- Users shouldn't need to manually set language - IDE knows it already
- Small, non-invasive change

#### Implementation Approach
1. Add `LanguageConfigService.java` to read IDEA's `Registry.get("ide.i18n.locale")`
2. Add message handler to send language code to webview on startup
3. Update `main.tsx` to receive language setting and initialize i18n
4. Test with different IDEA language settings (English, Spanish, Japanese, etc.)
5. Update documentation

#### Estimated Effort
1 day

---

### 3. macOS Keychain Support ⭐⭐ MEDIUM VALUE

**Upstream Commit**: `a7735fd` (Jan 5, 2026)  
**Status**: Not in fork  
**Recommendation**: **ADOPT**

#### What It Does
- Detects macOS and reads Claude CLI credentials from system Keychain
- Uses `security find-generic-password` command
- Supports multiple Keychain service names (`claude-desktop`, `claude-code`)
- Falls back to file-based credentials (`~/.claude/.credentials.json`) if Keychain fails
- Updates credential source display to show "Keychain" on macOS

#### Why It Fits Fork
- Enhances fork's CLI session authentication feature
- Improves security on macOS (Keychain vs plain JSON file)
- Non-breaking change with fallback
- Platform-specific but safe (other platforms unaffected)

#### Implementation Approach
1. Add platform detection to `api-config.js` (`process.platform === 'darwin'`)
2. Add `readKeychainCredentials()` function using `child_process.execSync`
3. Try Keychain first, fallback to file-based credentials
4. Update credential source message
5. Test on macOS, Linux, Windows to ensure no regressions

#### Estimated Effort
1 day

---

### 4. Concurrency Fixes ⭐⭐⭐ HIGH VALUE (Bundled)

**Upstream Commits**: `fac0bff`, `ca73535` (Jan 5, 2026)  
**Status**: Not in fork  
**Recommendation**: **ADOPT (with ACCEPT_EDITS)**

#### What It Does
- Replaces `SwingUtilities.invokeLater` with `Alarm` for thread-safe delayed execution
- Adds file existence checks in `PermissionService` to prevent race conditions
- Queue mechanism for permission and question dialogs
- Downgrades non-critical errors to warnings with proper logging
- Properly disposes `refreshAlarm` resource in cleanup

#### Why It Fits Fork
- Fixes real concurrency bugs in permission handling
- Non-breaking changes
- Improves reliability under load (rapid permission requests)

#### Implementation Approach
- Bundled with ACCEPT_EDITS implementation
- Update `SlashCommandCache.java` to use `Alarm`
- Add file existence checks in `PermissionService.java`
- Test with rapid-fire permission requests

---

## Features Deferred

### Slash Commands Enhancements ⭐ LOW VALUE

**Upstream Commit**: `94b6686` (Jan 2, 2026)  
**Status**: Deferred

#### Why Not Adopted
- Fork already supports slash commands via MCP server integration
- Built-in `/init` and `/review` commands may conflict with user MCP servers
- Users can add custom slash commands via MCP
- Low user demand for these specific commands
- Better to focus on higher-value features

**Decision**: Skip for now, revisit if users specifically request.

---

### Node.js Auto-detection

**Upstream Commit**: `d1a7903` (Jan 4, 2026)  
**Status**: Already in fork ✅

Fork already has:
- `NodeDetector.java` with `detectNodeWithDetails()`
- Auto-detection on first run
- Persistent storage of Node.js path

**Decision**: No action needed.

---

## Implementation Plan

### Phase 1: IDE Language Detection (Quick Win)
**Target**: Week 1  
**Effort**: 1 day

**Tasks**:
- [ ] Add `LanguageConfigService.java`
- [ ] Add `get_ide_language` message handler
- [ ] Update `main.tsx` initialization
- [ ] Test with different IDEA languages
- [ ] Update CHANGELOG.md

**Testing**:
- Manual test: Set IDEA to Spanish → verify UI shows Spanish
- Manual test: Set IDEA to Japanese → verify UI shows Japanese
- Manual test: Set IDEA to unsupported language → verify fallback to English

---

### Phase 2: ACCEPT_EDITS Mode + Concurrency Fixes
**Target**: Week 2-3  
**Effort**: 2-3 days

**Tasks**:
- [ ] Add `ACCEPT_EDITS` to `PermissionMode` enum
- [ ] Implement PreToolUse hook in `message-service.js`
- [ ] Add dialog queue mechanism
- [ ] Update `PermissionManager.java` to handle ACCEPT_EDITS
- [ ] Add Alarm usage in `SlashCommandCache.java`
- [ ] Add file existence checks in `PermissionService.java`
- [ ] Update permission dialog UI
- [ ] Add i18n strings (6 locales)
- [ ] Write tests for concurrent requests
- [ ] Update CHANGELOG.md

**Testing**:
- Unit test: Queue mechanism handles multiple concurrent requests
- Manual test: Enable ACCEPT_EDITS → verify file edits auto-approved
- Manual test: Rapid permission requests → verify no dialog overlap
- Integration test: Run full coding session with ACCEPT_EDITS enabled

---

### Phase 3: macOS Keychain Support
**Target**: Week 3  
**Effort**: 1 day

**Tasks**:
- [ ] Add platform detection to `api-config.js`
- [ ] Implement `readKeychainCredentials()`
- [ ] Update credential source display
- [ ] Test on macOS (with/without Keychain credentials)
- [ ] Test on Linux and Windows (verify no regression)
- [ ] Update CHANGELOG.md

**Testing**:
- Manual test (macOS): Verify Keychain credentials detected
- Manual test (macOS): Remove Keychain entry → verify file fallback
- Manual test (Linux): Verify file-based credentials still work
- Manual test (Windows): Verify file-based credentials still work

---

## Version Planning

**Target Release**: v0.3.0

**Rationale**:
- v0.2.x is for bug fixes and stability per version strategy
- These are new features, warrant minor version bump
- Aligns with fork's user-driven roadmap

**Release Timeline**:
- Week 1: IDE Language Detection
- Week 2-3: ACCEPT_EDITS + Concurrency
- Week 3: macOS Keychain
- Week 4: Testing, documentation, release

---

## Documentation Updates

Files to update:
- [x] `docs/UPSTREAM_EVALUATION_2026_01.md` (this file)
- [ ] `docs/FORK_STRATEGY.md` - add reference to this evaluation
- [ ] `CHANGELOG.md` - document features in v0.3.0 section
- [ ] `README.md` - update feature list if needed
- [ ] `DEVLOG.md` - add entry after implementation

---

## Testing Strategy

### For Each Feature

**Unit Tests** (where applicable):
- Java: JUnit 5 tests in `src/test/java/`
- TypeScript: Vitest tests in `webview/src/test/`
- Node.js: Vitest tests in `ai-bridge/`

**Manual Testing**:
- Cross-platform (macOS, Linux, Windows)
- Cross-language (en, es, ja at minimum)
- Integration with existing features

**Regression Testing**:
- Run full test suite: `./scripts/test-all.sh`
- Manual smoke test of key workflows
- Verify no breaking changes

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking existing functionality | High | Comprehensive testing, feature flags if needed |
| Concurrency bugs | Medium | Extensive testing with rapid requests, queue mechanism |
| Platform-specific issues (Keychain) | Low | Fallback to file-based, test on all platforms |
| i18n string errors | Low | Review all 6 locale files, test with native speakers if possible |

---

## Success Criteria

✅ **Quality Bar Met**:
- All features have tests
- English comments and documentation
- No regressions in existing functionality

✅ **User Value Delivered**:
- ACCEPT_EDITS reduces permission fatigue
- IDE Language Detection improves first-run experience
- macOS Keychain improves security

✅ **Fork Standards Maintained**:
- Follows fork's coding standards
- i18n across all 6 locales
- Documentation updated

---

## Upstream Monitoring

**Next Evaluation**: February 2026 or when planning v0.4.0

**Watch For**:
- New security fixes
- Performance improvements
- Additional permission modes
- MCP enhancements

---

## Appendix: Upstream Commits Analyzed

Analyzed 28 commits from `e719fdb` (Jan 5, 2026) back to December 2025:

**Adopted**:
- `ca73535` - ACCEPT_EDITS mode + concurrency fixes
- `a7735fd` - macOS Keychain support  
- `d692a81` - IDE language detection
- `fac0bff` - Additional concurrency fixes

**Deferred**:
- `94b6686` - Slash commands (/init, /review)

**Already in Fork**:
- `d1a7903` - Node.js auto-detection

**Not Applicable**:
- Various Chinese-language fixes (fork is English-first)
- UI styling tweaks (fork has custom styles)
- Bedrock SDK features (fork removed Bedrock in v0.2.1)

---

*This evaluation follows the AI Cherry-Pick Process outlined in [FORK_STRATEGY.md](FORK_STRATEGY.md).*

*Evaluation completed: January 5, 2026*
