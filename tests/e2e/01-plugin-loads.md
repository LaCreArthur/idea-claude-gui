# Test: Plugin Loads Successfully

## Purpose
Verify that the Claude GUI plugin installs correctly and appears in Rider.

## Prerequisites
- Rider 2025.3 or later
- Claude GUI plugin installed (either from marketplace or local build)

## Steps

1. **Open Rider**
   - Launch JetBrains Rider
   - Wait for the IDE to fully load

2. **Open or create a project**
   - Open any existing project, or create a new empty project
   - Wait for the project to finish indexing

3. **Look for Claude GUI**
   - Look at the right sidebar of Rider
   - Find a tool window button labeled "Claude GUI" or with a Claude icon

4. **Verify plugin settings available**
   - Go to Settings (Cmd/Ctrl + ,)
   - Search for "Claude" in settings
   - Verify Claude-related settings appear

## Expected Result
- Claude GUI button visible in the tool window sidebar
- Plugin appears in the installed plugins list
- No error notifications about the plugin

## Pass Criteria
- [ ] Claude GUI button is visible
- [ ] No plugin errors on startup
- [ ] Settings accessible
