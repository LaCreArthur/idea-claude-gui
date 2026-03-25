package com.github.claudecodegui

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import java.awt.Component
import java.awt.Dimension
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.awt.event.KeyEvent
import javax.swing.*

// ── Data ──

data class ParsedQuestion(
    val title: String,
    val body: String,
    val options: List<ParsedOption>,
)

data class ParsedOption(
    val number: Int,
    val label: String,
    val description: String = "",
    val isFreeText: Boolean = false,
)

// ── Parser ──

class CliOutputParser {
    private val log = Logger.getInstance(CliOutputParser::class.java)
    private val buffer = StringBuilder()
    private var capturing = false
    private var captureStartTime = 0L

    var onQuestion: ((ParsedQuestion) -> Unit)? = null

    private val ansiRegex = Regex("""\u001b(?:\[[0-9;?]*[a-zA-Z]|\][^\u0007]*\u0007|[()][0-9A-B]|[=>])""")

    fun feed(rawText: String) {
        val text = ansiRegex.replace(rawText, "")

        if (text.contains("☐")) {
            capturing = true
            buffer.clear()
            captureStartTime = System.currentTimeMillis()
        }

        if (capturing) {
            buffer.append(text)

            // Timeout: stop capturing after 30s
            if (System.currentTimeMillis() - captureStartTime > 30_000) {
                log.warn("AskUserQuestion capture timed out")
                capturing = false
                buffer.clear()
                return
            }

            if (buffer.contains("────")) {
                capturing = false
                try {
                    parseQuestion(buffer.toString())?.let { onQuestion?.invoke(it) }
                } catch (e: Exception) {
                    log.warn("Failed to parse AskUserQuestion: ${e.message}")
                }
                buffer.clear()
            }
        }
    }

    private fun parseQuestion(raw: String): ParsedQuestion? {
        val lines = raw.lines()

        // Title: line containing ☐
        val titleLine = lines.firstOrNull { it.contains("☐") } ?: return null
        val title = titleLine.substringAfter("☐").trim()

        val optRegex = Regex("""[❯\s]*(\d+)\.\s+(.+)""")
        val options = mutableListOf<ParsedOption>()
        val bodyLines = mutableListOf<String>()
        var foundFirstOption = false
        var lastOptionIdx = -1

        for ((i, line) in lines.withIndex()) {
            if (line.contains("☐") || line.contains("────")) continue
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue

            val match = optRegex.matchEntire(trimmed)
            if (match != null) {
                foundFirstOption = true
                val num = match.groupValues[1].toInt()
                val label = match.groupValues[2]
                val isFreeText = label.contains("Type something", ignoreCase = true)
                        || label.contains("type your", ignoreCase = true)
                options.add(ParsedOption(num, label, isFreeText = isFreeText))
                lastOptionIdx = i
            } else if (!foundFirstOption) {
                bodyLines.add(trimmed)
            } else if (lastOptionIdx >= 0 && options.isNotEmpty()) {
                // Description line for previous option (indented text after option)
                val last = options.last()
                if (last.description.isEmpty()) {
                    options[options.lastIndex] = last.copy(description = trimmed)
                }
            }
        }

        if (options.isEmpty()) return null

        val question = ParsedQuestion(title, bodyLines.joinToString("\n"), options)
        log.info("Parsed AskUserQuestion: '${question.title}' with ${options.size} options")
        return question
    }
}

// ── Dialog ──

class AskUserQuestionDialog(
    project: Project,
    private val question: ParsedQuestion,
) : DialogWrapper(project) {

    private var selectedIndex = 0
    private val freeTextField = JTextField(30)

    init {
        title = "Claude: ${question.title}"
        setOKButtonText("Answer")
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createEmptyBorder(8, 8, 8, 8)

        if (question.body.isNotBlank()) {
            val bodyLabel = JLabel("<html><p style='width:350px'>${question.body.replace("\n", "<br>")}</p></html>")
            bodyLabel.alignmentX = Component.LEFT_ALIGNMENT
            panel.add(bodyLabel)
            panel.add(Box.createVerticalStrut(12))
        }

        val group = ButtonGroup()
        question.options.forEachIndexed { idx, opt ->
            val radio = JRadioButton(opt.label).apply {
                isSelected = idx == 0
                alignmentX = Component.LEFT_ALIGNMENT
                addActionListener { selectedIndex = idx }
            }
            group.add(radio)
            panel.add(radio)

            if (opt.description.isNotBlank()) {
                val desc = JLabel(opt.description).apply {
                    foreground = UIManager.getColor("Component.infoForeground")
                    border = BorderFactory.createEmptyBorder(0, 24, 0, 0)
                    alignmentX = Component.LEFT_ALIGNMENT
                }
                panel.add(desc)
            }

            if (opt.isFreeText) {
                val textPanel = JPanel().apply {
                    layout = BoxLayout(this, BoxLayout.X_AXIS)
                    border = BorderFactory.createEmptyBorder(2, 24, 4, 0)
                    alignmentX = Component.LEFT_ALIGNMENT
                    add(freeTextField)
                }
                panel.add(textPanel)
                freeTextField.addFocusListener(object : FocusAdapter() {
                    override fun focusGained(e: FocusEvent?) {
                        radio.isSelected = true
                        selectedIndex = idx
                    }
                })
            }
            panel.add(Box.createVerticalStrut(4))
        }

        panel.preferredSize = Dimension(420, panel.preferredSize.height)
        return panel
    }

    fun getSelectedOptionIndex(): Int = selectedIndex
    fun getFreeText(): String = freeTextField.text.trim()
    fun isFreeTextSelected(): Boolean = question.options.getOrNull(selectedIndex)?.isFreeText == true
}

// ── Answer sender (dispatches key events to terminal) ──

object TerminalKeyDispatcher {
    fun dispatchKey(component: Component, keyCode: Int) {
        val now = System.currentTimeMillis()
        component.dispatchEvent(
            KeyEvent(component, KeyEvent.KEY_PRESSED, now, 0, keyCode, KeyEvent.CHAR_UNDEFINED)
        )
        component.dispatchEvent(
            KeyEvent(component, KeyEvent.KEY_RELEASED, now + 1, 0, keyCode, KeyEvent.CHAR_UNDEFINED)
        )
    }
}
