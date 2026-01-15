# Codebase Simplification Execution Plan

## Instructions for Claude (Ralph Loop)

Each iteration:
1. Read this file and find the FIRST unchecked task (- [ ])
2. Execute that task completely
3. Mark the task complete: - [x] Task description ✓
4. Commit: `git add -A && git commit -m "chore: [brief task description]"`
5. If ALL tasks checked → Write to SIMPLIFICATION_STATE.md: "PHASE: 3 - REVIEW"

## Rules
- ONE task per iteration
- ALWAYS commit after each task
- If task fails, mark with ⚠️ and note, move to next
- Preserve English strings when removing i18n
- Keep Claude Code fully functional

---

## Section 1: Delete Non-English Locale Files

- [x] Delete `webview/src/i18n/locales/zh.json` ✓
- [x] Delete `webview/src/i18n/locales/zh-TW.json` ✓
- [x] Delete `webview/src/i18n/locales/ja.json` ✓
- [x] Delete `webview/src/i18n/locales/es.json` ✓
- [x] Delete `webview/src/i18n/locales/fr.json` ✓
- [x] Delete `webview/src/i18n/locales/hi.json` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_zh.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_zh_TW.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_ja.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_es.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_fr.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_hi.properties` ✓
- [x] Delete `src/main/resources/messages/ClaudeCodeGuiBundle_en.properties` ✓

## Section 2: Delete Codex Provider Files (Java)

- [x] Delete `src/main/java/com/github/claudecodegui/provider/codex/CodexSDKBridge.java` ✓
- [x] Delete `src/main/java/com/github/claudecodegui/provider/codex/CodexHistoryReader.java` ✓
- [x] Delete `src/main/java/com/github/claudecodegui/session/CodexMessageHandler.java` ✓
- [x] Delete `src/main/java/com/github/claudecodegui/settings/CodexProviderManager.java` ✓
- [x] Delete `src/main/java/com/github/claudecodegui/settings/CodexSettingsManager.java` ✓
- [x] Delete entire directory `src/main/java/com/github/claudecodegui/provider/codex/` if still exists ✓

## Section 3: Delete Codex Provider Files (ai-bridge)

- [x] Delete `ai-bridge/channels/codex-channel.js` ✓
- [x] Delete `ai-bridge/services/codex/` directory (entire directory) ✓

## Section 4: Delete Codex UI and Documentation

- [x] Delete `webview/src/components/CodexProviderDialog.tsx` ✓
- [x] Delete `docs/codex/` directory (entire directory) ✓
- [x] Delete `docs/sdk/codex-cli-sdk.md` if exists ✓
- [x] Delete `docs/sdk/codex-sdk-npm-demo.md` if exists ✓
- [x] Delete `docs/sdk/codex-sdk.md` if exists ✓

## Section 5: Remove i18n Dependencies

- [x] Remove i18next and react-i18next from `webview/package.json` and run npm install ✓
- [x] Remove `import './i18n/config'` from `webview/src/main.tsx` ✓
- [x] Remove i18n mock from `webview/src/test/setup.ts` ✓
- [x] Remove i18n declarations from `webview/src/global.d.ts` ✓

## Section 6: Replace Translations in React Components (Batch 1 - Core)

- [x] Remove i18n from `webview/src/App.tsx` - replace t() calls with English strings ✓
- [x] Remove i18n from `webview/src/components/settings/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/BasicConfigSection/index.tsx` - also remove language selector UI ✓
- [x] Remove i18n from `webview/src/components/settings/SettingsSidebar/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/SettingsHeader/index.tsx` ✓

## Section 7: Replace Translations in React Components (Batch 2 - Settings)

- [x] Remove i18n from `webview/src/components/settings/ProviderList/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/ProviderList/ImportConfirmDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/ProviderManageSection/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/DependencySection/index.tsx` - also remove codex-sdk ✓
- [x] Remove i18n from `webview/src/components/settings/UsageSection/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/AgentSection/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/CommunitySection/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/ConfigInfoDisplay/index.tsx` ✓
- [x] Remove i18n from `webview/src/components/settings/PlaceholderSection/index.tsx` ✓

## Section 8: Replace Translations in React Components (Batch 3 - ChatInputBox)

- [x] Remove i18n from `webview/src/components/ChatInputBox/ChatInputBox.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/ButtonArea.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/ContextBar.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/TokenIndicator.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/AttachmentList.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/PromptEnhancerDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/Dropdown/index.tsx` ✓

## Section 9: Replace Translations + Remove Codex (ChatInputBox selectors)

- [x] Remove i18n and Codex models from `webview/src/components/ChatInputBox/selectors/ModelSelect.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/selectors/ModeSelect.tsx` ✓
- [x] Remove i18n from `webview/src/components/ChatInputBox/selectors/ConfigSelect.tsx` ✓
- [x] Remove i18n and Codex provider from `webview/src/components/ChatInputBox/selectors/ProviderSelect.tsx` ✓
- [x] Delete `webview/src/components/ChatInputBox/selectors/ReasoningSelect.tsx` (Codex-only) ✓

## Section 10: Replace Translations in React Components (Batch 4 - Dialogs & Tools)

- [x] Remove i18n from `webview/src/components/history/HistoryView.tsx` ✓
- [x] Remove i18n from `webview/src/components/mcp/McpSettingsSection.tsx` ✓
- [x] Remove i18n from `webview/src/components/mcp/McpHelpDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/mcp/McpPresetDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/mcp/McpServerDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/skills/SkillsSettingsSection.tsx` ✓
- [x] Remove i18n from `webview/src/components/skills/SkillHelpDialog.tsx` ✓

## Section 11: Replace Translations in React Components (Batch 5 - Tool Blocks)

- [x] Remove i18n from `webview/src/components/toolBlocks/BashToolBlock.tsx` ✓
- [x] Remove i18n from `webview/src/components/toolBlocks/EditToolBlock.tsx` ✓
- [x] Remove i18n from `webview/src/components/toolBlocks/ReadToolBlock.tsx` ✓
- [x] Remove i18n from `webview/src/components/toolBlocks/GenericToolBlock.tsx` ✓
- [x] Remove i18n from `webview/src/components/toolBlocks/TodoListBlock.tsx` ✓

## Section 12: Replace Translations in React Components (Batch 6 - Remaining)

- [x] Remove i18n from `webview/src/components/MarkdownBlock.tsx` ✓
- [x] Remove i18n from `webview/src/components/PermissionDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/ConfirmDialog.tsx` ✓ (already clean - uses props)
- [x] Remove i18n from `webview/src/components/ProviderDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/AgentDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/AskUserQuestionDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/PlanApprovalDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/RewindDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/RewindSelectDialog.tsx` ✓
- [x] Remove i18n from `webview/src/components/ScrollControl.tsx` ✓
- [x] Remove i18n from `webview/src/components/WaitingIndicator.tsx` ✓
- [x] Remove i18n from `webview/src/components/BlinkingLogo/index.tsx` ✓ (also simplified to Claude-only)
- [x] Remove i18n from `webview/src/components/UsageStatisticsSection.tsx` ✓

## Section 13: Remove Codex from Types

- [x] Remove CODEX_MODELS from `webview/src/components/ChatInputBox/types.ts` ✓
- [x] Remove 'codex' from ProviderType in `webview/src/types/provider.ts` if exists ✓
- [x] Remove 'codex-sdk' from SdkId in `webview/src/types/dependency.ts` ✓
- [x] Remove CodexProviderConfig from provider.ts ✓
- [x] Remove ReasoningEffort/REASONING_LEVELS from types.ts ✓
- [x] Remove i18n from agentProvider.ts and slashCommandProvider.ts ✓
- [x] Simplify McpApps in mcp.ts ✓
- [x] Delete i18n directory ✓

## Section 14: Simplify Backend - ProviderHandler

- [x] Remove all Codex message types and handlers from `src/main/java/com/github/claudecodegui/handler/ProviderHandler.java` ✓

## Section 15: Simplify Backend - CodemossSettingsService

- [x] Remove all Codex methods from `src/main/java/com/github/claudecodegui/CodemossSettingsService.java` ✓

## Section 16: Simplify Backend - Other Java Files

- [x] Remove Codex references from `src/main/java/com/github/claudecodegui/handler/HistoryHandler.java` ✓
- [x] Remove Codex references from `src/main/java/com/github/claudecodegui/ClaudeSDKToolWindow.java` ✓
- [x] Remove Codex references from `src/main/java/com/github/claudecodegui/dependency/SdkDefinition.java` ✓
- [x] Remove Codex env config from `src/main/java/com/github/claudecodegui/bridge/EnvironmentConfigurator.java` ✓
- [x] Remove reasoningEffort from `src/main/java/com/github/claudecodegui/session/SessionState.java` ✓

## Section 17: Replace Java Bundle Messages

- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/handler/McpServerHandler.java` ✓
- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/handler/FileExportHandler.java` ✓
- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/settings/ProviderManager.java` ✓
- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/SendSelectionToTerminalAction.java` ✓
- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/QuickFixWithClaudeAction.java` ✓
- [x] Replace ClaudeCodeGuiBundle.message() calls in `src/main/java/com/github/claudecodegui/ClaudeSDKToolWindow.java` ✓

## Section 18: Simplify ai-bridge

- [ ] Remove Codex from `ai-bridge/channel-manager.js`
- [ ] Remove Codex SDK functions from `ai-bridge/utils/sdk-loader.js`

## Section 19: Remove i18n Config Files

- [ ] Remove resource-bundle from `src/main/resources/META-INF/plugin.xml`
- [ ] Delete `webview/src/i18n/` directory entirely
- [ ] Delete `src/main/resources/messages/ClaudeCodeGuiBundle.properties`
- [ ] Delete `webview/src/i18n/locales/en.json`
- [ ] Delete `webview/src/i18n/config.ts`
- [ ] Delete `src/main/java/com/github/claudecodegui/ClaudeCodeGuiBundle.java`
- [ ] Delete `src/main/java/com/github/claudecodegui/util/LanguageConfigService.java`

## Section 20: Update Documentation

- [ ] Update `CLAUDE.md` - remove i18n reference from Code Style section
- [ ] Update `README.md` - remove any Codex/OpenAI references if present

## Section 21: Verification

- [ ] Run `cd webview && npm run build` - verify webview builds
- [ ] Run `cd webview && npm test` - verify webview tests pass
- [ ] Run `cd ai-bridge && npm test` - verify ai-bridge tests pass
- [ ] Run `./gradlew clean compileJava` - verify Java compiles
- [ ] Run `./scripts/test-all.sh` - full test suite

---

## Progress Tracking

Total tasks: ~95
Completed: 0
