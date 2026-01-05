# Next Cherry-Pick Session - Quick Start Guide

**Created**: January 5, 2026  
**For**: Next agent continuing upstream synchronization  
**Context**: Session 2 completed with 3/5 commits successfully integrated

---

## 🎯 Quick Summary

**Current State**: Successfully cherry-picked 3 high-priority commits (concurrency fixes, Windows crash fix, Node.js auto-detection). 2 i18n-heavy commits deferred due to extensive merge conflicts.

**Your Mission**: Complete the remaining 2 i18n commits (d35df2d, 32a7ae4) in a dedicated translation review session.

---

## 📊 What Was Accomplished (Session 2)

### ✅ Successfully Cherry-Picked

| Commit | Description | Conflicts | Status |
|--------|-------------|-----------|--------|
| `fac0bff` | Concurrency fixes | 1 file | ✅ Done (18ad2be) |
| `e397cad` | Windows crash fix | 3 files | ✅ Done (d091c54) |
| `d1a7903` | Node.js auto-detection | None | ✅ Done (cf4f551) |

**Key Changes Integrated**:
- Thread-safe execution with Alarm (replaced SwingUtilities)
- File existence checks to prevent race conditions
- ErrorBoundary component for crash prevention
- Fixed useEffect closure issues in dialogs
- Automatic Node.js path detection on first install

**Conflicts Resolution Pattern**:
- Translated all Chinese comments to English (fork standard)
- Kept fork's version numbers and group IDs
- Merged upstream logic while preserving fork's structure

---

## 🔜 What's Remaining (Your Task)

### Commit 4: d35df2d - i18n enhancements

**Description**: UI text improvements and translation completeness  
**Estimated Conflicts**: 10+ files (all locale files)  
**Priority**: Medium (UX improvement)

**Files Expected to Conflict**:
```
webview/src/App.tsx
webview/src/components/ChatInputBox/ChatInputBox.tsx
webview/src/components/PermissionDialog.tsx
webview/src/components/ScrollControl.tsx
webview/src/components/mcp/McpSettingsSection.tsx
webview/src/components/settings/index.tsx
webview/src/components/skills/SkillsSettingsSection.tsx
webview/src/i18n/locales/en.json
webview/src/i18n/locales/es.json
webview/src/i18n/locales/fr.json
webview/src/i18n/locales/hi.json
webview/src/i18n/locales/ja.json (may be deleted in fork)
webview/src/i18n/locales/zh-TW.json
webview/src/i18n/locales/zh.json
```

**Resolution Strategy**:
1. For TypeScript/React files: Keep fork's English text, accept upstream's structure improvements
2. For locale JSON files: 
   - Keep fork's existing translations
   - Add new keys from upstream
   - Translate any Chinese values to English
   - Maintain consistency across all 6 locales (en, es, fr, hi, ja, zh, zh-TW)

**Cherry-Pick Command**:
```bash
git cherry-pick d35df2d
```

---

### Commit 5: 32a7ae4 - MCP/Skills i18n completeness

**Description**: Complete i18n for MCP and Skills dialogs  
**Estimated Conflicts**: 5-8 locale files  
**Priority**: Low (translation completeness)  
**Dependencies**: Should be done AFTER d35df2d

**Files Expected to Conflict**:
```
webview/src/i18n/locales/*.json (5-8 files)
```

**Resolution Strategy**:
1. Same as d35df2d - keep existing, add new, translate Chinese
2. Focus on MCP and Skills dialog strings

**Cherry-Pick Command**:
```bash
git cherry-pick 32a7ae4
```

---

## 🚀 Quick Start Instructions

### 1. Verify Environment

```bash
cd /home/runner/work/idea-claude-gui/idea-claude-gui

# Check branch
git branch --show-current
# Expected: copilot/create-cherry-pick-docs

# Verify clean state
git status
# Expected: nothing to commit, working tree clean

# Check upstream remote
git remote -v | grep upstream
# Expected: upstream https://github.com/zhukunpenglinyutong/idea-claude-code-gui.git

# Fetch latest upstream
git fetch upstream
```

### 2. Review Current State

```bash
# See what was done
git log --oneline -12

# Check commits behind
git log --oneline HEAD..upstream/main | wc -l
# Expected: ~27 commits
```

### 3. Start Cherry-Picking

#### Option A: Cherry-pick d35df2d (i18n enhancements)

```bash
# Start the cherry-pick
GIT_EDITOR=true git cherry-pick d35df2d

# Check conflicts
git status

# Expected conflicts (10+ files):
# - webview/src/components/*.tsx (7 files)
# - webview/src/i18n/locales/*.json (7 files)
```

**Conflict Resolution Steps**:

1. **For React/TypeScript files**:
   ```bash
   # Example: webview/src/App.tsx
   # Keep fork's English text, accept structural changes
   # Look for conflict markers: <<<<<<<, =======, >>>>>>>
   ```

2. **For locale JSON files**:
   ```bash
   # For each locale file:
   # 1. Keep all existing fork translations
   # 2. Add new keys from upstream
   # 3. Translate Chinese values to English (for en.json)
   # 4. Use English as base for other locales (es, fr, hi, ja, zh, zh-TW)
   ```

3. **Resolve and continue**:
   ```bash
   # After fixing each file
   git add <file>
   
   # When all resolved
   git cherry-pick --continue
   ```

#### Option B: If conflicts are too complex

```bash
# Abort and document
git cherry-pick --abort

# Update SYNC_LOG.md with blocker details
# Create detailed conflict analysis in docs/I18N_CONFLICTS_ANALYSIS.md
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

```markdown
4. **d35df2d**: i18n enhancements
   - **Files Changed**: X files
   - **Conflicts**: Y resolved
   - **Commit**: <new-commit-hash>
   - **Notes**: [what you did]
```

Then commit:
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
- At least 1 commit cherry-picked (d35df2d)
- All tests passing
- Build successful
- All translations complete (6 locales)

**Optimal Target**:
- Both commits cherry-picked (d35df2d, 32a7ae4)
- Commits behind: 27 → 25
- No regressions
- English comments maintained

**Quality Checklist**:
- [ ] All Chinese comments translated to English
- [ ] All 6 locale files updated consistently
- [ ] Fork's version numbers preserved
- [ ] Build succeeds
- [ ] No console errors
- [ ] SYNC_LOG.md updated

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

### Commit: d35df2d
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

### Challenge 1: Missing ja.json in fork
**Issue**: Fork may have deleted `webview/src/i18n/locales/ja.json`  
**Solution**: Accept upstream version, or skip if not critical

### Challenge 2: Extensive locale conflicts
**Issue**: All 7 locale files may have conflicts  
**Solution**: Use pattern matching, resolve one locale as template, apply to others

### Challenge 3: React component structure changes
**Issue**: Upstream may have refactored components  
**Solution**: Focus on keeping English text, accept structural improvements

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

**Good luck! The groundwork is done, conflicts are expected and documented. Focus on quality over quantity.**

*Document created: January 5, 2026*  
*Last session: Session 2 - 3 commits integrated*  
*Next target: d35df2d (i18n) and 32a7ae4 (MCP/Skills i18n)*
