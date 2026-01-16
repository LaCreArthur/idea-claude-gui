# Research: JetBrains Starter Framework for E2E Testing

## Focus: How Claude Code CLI Can Leverage This for Automated Testing

---

## Executive Summary

JetBrains provides two main approaches for E2E/integration testing of IntelliJ plugins:

1. **Starter Framework** (New, recommended) - Comprehensive integration testing with IDE lifecycle management
2. **intellij-ui-test-robot** (Legacy, still maintained) - UI automation similar to Selenium

The **Starter Framework** is the newer, officially recommended approach for plugin integration testing.

---

## 1. JetBrains Starter Framework

### What It Is

A comprehensive framework for integration testing IntelliJ plugins that:
- Manages IDE startup, configuration, and shutdown
- Provides a **Driver Framework** for UI interaction
- Supports API-level testing via RMI
- Works with real IDE instances in a two-process architecture

### Architecture

```
┌─────────────────┐         ┌─────────────────┐
│  Test Process   │  RMI/   │   IDE Process   │
│                 │◄───────►│                 │
│ - JUnit tests   │  HTTP   │ - Real IDE      │
│ - Commands      │         │ - Your plugin   │
│ - Assertions    │         │ - Driver server │
└─────────────────┘         └─────────────────┘
```

### Dependencies Required

Add to `build.gradle.kts`:

```kotlin
dependencies {
    intellijPlatform {
        testFramework(TestFrameworkType.Starter)
    }
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testImplementation("org.kodein.di:kodein-di-jvm:7.20.2")
}
```

For Groovy `build.gradle`:

```groovy
dependencies {
    intellijPlatform {
        testFramework(TestFrameworkType.Starter)
    }
    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.2'
    testImplementation 'org.kodein.di:kodein-di-jvm:7.20.2'
}
```

### Gradle Task Configuration

```groovy
tasks.test {
    dependsOn("buildPlugin")
    systemProperty("path.to.build.plugin",
        tasks.buildPlugin.get().archiveFile.get().asFile.absolutePath)
    useJUnitPlatform()
}
```

### Basic Test Example

```kotlin
@Test
fun testPluginLoadsAndToolWindowExists() {
    Starter.newContext(
        testName = "testClaudeGUIToolWindow",
        TestCase(IdeProductProvider.IC, projectInfo = NoProject)
            .withVersion("2024.3")
    ).apply {
        val pathToPlugin = System.getProperty("path.to.build.plugin")
        PluginConfigurator(this).installPluginFromPath(Path(pathToPlugin))
    }.runIdeWithDriver().useDriverAndCloseIde {
        waitForIndicators(1.minutes)
        ideFrame {
            // Test your plugin UI here
            x(xQuery { byAccessibleName("Claude GUI") }).click()
        }
    }
}
```

### UI Testing with Driver Framework

The Driver Framework provides Kotlin DSL for UI interaction:

```kotlin
ideFrame {
    // Find and interact with components
    x(xQuery { byVisibleText("Claude GUI") }).click()

    // Keyboard interaction
    keyboard {
        enterText("Hello Claude")
        enter()
    }

    // Verify component presence
    val toolWindow = x(xQuery { byAccessibleName("Claude GUI") })
    toolWindow.shouldBe("Tool window not found", present)
}
```

### API/Service Testing

Test internal plugin services directly:

```kotlin
// Define stub interface
@Remote("com.github.claudecodegui.ClaudeSession", plugin = "com.lacrearthur.idea-claude-gui")
interface ClaudeSessionStub {
    fun getSessionId(): String
    fun isBusy(): Boolean
}

// Use in test
val session = service<ClaudeSessionStub>()
Assertions.assertFalse(session.isBusy())
```

---

## 2. intellij-ui-test-robot (Alternative)

### What It Is

An older but still maintained library for UI testing IntelliJ plugins, similar to Selenium WebDriver.

### Setup

```groovy
testImplementation("com.intellij.remoterobot:remote-robot:0.11.23")
```

### Key Difference from Starter Framework

- Uses HTTP communication instead of RMI
- Requires separate `runIdeForUiTests` task
- More focused on UI automation, less on full integration testing
- Simpler but less comprehensive

---

## 3. Comparison for idea-claude-gui

| Aspect | Starter Framework | UI Test Robot |
|--------|-------------------|---------------|
| **Recommended** | Yes (official) | Legacy |
| **IDE Lifecycle** | Full management | Manual |
| **UI Testing** | Driver Framework | XPath locators |
| **API Testing** | RMI stubs | Limited |
| **Setup Complexity** | Medium | Low |
| **Documentation** | Excellent (2025) | Good |
| **Best For** | Comprehensive E2E | Quick UI tests |

---

## 4. Recommended E2E Test Strategy for idea-claude-gui

### Test Categories

1. **Plugin Lifecycle Tests**
   - Plugin loads without errors
   - Tool window registers correctly
   - Settings page accessible

2. **UI Interaction Tests**
   - Chat input works
   - Send message flow
   - Permission dialogs appear
   - Settings toggle correctly

3. **Bridge Communication Tests**
   - Node.js bridge starts
   - Messages flow correctly
   - Errors handled gracefully

4. **Session Management Tests**
   - New session creates
   - Session persists
   - History loads correctly

### Proposed Directory Structure

```
src/test/
├── java/com/github/claudecodegui/
│   ├── PlaceholderTest.java       # Existing
│   └── unit/                      # Unit tests
└── kotlin/com/github/claudecodegui/
    └── integration/               # E2E tests (Kotlin required)
        ├── PluginLifecycleTest.kt
        ├── ToolWindowTest.kt
        ├── ChatInteractionTest.kt
        └── stubs/
            └── ClaudeSessionStub.kt
```

### Implementation Steps

1. **Add Starter Framework dependencies** to build.gradle
2. **Configure test task** with plugin path system property
3. **Create Kotlin test sources** (Starter uses Kotlin DSL)
4. **Write basic lifecycle test** to verify setup works
5. **Add UI interaction tests** for critical flows
6. **Add API stub tests** for service verification
7. **Integrate with CI** (GitHub Actions)

---

## 5. Current Project Gaps

From codebase exploration:

- **No E2E tests** currently exist
- **Only 1 Java placeholder test**
- **No Starter Framework** configured
- **CI doesn't run tests** (build.yml has no test step)
- **80+ Java classes** with zero integration tests

---

## 6. Resources

- [Integration Tests Blog Series (2025)](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-intro-dependencies-and-first-integration-test/)
- [UI Testing with Driver](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-ui-testing/)
- [API Interaction Testing](https://blog.jetbrains.com/platform/2025/03/integration-tests-for-plugin-developers-api-interaction/)
- [Testing Overview Docs](https://plugins.jetbrains.com/docs/intellij/testing-plugins.html)
- [intellij-ui-test-robot GitHub](https://github.com/JetBrains/intellij-ui-test-robot)

---

## 7. Key Considerations

### Pros of Starter Framework
- Official JetBrains recommendation (2025)
- Comprehensive IDE lifecycle management
- Both UI and API testing in one framework
- Stable API with good documentation
- Real IDE environment (catches real issues)

### Cons/Challenges
- Requires Kotlin for DSL (test files only)
- Tests run slower than unit tests (full IDE startup)
- macOS requires Accessibility permissions for keyboard tests
- More complex initial setup

### For Claude GUI Specifically
- **Bridge testing challenge**: Node.js bridge runs as subprocess - may need special handling
- **Webview testing**: React webview uses JCEF - Driver supports this but may be complex
- **Permission dialogs**: Need to test Java-side permission handling

---

---

## 7.5 Current Implementation Status (Another Agent's Work)

Another agent has already started implementing E2E testing infrastructure:

### What's Been Done

**1. build.gradle changes:**
```groovy
// Added
id 'org.jetbrains.kotlin.jvm' version '1.9.22'

// Maven repo for IDE Starter
maven { url 'https://packages.jetbrains.team/maven/p/ij/intellij-dependencies' }

// Dependencies
testImplementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.22'
testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'

// In intellijPlatform block
testFramework TestFrameworkType.Starter.INSTANCE

// New testE2E task
tasks.register('testE2E', Test) { ... }
```

**2. Test file created:** `src/test/kotlin/com/github/claudecodegui/e2e/MessageRoundTripTest.kt`
- `pluginBuild_containsRequiredFiles()` - Verifies plugin ZIP contents
- `riderInstallation_exists()` - Checks Rider is installed
- `e2eInfrastructure_isReady()` - Validates prerequisites

**3. Install script:** `scripts/install-rider.sh`
- Auto-builds plugin if needed
- Installs to Rider plugins directory
- Provides manual testing instructions

### What's NOT Yet Implemented

| Feature | Status |
|---------|--------|
| Automated IDE startup/shutdown | Not done |
| Driver Framework UI interaction | Not done |
| XPath component discovery | Not done |
| Automated test execution | Not done |
| CI integration | Not done |

**Current approach is MANUAL testing infrastructure** - validates build artifacts and provides scripts for human testers.

### What's Needed for Autonomous Test Execution

The key missing piece: **`runIdeWithDriver()` and `useDriverAndCloseIde{}`**

These methods handle the entire IDE lifecycle automatically:

```kotlin
Starter.newContext(
    testName = "testClaudeGUI",
    TestCase(IdeProductProvider.RD, projectInfo = NoProject)  // RD = Rider
        .withVersion("2024.3")
).apply {
    val pathToPlugin = System.getProperty("path.to.build.plugin")
    PluginConfigurator(this).installPluginFromPath(Path(pathToPlugin))
}.runIdeWithDriver().useDriverAndCloseIde {
    // IDE is now running automatically - no human intervention!
    waitForIndicators(1.minutes)
    ideFrame {
        // Test Claude GUI tool window here
    }
}
```

**How it works (zero human intervention):**
1. `Starter.newContext()` - Configures IDE type and version
2. **IDE auto-download** - Framework downloads Rider if not cached (~5GB first time)
3. `runIdeWithDriver()` - Launches Rider as separate process automatically
4. `useDriverAndCloseIde{}` - Connects via JMX/RMI for remote control
5. After lambda completes - Rider shuts down automatically

**IDE Product Codes for Starter Framework:**
| Code | IDE |
|------|-----|
| `RD` | Rider |
| `IU` | IntelliJ IDEA Ultimate |
| `IC` | IntelliJ IDEA Community |
| `PY` | PyCharm |
| `WS` | WebStorm |
| `GO` | GoLand |

### Example: Autonomous Claude GUI Test

```kotlin
@Test
@Timeout(value = 5, unit = TimeUnit.MINUTES)
fun claudeToolWindow_opensAndAcceptsInput() {
    Starter.newContext(
        testName = "testClaudeToolWindow",
        TestCase(IdeProductProvider.RD, projectInfo = NoProject)
            .withVersion("2024.3")
    ).apply {
        val pathToPlugin = System.getProperty("path.to.build.plugin")
        PluginConfigurator(this).installPluginFromPath(Path(pathToPlugin))
    }.runIdeWithDriver().useDriverAndCloseIde {
        // Wait for IDE to fully load
        waitForIndicators(2.minutes)

        ideFrame {
            // Open Claude tool window via menu
            invokeAction("ActivateClaudeToolWindow")  // Needs action ID from plugin.xml

            // Or find by accessible name
            x(xQuery { byAccessibleName("Claude GUI") }).click()

            // Verify tool window opened
            toolWindow(accessibleName = "Claude") {
                shouldBe("Tool window not present", present)
            }
        }
    }
}
```

### Claude Code Local Execution Workflow

Claude Code can run E2E tests locally with these commands:

```bash
# Build and run E2E tests
./gradlew buildPlugin && ./gradlew testE2E

# Run specific test
./gradlew testE2E --tests "com.github.claudecodegui.e2e.MessageRoundTripTest.testName"

# With custom Rider path
./gradlew testE2E -PriderPath=/Applications/Rider.app/Contents
```

**Claude Code Autonomous Loop:**
```
1. Analyze failure from ./gradlew testE2E output
2. Inspect component hierarchy via http://localhost:63343/api/remote-driver/
3. Regenerate XPath queries or fix test code
4. Rebuild: ./gradlew buildPlugin
5. Rerun: ./gradlew testE2E
6. Repeat until all tests pass
```

**First-Time Setup:**
- IDE download: ~5GB (cached after first run) - **OR use local installation (see below)**
- Build plugin: ~30 seconds
- Test execution: 2-5 minutes per test (IDE startup is slow)

### Using Local Rider Installation (No Download)

The Starter Framework documentation states it "can run an IDE from an existing installer or download one if needed." However, the specific API for this isn't well documented.

**Potential approaches to investigate:**

1. **IdeInfo.copy() with local path** - The framework uses `IdeInfo` objects that may accept local paths
2. **Environment variable** - May respect `RIDER_HOME` or similar
3. **System property** - The existing `riderPath` property in `testE2E` task

**Current testE2E task already has:**
```groovy
systemProperty 'rider.path',
    findProperty('riderPath') ?: '/Applications/Rider.app/Contents'
```

**Investigation needed:**
- Check [intellij-ide-starter source code](https://github.com/JetBrains/intellij-ide-starter) for `IdeInstaller` or `fromLocalPath` methods
- Look for `InstalledIde` or `ExistingIde` classes in the API
- The `IdeProductProvider` may have a way to specify local installation

**Fallback option:** Use the simpler `intellij-ui-test-robot` library which explicitly supports pointing to a local IDE via HTTP connection to a running instance.

### Next Steps to Complete

1. **Add Rider support** - Change to `IdeProductProvider.RD`
2. **Add `runIdeWithDriver()` calls** - For actual automated IDE control
3. **Implement UI interaction tests** using Kotlin DSL
4. **Add XPath queries** for Claude GUI components
5. **Add action IDs** to plugin.xml for invokeAction()

---

## 8. How Claude Code CLI Can Leverage Starter Framework

### The Vision: Autonomous E2E Test Generation & Maintenance

Claude Code could use the Starter Framework to:
1. **Automatically generate E2E tests** from plugin code analysis
2. **Run tests and parse failures** via Bash tool
3. **Fix failing tests** in an autonomous loop
4. **Maintain tests** as plugin code evolves

### Workflow Visualization

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code Starter Framework Automation Loop               │
└─────────────────────────────────────────────────────────────┘

START
  │
  ├─→ [Analyze] Java handlers, React components, plugin.xml
  │   └─→ Find UI interaction patterns
  │
  ├─→ [Generate] Starter Framework test scaffolds (Kotlin DSL)
  │   └─→ Map actions: invokeAction → handler → verify UI state
  │
  ├─→ [Build] ./gradlew buildPlugin
  │   └─→ Create binary distribution for test runner
  │
  ├─→ [Execute] ./gradlew test (Starter Framework)
  │   └─→ Two processes: Test → IDE (w/ robot-server)
  │
  ├─→ [Parse] Test results + IDE exception logs
  │   │
  │   ├─ PASS? → DONE ✓
  │   │
  │   └─ FAIL? → [Diagnose]
  │       ├─ XPath not found?
  │       │   └─ Query robot-server inspector
  │       │       └─ Regenerate XPath, retry
  │       │
  │       ├─ Component missing accessible name?
  │       │   └─ Suggest code fix, regenerate test, rebuild
  │       │
  │       └─ Wait timeout?
  │           └─ Add waits/setup, regenerate, retry
  │
  └─→ [Verify] All E2E tests passing before merge

END
```

### Test Generation from Code Analysis

Claude Code can analyze the plugin codebase to generate tests:

```
1. Scan Java handlers → Map message types
   AgentHandler("agent_start") → IDE should show agent panel

2. Scan React components → Map to UI actions
   <AgentPanel /> → Look for button with accessible name="Run"

3. Scan plugin.xml → Map to IDE actions
   <action id="com.claude.RunAgent"/> → invokeAction("com.claude.RunAgent")

4. Generate test scaffold:
   @Test fun testAgentPanelOpens() {
       runIdeWithDriver(...) { driver ->
           driver.ideFrame {
               invokeAction("com.claude.RunAgent")
               ideDialog("Agent Panel") { shouldBe(...) }
           }
       }
   }
```

### Bash Tool Integration Points

Claude Code's Bash tool can handle:

```bash
# Find handlers to test
grep -r "class.*Handler" src/main/java/

# Map accessible names in UI code
grep -r "setName\|setAccessibleName\|aria-label" webview/src/

# Build and test
./gradlew buildPlugin && ./gradlew test 2>&1 | tee test-output.log

# Parse failures
grep "FAILED\|AssertionError\|TimeoutException" test-output.log

# Inspect component hierarchy (when IDE is running)
curl http://localhost:63343/api/remote-driver/
```

### Failure Repair Loop

When tests fail, Claude Code can:

1. **Parse exception type** (XPath not found? Timeout? Component missing?)
2. **Query robot-server** at `localhost:63343/api/remote-driver/` for actual UI structure
3. **Regenerate XPath queries** with better selectors
4. **Suggest code fixes** if accessible names are missing
5. **Rebuild and rerun** until passing

### High-Value E2E Test Candidates for Claude GUI

| Test | Handler | What to Verify |
|------|---------|----------------|
| Settings flow | SettingsHandler | API key saved, plugin reconnects |
| Dependency install | DependencyHandler | SDK installed to ~/.claude-gui/ |
| Agent execution | AgentHandler | Bridge receives message, response appears |
| Session management | SessionHandler | History persisted, sessions switch correctly |

### Local Claude Code E2E Workflow

Claude Code (with Claude Max subscription) can autonomously:

1. **Generate tests** based on handler/component analysis
2. **Run tests locally**: `./gradlew buildPlugin && ./gradlew testE2E`
3. **Parse failures** from stdout/stderr
4. **Debug via inspector** at `http://localhost:63343/api/remote-driver/`
5. **Fix and retry** until all tests pass

**Example prompt for Claude Code:**
```
Analyze src/main/java/com/github/claudecodegui/handler/
Generate Starter Framework E2E tests for the Settings flow
Run: ./gradlew testE2E
If failures, diagnose using the component inspector and fix until passing
```

### Challenges & Mitigations

| Challenge | Impact | Mitigation |
|-----------|--------|-----------|
| **Slow execution** | E2E tests take 3-5x longer | Batch tests, parallel gradle |
| **Plugin rebuild required** | Binary needed before tests | Auto-detect changes, rebuild in task |
| **XPath fragility** | Breaks with UI changes | Regenerate from inspector |
| **Two-process debugging** | Exceptions don't propagate | Parse IDE logs |
| **Accessible names** | Often missing | Claude suggests adding them |

### MVP Implementation Plan

**Goal**: Demonstrate the pattern with one complete E2E test

1. **Add Starter Framework** to build.gradle
2. **Generate Settings dialog test** (self-contained, clear pass/fail)
3. **Implement failure parsing** from gradle output
4. **Add XPath regeneration** from robot-server
5. **Document the pattern** for extending to other handlers

**Estimated effort**: 12-16 hours total

---

## 9. Comprehensive Resources for E2E Test Implementation

### Primary Documentation (Essential Reading)

| Resource | URL | Key Content |
|----------|-----|-------------|
| **Intro to Integration Tests** | [blog.jetbrains.com](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-intro-dependencies-and-first-integration-test/) | Dependencies, first test, context setup |
| **UI Testing Guide** | [blog.jetbrains.com](https://blog.jetbrains.com/platform/2025/02/integration-tests-for-plugin-developers-ui-testing/) | Driver DSL, XPath queries, ideFrame{} |
| **API Interaction** | [blog.jetbrains.com](https://blog.jetbrains.com/platform/2025/03/integration-tests-for-plugin-developers-api-interaction/) | @Remote stubs, service testing |
| **SDK Docs: Intro** | [plugins.jetbrains.com](https://plugins.jetbrains.com/docs/intellij/integration-tests-intro.html) | Full lifecycle, code examples |
| **SDK Docs: UI Testing** | [plugins.jetbrains.com](https://plugins.jetbrains.com/docs/intellij/integration-tests-ui.html) | Complete UI testing reference |

### Code Examples & Patterns

**Basic Test Structure:**
```kotlin
@Test
fun testPluginLoads() {
    Starter.newContext(
        testName = "testExample",
        TestCase(IdeProductProvider.RD, projectInfo = NoProject)
            .withVersion("2024.3")
    ).apply {
        val pathToPlugin = System.getProperty("path.to.build.plugin")
        PluginConfigurator(this).installPluginFromPath(Path(pathToPlugin))
    }.runIdeWithDriver().useDriverAndCloseIde {
        waitForIndicators(1.minutes)
        ideFrame {
            // Test code here
        }
    }
}
```

**XPath Query Examples:**
```kotlin
// By accessible name (preferred)
x(xQuery { byAccessibleName("Claude GUI") }).click()

// By visible text
x(xQuery { byVisibleText("Send") }).click()

// By class type
x(xQuery { byType("com.github.claudecodegui.ui.ChatPanel") })

// Combined queries
x(xQuery { and(byAccessibleName("Button"), byVisibleText("OK")) })

// Contains (partial match)
x(xQuery { contains(byVisibleText("Claude")) })
```

**Keyboard Interaction:**
```kotlin
keyboard {
    enterText("Hello Claude")
    enter()
    hotKey(KeyEvent.VK_CONTROL, KeyEvent.VK_A)  // Select all
    backspace()
}
```

**Waiting for Components:**
```kotlin
// Wait for indicators (loading bars)
waitForIndicators(2.minutes)

// Wait for component to be present (15 sec default)
component.shouldBe("Error message", present)

// Debug: pause IDE to inspect
Thread.sleep(30.minutes.inWholeMilliseconds)
// Then visit: http://localhost:63343/api/remote-driver/
```

### Gradle Configuration Reference

```groovy
// build.gradle additions for Starter Framework
import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id 'org.jetbrains.kotlin.jvm' version '1.9.22'
}

repositories {
    maven { url 'https://packages.jetbrains.team/maven/p/ij/intellij-dependencies' }
}

dependencies {
    testImplementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.22'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'
    testImplementation 'org.kodein.di:kodein-di-jvm:7.20.2'

    intellijPlatform {
        testFramework TestFrameworkType.Starter.INSTANCE
    }
}

tasks.test {
    dependsOn 'buildPlugin'
    systemProperty 'path.to.build.plugin',
        tasks.buildPlugin.get().archiveFile.get().asFile.absolutePath
    useJUnitPlatform()
}
```

### IDE Product Codes

| Code | IDE | Use Case |
|------|-----|----------|
| `RD` | Rider | .NET/C# projects (current target) |
| `IU` | IntelliJ IDEA Ultimate | Java/Kotlin projects |
| `IC` | IntelliJ IDEA Community | Open-source Java projects |
| `PY` | PyCharm Professional | Python projects |
| `WS` | WebStorm | JavaScript/TypeScript |
| `GO` | GoLand | Go projects |
| `CL` | CLion | C/C++ projects |

### Debugging Tips

1. **Component Inspector**: Visit `http://localhost:63343/api/remote-driver/` while IDE is running
2. **Pause for inspection**: Add `Thread.sleep(30.minutes.inWholeMilliseconds)`
3. **Enable logging**: Check IDE logs in `build/idea-sandbox/system/log/`
4. **XPath testing**: Use browser dev tools on the inspector HTML

### Alternative Libraries

| Library | GitHub | Status |
|---------|--------|--------|
| intellij-ui-test-robot | [JetBrains/intellij-ui-test-robot](https://github.com/JetBrains/intellij-ui-test-robot) | Active, HTTP-based |
| ide-starter | Part of intellij-community | Official Starter Framework |

### Alternative: intellij-ui-test-robot for Local IDE Testing

If using a local Rider installation is a priority, **intellij-ui-test-robot** may be simpler:

```groovy
// build.gradle
testImplementation("com.intellij.remoterobot:remote-robot:0.11.23")

// Separate gradle task to run IDE with robot server
runIdeForUiTests {
    systemProperty 'robot-server.port', '8082'
}
```

**How it works:**
1. Run Rider manually with robot-server plugin: `./gradlew runIdeForUiTests`
2. Tests connect to `http://localhost:8082` via HTTP
3. No IDE download needed - uses your local Rider

**Test example:**
```kotlin
@Test
fun testWithLocalRider() {
    val remoteRobot = RemoteRobot("http://127.0.0.1:8082")
    remoteRobot.find<JTreeFixture>(byXpath("//div[@class='ProjectViewTree']"))
}
```

**Trade-off:** Less automated (manual IDE start) but guaranteed to use local installation.

### Key API Classes

```kotlin
// Context and lifecycle
com.jetbrains.ide.starter.Starter
com.jetbrains.ide.starter.models.TestCase
com.jetbrains.ide.starter.models.IdeProductProvider
com.jetbrains.ide.starter.models.NoProject
com.jetbrains.ide.starter.plugins.PluginConfigurator

// UI testing
com.jetbrains.ide.starter.driver.Driver
com.jetbrains.ide.starter.driver.engine.RemoteDriver

// Assertions
com.jetbrains.ide.starter.driver.conditions.present
com.jetbrains.ide.starter.driver.conditions.visible
```

### Claude GUI Specific Considerations

For testing this plugin specifically:

1. **Tool Window ID**: Find in `plugin.xml` - likely `Claude` or `ClaudeGUI`
2. **Action IDs**: Add to `plugin.xml` if not present for `invokeAction()`
3. **Accessible Names**: May need to add to React components:
   ```tsx
   <button aria-label="Send Message">Send</button>
   ```
4. **Bridge subprocess**: May need to mock or configure test mode for ai-bridge
5. **JCEF/Webview**: Special handling may be needed for React webview testing

---

## 10. Summary

**JetBrains Starter Framework** is the ideal choice for Claude Code E2E testing automation because:

1. **JUnit 5 compatible** - Matches existing test infrastructure
2. **Kotlin DSL** - Claude can generate hierarchical test code
3. **Robot-server inspector** - Enables programmatic UI discovery
4. **Officially maintained** - 2025 updates, stable API
5. **Two-process architecture** - Real IDE testing catches real bugs

**Claude Code's role**: Autonomous test generation, execution, failure analysis, and repair - creating a self-maintaining E2E test suite.

---

## Next Steps (For Claude Code to Execute Locally)

1. Modify existing `MessageRoundTripTest.kt` to add `runIdeWithDriver()` calls
2. Update `IdeProductProvider.IC` to `IdeProductProvider.RD` for Rider
3. Write first autonomous test (plugin loads, tool window exists)
4. Run locally: `./gradlew buildPlugin && ./gradlew testE2E`
5. Iterate: parse failures → fix → rerun until passing
6. Expand to cover Settings, Session, and Agent handlers
