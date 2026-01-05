# Next Cherry-Pick Session - Quick Start Guide

**Created**: January 5, 2026  
**Updated**: January 5, 2026 (Session 3 Complete)  
**For**: Next agent continuing upstream synchronization  
**Context**: Sessions 2 & 3 completed - 4 high-priority commits integrated

---

## 🎯 Quick Summary

**Current State**: Successfully cherry-picked 4 priority commits across Sessions 2 & 3:
- ✅ Session 2: 3 bug fixes (concurrency, Windows crash, Node.js auto-detection)
- ✅ Session 3: 1 i18n enhancement (d35df2d - UI text improvements)

**Your Mission**: Cherry-pick remaining priority commit 32a7ae4 (MCP/Skills i18n completeness) OR evaluate and cherry-pick other valuable upstream features.

---

## 📊 What Was Accomplished

### Session 2: Bug Fixes & Stability Improvements

| Commit | Description | Conflicts | Status |
|--------|-------------|-----------|--------|
| `fac0bff` | Concurrency fixes | 1 file | ✅ Done (18ad2be) |
| `e397cad` | Windows crash fix | 3 files | ✅ Done (d091c54) |
| `d1a7903` | Node.js auto-detection | None | ✅ Done (cf4f551) |

**Key Changes**: Thread-safe execution, ErrorBoundary, file race condition fixes, Node.js auto-detection

### Session 3: i18n Enhancement (d35df2d)

| Commit | Description | Conflicts | Status |
|--------|-------------|-----------|--------|
| `d35df2d` | i18n enhancements | 14 files | ✅ Done (dd7957b) |

**Key Changes**: 
- Replaced hardcoded English strings with i18n t() calls in 9 React components
- Added 19 new i18n keys (UI elements, permissions, toast messages)
- Updated all 7 locale files (en, es, fr, hi, ja, zh, zh-TW)
- Restored ja.json locale file

**Conflicts Resolution Pattern**:
- TypeScript: Accepted upstream i18n structure (t() calls over hardcoded strings)
- Locales: Merged fork's existing translations with upstream's new keys
- Maintained English comments throughout (fork standard)

---

## 🔜 What's Next (Your Task)

### Priority Option 1: Complete i18n Series

**Commit 5: 32a7ae4 - MCP/Skills i18n completeness**

**Description**: Complete i18n support for MCP and Skills help dialogs + usage statistics improvements  
**Estimated Conflicts**: 5-15 files (locale files + UI components)  
**Priority**: Medium (translation completeness, UX improvement)  
**Dependencies**: Follows d35df2d (completed in Session 3)

**Files Expected to Conflict**:
```
Java files (2):
- ClaudeHistoryReader.java (token overflow fix: int → long)
- SettingsHandler.java

React/TypeScript (5):
- UsageStatisticsSection.tsx (scrollable chart view)
- McpHelpDialog.tsx (i18n completion)
- McpServerDialog.tsx (i18n completion)
- SkillHelpDialog.tsx (i18n completion)

Locale files (7):
- webview/src/i18n/locales/*.json (en, es, fr, hi, ja, zh, zh-TW)
- ~100+ new i18n keys for MCP and Skills dialogs

Styles (2):
- usage-chart.less
- usage.less
```

**Resolution Strategy**:
1. Java files: Accept upstream logic changes (token overflow fix)
2. TypeScript: Accept upstream i18n structure (similar to d35df2d)
3. Locale files: Merge fork's existing + upstream's new keys (same pattern as Session 3)
4. Style files: Accept upstream improvements

**Cherry-Pick Command**:
```bash
git cherry-pick 32a7ae4
```

**Expected Outcome**: Complete i18n coverage for MCP/Skills + better usage statistics display

---

### Priority Option 2: Evaluate Other Upstream Features

If 32a7ae4 is too complex or not needed, explore these valuable upstream commits:

**Recent High-Value Commits** (from `git log copilot/update-sync-log-file..upstream/main`):

1. **58417f9**: General UI improvements and i18n enhancements
2. **2c8b24f**: Improve partially localized copy & UI
3. **8d3df5b**: Adapt CLI claude code login questions
4. **0713867**: v0.1.4-beta4 official version features
5. **94b6686**: Add `/init` and `/review` slash commands + optimizations
6. **43b7631**: Agent functionality (prompt management)
7. **07a34a4**: Ask User Question feature adaptation

**Note**: Commits `d692a81` (IDE language detection), `ca73535` (ACCEPT_EDITS), and `a7735fd` (macOS Keychain) are already manually implemented in the fork - **DO NOT cherry-pick these**.

**Evaluation Approach**:
```bash
# Review a specific commit
git show <commit-hash> --stat

# Check for conflicts before cherry-picking
git show <commit-hash> -- <file-path>

# Start with smallest/cleanest commits first
```

---

## 🚀 Quick Start Instructions

### 1. Verify Environment

```bash
cd /home/runner/work/idea-claude-gui/idea-claude-gui

# Check branch - should be main or a feature branch based on latest
git branch --show-current

# Verify clean state
git status
# Expected: nothing to commit, working tree clean

# Check upstream remote
git remote -v | grep upstream
# Expected: upstream https://github.com/zhukunpenglinyutong/idea-claude-code-gui.git

# If upstream not configured:
git remote add upstream https://github.com/zhukunpenglinyutong/idea-claude-code-gui.git

# Fetch latest upstream
git fetch upstream
```

### 2. Review Current State

```bash
# See recent commits
git log --oneline -10

# Check how many commits we're behind upstream
git log --oneline HEAD..upstream/main | wc -l
# Note: Total is ~249 commits, but many are minor/already functionally equivalent

# Review what's been integrated
# Session 2: fac0bff (concurrency), e397cad (crash fix), d1a7903 (Node.js)
# Session 3: d35df2d (i18n enhancements)
```

### 3. Start Cherry-Picking

#### Option A: Cherry-pick 32a7ae4 (MCP/Skills i18n completeness)

```bash
# Start the cherry-pick
GIT_EDITOR=true git cherry-pick 32a7ae4

# Check conflicts
git status

# Expected conflicts (~15 files):
# - Java files: 2 (ClaudeHistoryReader.java, SettingsHandler.java)
# - React/TypeScript: 5 (UsageStatisticsSection, MCP/Skills dialogs)
# - Locale files: 7 (all language files)
# - Styles: 2 (usage-chart.less, usage.less)
```

**Conflict Resolution Steps** (follow Session 3 patterns):

1. **For Java files**:
   - Accept upstream logic changes (token overflow fix: int → long)
   
2. **For React/TypeScript files**:
   - Accept upstream i18n structure (t() calls)
   - Similar to d35df2d resolution

3. **For locale JSON files**:
   - Merge fork's existing translations with upstream's new keys
   - Maintain consistency across all 7 locales
   - Pattern: Keep existing + Add new keys + Translate any Chinese

4. **For style files**:
   - Accept upstream improvements

5. **Resolve and continue**:
   ```bash
   # After fixing all conflicts
   git add .
   
   # Continue cherry-pick
   git cherry-pick --continue
   ```

#### Option B: Evaluate and cherry-pick other upstream commits

```bash
# Review a specific commit before cherry-picking
git show <commit-hash> --stat

# Check what files would conflict
git show <commit-hash> | head -50

# Try cherry-pick
GIT_EDITOR=true git cherry-pick <commit-hash>

# If conflicts are too complex, abort and document
git cherry-pick --abort
```

### 4. Test After Cherry-Pick

```bash
# Build webview (if dependencies available)
cd webview && npm run build

# Check for syntax errors
npx tsc --noEmit

# Return to root
cd ..
```

### 5. Document Progress

After each successful cherry-pick, update `docs/SYNC_LOG.md`:

Add a new session entry:
```markdown
#### Session X - [Date] ([Commit Description])

**Status**: ✅ Complete  
**Commits Attempted**: 1  
**Commits Successfully Picked**: 1  

**Results**:
1. **[commit-hash]**: [Description]
   - **Files Changed**: X files
   - **Conflicts**: Y resolved
   - **Commit**: <new-commit-hash>
   - **Notes**: [what you did and key learnings]
```

Update the "Current Status" section at the top:
```markdown
**Last Sync**: [Date] (Session X)  
**Commits Behind**: ~[number] commits
**Last Session**: [summary]
**Next Target**: [next commit or action]
```

Then commit via report_progress tool:
```bash
# This will be done via report_progress tool
# Don't use git commit directly
```

---

## 📋 Conflict Resolution Patterns (Reference)

### Pattern 1: Locale JSON Merge

**Upstream adds new key** in `zh.json`:
```json
{
  "newFeature": "新功能"
}
```

**Fork doesn't have this key.**

**Resolution**: Add to ALL locale files:
```json
// en.json
{ "newFeature": "New Feature" }

// es.json
{ "newFeature": "Nueva Función" }

// fr.json
{ "newFeature": "Nouvelle Fonctionnalité" }

// hi.json
{ "newFeature": "नई सुविधा" }

// ja.json
{ "newFeature": "新機能" }

// zh.json
{ "newFeature": "新功能" }

// zh-TW.json
{ "newFeature": "新功能" }
```

### Pattern 2: React Component Text

**Upstream** (Chinese):
```tsx
<h3>设置权限</h3>
```

**Fork** (English):
```tsx
<h3>Permission Settings</h3>
```

**Resolution**: Keep fork's English text, accept any structural improvements from upstream.

### Pattern 3: Comment Translation

**Upstream**:
```typescript
// 获取用户配置
const config = getConfig();
```

**Resolution**:
```typescript
// Get user configuration
const config = getConfig();
```

---

## 🛠️ Commands Reference

### Git Operations

```bash
# Fetch upstream
git fetch upstream

# Check upstream commits
git log upstream/main --oneline | head -20

# Show commit details
git show <commit-hash> --stat

# Cherry-pick
git cherry-pick <commit-hash>

# List conflicts
git diff --name-only --diff-filter=U

# Abort cherry-pick
git cherry-pick --abort

# Continue after resolving
git add .
git cherry-pick --continue
```

### File Operations

```bash
# Check for Chinese text
grep -r "[\u4e00-\u9fff]" webview/src/components/

# View conflict in file
git diff --check

# Accept ours/theirs for entire file (use carefully)
git checkout --ours <file>
git checkout --theirs <file>
```

---

## 📈 Success Metrics

**Minimum Target**:
- At least 1 commit cherry-picked (32a7ae4 or other valuable commit)
- All tests passing (or pre-existing failures documented)
- Build successful
- All translations complete (7 locales: en, es, fr, hi, ja, zh, zh-TW)

**Optimal Target**:
- Cherry-pick 32a7ae4 (MCP/Skills i18n)
- Or 2-3 smaller valuable commits
- Commits behind: ~249 → fewer (focus on high-value commits, not count)
- No regressions
- English comments maintained

**Quality Checklist**:
- [ ] All Chinese comments translated to English
- [ ] All 7 locale files updated consistently
- [ ] Fork's version numbers preserved
- [ ] Build succeeds (or at least compiles)
- [ ] No new console errors
- [ ] SYNC_LOG.md updated with session details
- [ ] NEXT_SESSION_HANDOFF.md updated for next agent

---

## 🚨 Stop Criteria

**When to stop and document**:
1. **Time**: More than 45 minutes on single commit
2. **Complexity**: Logic conflicts (not just text/i18n)
3. **Conflicts**: More than 15 files in single commit
4. **Testing**: Any test failures after cherry-pick

**If stopped, document in SYNC_LOG.md**:
```markdown
## Blocked Cherry-Picks

### Commit: [commit-hash]
**Reason**: [specific issue]
**Conflicts**: [list files]
**Recommendation**: [next steps]
```

---

## 📚 Reference Documentation

**Read these before starting**:
1. `docs/CHERRY_PICK_SESSION_GUIDE.md` - Complete workflow
2. `docs/SYNC_LOG.md` - Session history and patterns
3. `docs/UPSTREAM_SYNC_STRATEGY.md` - Strategy rationale

**Key Sections**:
- CHERRY_PICK_SESSION_GUIDE.md lines 253-305: Conflict resolution patterns
- SYNC_LOG.md lines 253-287: Session 2 learnings
- UPSTREAM_EVALUATION_2026_01.md: Feature analysis

---

## 💡 Pro Tips

1. **Work incrementally**: Resolve conflicts in one file at a time
2. **Test frequently**: Build after resolving each major file
3. **Use tools**: `grep` for finding Chinese text, `git diff` for conflict visualization
4. **Document blockers**: If stuck, document why and move on
5. **Preserve fork identity**: Always keep fork's version, group, and English-first approach

---

## 🔍 Known Challenges

### Challenge 1: ja.json restoration
**Issue**: Fork had deleted `webview/src/i18n/locales/ja.json`  
**Solution**: ✅ Resolved in Session 3 - ja.json restored from upstream

### Challenge 2: Extensive locale conflicts
**Issue**: All 7 locale files may have conflicts  
**Solution**: Use pattern matching, resolve one locale as template, apply to others
**Session 3 Learning**: Python script effective for batch resolution

### Challenge 3: React component structure changes
**Issue**: Upstream may have refactored components  
**Solution**: Accept i18n structural improvements (t() calls), maintain English text

---

## 📞 Getting Help

If you encounter issues:
1. Check CHERRY_PICK_SESSION_GUIDE.md troubleshooting section (lines 495-537)
2. Review similar conflicts in git log for this PR
3. Document the blocker clearly in SYNC_LOG.md
4. Consider deferring to later session if too complex

---

## ✅ Session Completion Checklist

When done:
- [ ] Update SYNC_LOG.md with results
- [ ] Update session status (In Progress → Complete)
- [ ] Document deferred commits (if any)
- [ ] Commit with descriptive message
- [ ] Reply to user with summary
- [ ] Update PR description

---

**Good luck! Session 3 proved the process works. Focus on quality over quantity - each high-value commit is progress.**

*Document created: January 5, 2026*  
*Updated: January 5, 2026 (Post-Session 3)*  
*Last session: Session 3 - d35df2d integrated (i18n enhancements)*  
*Next target: 32a7ae4 (MCP/Skills i18n) or other valuable commits*
