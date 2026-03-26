package com.github.claudecodegui

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import java.awt.Component
import java.awt.Dimension
import java.awt.Font
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

data class PermissionRequest(
    val action: String,   // "execute this bash command", "read this file", etc.
    val detail: String,   // the command/path being acted on
)

private enum class CaptureMode { NONE, QUESTION, PERMISSION }

// ── Parser ──

class CliOutputParser {
    private val log = Logger.getInstance(CliOutputParser::class.java)
    private val buffer = StringBuilder()
    private var captureMode = CaptureMode.NONE
    private var captureStartTime = 0L

    var onQuestion: ((ParsedQuestion) -> Unit)? = null
    var onPermission: ((PermissionRequest) -> Unit)? = null

    private val ansiRegex = Regex("""\u001b(?:\[[0-9;?]*[a-zA-Z]|\][^\u0007]*\u0007|[()][0-9A-B]|[=>])""")

    fun feed(rawText: String) {
        val text = ansiRegex.replace(rawText, "")

        // Start markers — permission check takes priority (it contains no ☐)
        if (captureMode == CaptureMode.NONE) {
            when {
                text.contains("Do you want to allow Claude") -> {
                    log.warn("[PARSER] Permission prompt start detected")
                    captureMode = CaptureMode.PERMISSION
                    buffer.clear()
                    captureStartTime = System.currentTimeMillis()
                }
                text.contains("☐") -> {
                    log.warn("[PARSER] AskUserQuestion start detected")
                    captureMode = CaptureMode.QUESTION
                    buffer.clear()
                    captureStartTime = System.currentTimeMillis()
                }
            }
        }

        if (captureMode == CaptureMode.NONE) return

        buffer.append(text)

        if (System.currentTimeMillis() - captureStartTime > 30_000) {
            log.warn("[PARSER] Capture timed out (mode=$captureMode)")
            captureMode = CaptureMode.NONE
            buffer.clear()
            return
        }

        when (captureMode) {
            CaptureMode.QUESTION -> {
                if (buffer.contains("────")) {
                    captureMode = CaptureMode.NONE
                    try {
                        parseQuestion(buffer.toString())?.let { onQuestion?.invoke(it) }
                    } catch (e: Exception) {
                        log.warn("[PARSER] Failed to parse AskUserQuestion: ${e.message}")
                    }
                    buffer.clear()
                }
            }
            CaptureMode.PERMISSION -> {
                // End: we have all 3 options (option 3 = "No, and tell Claude")
                if (buffer.contains("3.") && buffer.contains("No")) {
                    captureMode = CaptureMode.NONE
                    try {
                        parsePermission(buffer.toString())?.let { onPermission?.invoke(it) }
                    } catch (e: Exception) {
                        log.warn("[PARSER] Failed to parse permission prompt: ${e.message}")
                    }
                    buffer.clear()
                }
            }
            CaptureMode.NONE -> {}
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
        log.warn("[PARSER] AskUserQuestion: '${question.title}' with ${options.size} options")
        return question
    }

    private fun parsePermission(raw: String): PermissionRequest? {
        val lines = raw.lines().map { it.trim() }.filter { it.isNotEmpty() }

        // Find "Do you want to allow Claude to X?" line
        val actionLine = lines.firstOrNull { it.contains("Do you want to allow Claude") } ?: return null
        val action = actionLine
            .substringAfter("allow Claude to", "")
            .trimEnd('?')
            .trim()
            .ifEmpty { "perform this action" }

        // Everything between the action line and the first option is the detail (command/path)
        val actionIdx = lines.indexOf(actionLine)
        val firstOptionIdx = lines.indexOfFirst { it.matches(Regex("""[❯\s]*1\..+""")) }
        val detail = if (firstOptionIdx > actionIdx + 1)
            lines.subList(actionIdx + 1, firstOptionIdx).joinToString("\n")
        else ""

        log.warn("[PARSER] Permission: action='$action' detail='${detail.take(100)}'")
        return PermissionRequest(action, detail)
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

// ── Permission Dialog ──

enum class PermissionChoice { ALLOW_ONCE, ALLOW_ALWAYS, DENY }

class PermissionDialog(
    project: Project,
    private val request: PermissionRequest,
) : DialogWrapper(project) {

    private var choice = PermissionChoice.ALLOW_ONCE

    init {
        title = "Claude Permission Request"
        setOKButtonText("Allow Once")
        setCancelButtonText("Deny")
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createEmptyBorder(8, 8, 8, 8)

        val heading = JLabel("<html><b>Claude wants to ${request.action}</b></html>")
        heading.alignmentX = Component.LEFT_ALIGNMENT
        panel.add(heading)

        if (request.detail.isNotBlank()) {
            panel.add(Box.createVerticalStrut(8))
            val detail = JTextArea(request.detail).apply {
                isEditable = false
                lineWrap = true
                wrapStyleWord = true
                font = Font("JetBrains Mono", Font.PLAIN, 12)
                background = UIManager.getColor("Panel.background")
                border = BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(UIManager.getColor("Separator.foreground")),
                    BorderFactory.createEmptyBorder(4, 6, 4, 6),
                )
                alignmentX = Component.LEFT_ALIGNMENT
            }
            panel.add(detail)
        }

        panel.add(Box.createVerticalStrut(12))

        val group = ButtonGroup()
        listOf(
            "Allow once" to PermissionChoice.ALLOW_ONCE,
            "Always allow for this session" to PermissionChoice.ALLOW_ALWAYS,
            "Deny" to PermissionChoice.DENY,
        ).forEachIndexed { idx, (label, value) ->
            val radio = JRadioButton(label).apply {
                isSelected = idx == 0
                alignmentX = Component.LEFT_ALIGNMENT
                addActionListener { choice = value }
            }
            group.add(radio)
            panel.add(radio)
        }

        panel.preferredSize = Dimension(440, panel.preferredSize.height)
        return panel
    }

    fun getChoice(): PermissionChoice = choice

    // Override OK/Cancel to both close — actual choice read via getChoice()
    override fun createActions(): Array<Action> = arrayOf(okAction, cancelAction)
    override fun doOKAction() {
        if (choice == PermissionChoice.DENY) choice = PermissionChoice.DENY
        super.doOKAction()
    }
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
