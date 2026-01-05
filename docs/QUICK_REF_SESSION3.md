# Cherry-Pick Session - Quick Reference Card

**Session 3 Target**: Complete 2 remaining i18n commits

---

## 🎯 Immediate Actions

```bash
# 1. Verify setup
cd /home/runner/work/idea-claude-gui/idea-claude-gui
git fetch upstream
git status  # should be clean

# 2. Start cherry-pick
GIT_EDITOR=true git cherry-pick d35df2d

# 3. Fix conflicts (expected: 10+ files)
# - Keep fork's English text
# - Add new keys from upstream
# - Translate Chinese to English

# 4. Continue
git add .
git cherry-pick --continue

# 5. Repeat for 32a7ae4
GIT_EDITOR=true git cherry-pick 32a7ae4
```

---

## 📋 Remaining Commits

| Commit | Files | Conflicts | Priority |
|--------|-------|-----------|----------|
| `d35df2d` | ~16 files | High (10+ files) | Medium |
| `32a7ae4` | ~8 files | Medium (5-8 files) | Low |

---

## 🔧 Conflict Resolution Rules

**TypeScript/React files**:
- ✅ Keep: Fork's English text
- ✅ Accept: Upstream's structural improvements
- ✅ Translate: All Chinese comments → English

**Locale JSON files**:
- ✅ Keep: All existing fork translations
- ✅ Add: New keys from upstream
- ✅ Translate: Chinese values → English (then to other locales)
- ✅ Maintain: Consistency across all 6 locales

**Build files (build.gradle, CHANGELOG)**:
- ✅ Keep: Fork's version and group ID
- ✅ Accept: Upstream's logic improvements

---

## 🚨 Stop If

- ⏱️ More than 45 min on one commit
- 📁 More than 15 files conflicting
- ❌ Tests fail after cherry-pick
- 🧩 Logic conflicts (not just text)

→ Document in SYNC_LOG.md and defer

---

## 📊 Update SYNC_LOG.md After Each Commit

```markdown
4. **d35df2d**: i18n enhancements
   - **Commit**: <hash>
   - **Conflicts**: X files resolved
   - **Notes**: [what you did]
```

---

## ✅ Success = 

- 1-2 commits picked ✓
- Translations complete ✓
- Build works ✓
- English comments ✓

---

**Full details**: `docs/NEXT_SESSION_HANDOFF.md`
