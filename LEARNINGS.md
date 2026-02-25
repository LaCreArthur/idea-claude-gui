# Project Learnings

Format: `[YYYY-MM-DD] #tag: insight`
Greppable: `grep "#hooks" LEARNINGS.md`

---

[2025-01-19] #e2e #paths: Screenshot paths must use __dirname-based absolute paths, not relative paths like `tests/e2e/screenshots/`. Relative paths double up when working directory changes.

[2025-01-19] #architecture #files: Files over 1000 lines cause Claude token limit errors. Target max ~800 lines per file.

[2025-01-19] #react #hooks: When extracting hooks from large components, group related state together (e.g., all permission dialog state into usePermissionDialog).

[2025-01-19] #java #refactoring: Inner classes in Java (like ClaudeChatWindow inside ClaudeSDKToolWindow) should be extracted to separate files when they exceed ~500 lines.

[2026-01-19] #java #duplication: When utility methods are duplicated across 3+ files, extract to a static utility class. Creates a single source of truth and reduces maintenance burden.

[2026-01-20] #e2e #jcef: Drag-drop can be simulated via DataTransfer API + DragEvent in page.evaluate(). Native file dialogs cannot be automated in JCEF.

[2026-01-20] #e2e #debugging: Message counting (user=1, assistant=0) reveals rendering bugs faster than inspecting content. Check DOM state before/after.

[2026-01-20] #bugs #symptoms: "Stuck on generating" can mean 2 things: (1) infinite loading, or (2) generation completes but response never renders. Count messages to distinguish.

[2026-01-20] #intellij #services: Singletons cause cross-IDE-instance bugs. Convert to `@Service(Service.Level.PROJECT)` + `project.getService(Foo.class)` for per-project isolation.

[2026-01-20] #e2e #automation: Full E2E flow: 1) `./gradlew buildPlugin` 2) unzip to `~/Library/.../Rider2025.3/plugins/` 3) `open -a "Rider" <project>` 4) wait ~15s 5) open Claude GUI panel 6) run tests. CDP only works after webview loads.

[2026-01-20] #sdk #multimodal: Claude Agent SDK query() expects `prompt: string | AsyncIterable<SDKUserMessage>`, NOT content array. For images, yield SDKUserMessage with `message: { role: 'user', content: [...] }` via async generator.

[2026-02-25] #build #deploy: Java 21 not default — must `export JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home` before `./gradlew clean buildPlugin`. Deploy: `rm -rf` then `unzip` to `~/Library/Application Support/JetBrains/Rider2025.3/plugins/`. Restart Rider after.

[2026-02-25] #models #architecture: Model IDs are scattered across 9 files (TS types, selectors, defaults in 4 Java files, pricing). When adding/replacing models, grep for old IDs across `*.{ts,tsx,java}` to catch all occurrences. Pricing in ClaudeHistoryReader uses substring matching — new versions in same family match automatically.
