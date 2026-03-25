package com.github.claudecodegui

import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.JBList
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.io.File
import javax.swing.DefaultListModel
import javax.swing.JTextArea
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

data class SlashCommand(val name: String, val description: String) {
    override fun toString() = "/$name  —  $description"
}

class SlashCommandCompletion(
    private val inputArea: JTextArea,
    private val onSelect: (SlashCommand) -> Unit,
) {
    private var popup: JBPopup? = null
    private val commands: List<SlashCommand> by lazy { discoverCommands() }

    init {
        inputArea.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent) = onTextChanged()
            override fun removeUpdate(e: DocumentEvent) = onTextChanged()
            override fun changedUpdate(e: DocumentEvent) {}
        })

        inputArea.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                val p = popup ?: return
                if (!p.isVisible) return
                when (e.keyCode) {
                    KeyEvent.VK_DOWN, KeyEvent.VK_UP, KeyEvent.VK_ENTER, KeyEvent.VK_TAB -> {
                        // These are handled by the popup's JBList — don't consume here
                    }
                    KeyEvent.VK_ESCAPE -> {
                        p.cancel()
                        e.consume()
                    }
                }
            }
        })
    }

    private fun onTextChanged() {
        val text = inputArea.text
        // Only trigger on first line starting with "/"
        val firstLine = text.lines().firstOrNull() ?: ""
        if (!firstLine.startsWith("/") || firstLine.contains(" ")) {
            popup?.cancel()
            return
        }
        val query = firstLine.removePrefix("/").lowercase()
        showPopup(query)
    }

    private fun showPopup(query: String) {
        popup?.cancel()

        val filtered = if (query.isEmpty()) {
            commands
        } else {
            commands.filter { it.name.lowercase().contains(query) }
        }
        if (filtered.isEmpty()) return

        popup = JBPopupFactory.getInstance()
            .createPopupChooserBuilder(filtered)
            .setRenderer(SlashCommandRenderer())
            .setItemChosenCallback { cmd: SlashCommand -> onSelect(cmd) }
            .setRequestFocus(false)
            .setMovable(false)
            .setResizable(false)
            .createPopup()

        // Show above the input area
        val location = inputArea.locationOnScreen
        popup?.showInScreenCoordinates(inputArea, java.awt.Point(location.x, location.y - (filtered.size.coerceAtMost(10) * 22)))
    }

    fun dismiss() {
        popup?.cancel()
    }

    companion object {
        private fun discoverCommands(): List<SlashCommand> {
            val builtins = listOf(
                SlashCommand("help", "Show available commands"),
                SlashCommand("model", "Switch AI model (e.g. /model opus)"),
                SlashCommand("clear", "Clear conversation history"),
                SlashCommand("compact", "Compact conversation to save context"),
                SlashCommand("cost", "Show token usage and cost"),
                SlashCommand("exit", "Exit Claude"),
                SlashCommand("config", "View or change configuration"),
                SlashCommand("doctor", "Check Claude Code health"),
                SlashCommand("fast", "Toggle fast mode"),
                SlashCommand("init", "Initialize project configuration"),
                SlashCommand("login", "Log in to your account"),
                SlashCommand("logout", "Log out of your account"),
                SlashCommand("permissions", "View or modify permissions"),
                SlashCommand("review", "Review recent changes"),
                SlashCommand("status", "Show session status"),
                SlashCommand("vim", "Toggle vim keybindings"),
                SlashCommand("resume", "Resume a previous session"),
                SlashCommand("terminal-setup", "Configure terminal integration"),
            )

            val skills = discoverSkills()
            return (builtins + skills).sortedBy { it.name }
        }

        private fun discoverSkills(): List<SlashCommand> {
            val skillsDir = File(System.getProperty("user.home"), ".claude/skills")
            if (!skillsDir.isDirectory) return emptyList()

            return skillsDir.listFiles()?.mapNotNull { entry ->
                val skillFile = if (entry.isDirectory) {
                    File(entry, "SKILL.md")
                } else if (entry.isFile && entry.name == "SKILL.md") {
                    entry
                } else {
                    // Symlink — resolve and find SKILL.md
                    val resolved = entry.canonicalFile
                    if (resolved.isDirectory) File(resolved, "SKILL.md") else null
                }
                if (skillFile == null || !skillFile.exists()) return@mapNotNull null

                val description = extractDescription(skillFile)
                SlashCommand(entry.name, description ?: "User skill")
            } ?: emptyList()
        }

        private fun extractDescription(skillFile: File): String? {
            // Read first 20 lines looking for a description or first paragraph
            val lines = skillFile.readLines().take(20)
            // Look for "description:" in frontmatter
            for (line in lines) {
                if (line.trimStart().startsWith("description:")) {
                    return line.substringAfter("description:").trim().removeSurrounding("\"")
                }
            }
            // Fallback: first non-empty, non-frontmatter line after "---"
            var pastFrontmatter = false
            for (line in lines) {
                if (line.trim() == "---") {
                    pastFrontmatter = !pastFrontmatter
                    continue
                }
                if (pastFrontmatter && line.isNotBlank() && !line.startsWith("#")) {
                    return line.trim().take(80)
                }
            }
            return null
        }
    }
}
