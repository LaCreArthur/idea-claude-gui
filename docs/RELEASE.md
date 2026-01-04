# Release Process

## Pre-Release Checklist

Before creating a new release, verify all version numbers and changelogs are updated:

### 1. Version Numbers (must all match)
- [ ] `build.gradle` - `version = 'X.Y.Z'`
- [ ] `CHANGELOG.md` - Add entry at top with date and version

### 2. JetBrains Plugin Metadata
- [ ] `src/main/resources/META-INF/plugin.xml` - Update `<change-notes>` section with new version entry

### 3. Run Tests
```bash
./scripts/test-all.sh
```

### 4. Verify Build
```bash
./gradlew clean build
```

## Release Steps

1. **Commit version updates:**
   ```bash
   git add build.gradle CHANGELOG.md src/main/resources/META-INF/plugin.xml
   git commit -m "release: vX.Y.Z - Release Title"
   ```

2. **Create and push tag:**
   ```bash
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

3. **Create GitHub release:**
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z - Release Title" --notes "..."
   ```

## Version Locations Summary

| File | Field/Section | Example |
|------|---------------|---------|
| `build.gradle` | `version` | `version = '0.2.1'` |
| `CHANGELOG.md` | Header | `##### **January 4, 2026 (v0.2.1)**` |
| `plugin.xml` | `<change-notes>` | `<h3>v0.2.1 - Feature Update</h3>` |

## Notes

- The webview `package.json` version is `0.0.0` (intentional, not released separately)
- Version is extracted at build time via `scripts/extract-version.mjs`
- JetBrains Marketplace uses the version from Gradle build output
