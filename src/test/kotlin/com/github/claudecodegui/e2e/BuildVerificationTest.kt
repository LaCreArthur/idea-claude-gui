package com.github.claudecodegui.e2e

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

/**
 * Fast build verification tests.
 *
 * These tests verify the plugin build artifact structure without launching the IDE.
 * They run in seconds, not minutes.
 *
 * For full E2E testing, use the natural language tests in tests/e2e/
 */
class BuildVerificationTest {

    companion object {
        private val PLUGIN_PATH: String? = System.getProperty("path.to.build.plugin")
        private val IS_CI = System.getenv("CI") == "true"
    }

    private fun skipInCI() {
        assumeTrue(!IS_CI, "Skipping in CI - run locally with -Dpath.to.build.plugin=path/to/plugin.zip")
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    fun pluginZip_exists() {
        skipInCI()
        assumeTrue(PLUGIN_PATH != null, "Skipping: -Dpath.to.build.plugin not set (run after buildPlugin)")
        val pluginFile = File(PLUGIN_PATH!!)
        assertTrue(pluginFile.exists(), "Plugin ZIP must exist: $PLUGIN_PATH")
        assertTrue(pluginFile.name.endsWith(".zip"), "Plugin must be a ZIP file")
        println("[BUILD] Plugin ZIP verified: ${pluginFile.name} (${pluginFile.length() / 1024} KB)")
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    fun pluginZip_containsMainJar() {
        skipInCI()
        assumeTrue(PLUGIN_PATH != null, "Skipping: -Dpath.to.build.plugin not set")
        val pluginZip = ZipFile(File(PLUGIN_PATH!!))
        val entries = pluginZip.entries().toList().map { it.name }
        pluginZip.close()

        val mainJar = entries.find {
            it.endsWith(".jar") && it.contains("idea-claude-gui-")
        }
        assertNotNull(mainJar, "Plugin must contain main JAR (idea-claude-gui-VERSION.jar)")
        println("[BUILD] Main JAR found: $mainJar")
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    fun pluginZip_doesNotContainAiBridge() {
        skipInCI()
        assumeTrue(PLUGIN_PATH != null, "Skipping: -Dpath.to.build.plugin not set")
        val pluginZip = ZipFile(File(PLUGIN_PATH!!))
        val entries = pluginZip.entries().toList().map { it.name }
        pluginZip.close()

        val aiBridge = entries.find { it.contains("ai-bridge") }
        assertNull(aiBridge, "Plugin must NOT contain ai-bridge (removed in Phase 2)")
        println("[BUILD] Confirmed: no ai-bridge artifacts in plugin")
    }

    @Test
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    fun pluginJar_containsWebviewHtml() {
        skipInCI()
        assumeTrue(PLUGIN_PATH != null, "Skipping: -Dpath.to.build.plugin not set")
        val pluginZip = ZipFile(File(PLUGIN_PATH!!))

        val mainJarEntry = pluginZip.entries().toList().find {
            it.name.endsWith(".jar") && it.name.contains("idea-claude-gui-")
        }
        assertNotNull(mainJarEntry, "Plugin must contain main JAR")

        // Extract JAR to temp
        val tempDir = Files.createTempDirectory("plugin-jar-verify")
        val tempJar = tempDir.resolve("plugin.jar")
        pluginZip.getInputStream(mainJarEntry).use { input ->
            Files.copy(input, tempJar)
        }
        pluginZip.close()

        // Check JAR contents
        val jar = ZipFile(tempJar.toFile())
        val jarEntries = jar.entries().toList().map { it.name }
        jar.close()

        val hasWebviewHtml = jarEntries.any { it.contains("claude-chat.html") }

        tempDir.toFile().deleteRecursively()

        assertTrue(hasWebviewHtml, "Plugin JAR must contain claude-chat.html")
        println("[BUILD] Webview HTML verified: $hasWebviewHtml")
    }
}
