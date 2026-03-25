package com.github.claudecodegui

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.terminal.frontend.toolwindow.TerminalToolWindowTabsManager
import com.intellij.terminal.frontend.view.TerminalView
import com.intellij.terminal.frontend.view.TerminalViewSessionState
import com.intellij.ui.content.ContentFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.jetbrains.plugins.terminal.view.TerminalContentChangeEvent
import org.jetbrains.plugins.terminal.view.TerminalOutputModelListener
import java.awt.*
import java.awt.event.ActionEvent
import java.awt.event.KeyEvent
import javax.swing.*

class ClaudeToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = ClaudePanel(project, toolWindow.disposable)
        val content = ContentFactory.getInstance().createContent(panel, "Claude", false)
        content.isCloseable = false
        toolWindow.contentManager.addContent(content)
    }
}

class ClaudePanel(
    private val project: Project,
    parentDisposable: Disposable,
) : JPanel(BorderLayout()), Disposable {

    private val log = Logger.getInstance(ClaudePanel::class.java)
    private var terminalView: TerminalView? = null
    private val terminalContainer = JPanel(BorderLayout())
    private val inputArea = JTextArea(3, 80)
    private val statusLabel = JLabel("  Starting...")
    private lateinit var slashCompletion: SlashCommandCompletion
    private val outputParser = CliOutputParser()

    /** Tracks whether output is actively streaming */
    @Volatile private var lastOutputTime = 0L
    private val activityTimer: Timer

    init {
        Disposer.register(parentDisposable, this)

        launchClaude()

        slashCompletion = SlashCommandCompletion(inputArea) { cmd ->
            inputArea.text = "/${cmd.name} "
            inputArea.caretPosition = inputArea.text.length
        }

        outputParser.onQuestion = { question -> showAskUserDialog(question) }

        val inputBar = buildInputBar()

        add(terminalContainer, BorderLayout.CENTER)
        add(inputBar, BorderLayout.SOUTH)

        // Poll activity state every 500ms to update status label
        activityTimer = Timer(500) { updateStatus() }
        activityTimer.start()
    }

    private fun launchClaude() {
        // Clear old terminal if restarting
        terminalContainer.removeAll()
        terminalView = null
        updateStatusText("Starting...")

        val tabsManager = TerminalToolWindowTabsManager.getInstance(project)
        val tab = tabsManager.createTabBuilder()
            .workingDirectory(project.basePath)
            .tabName("Claude")
            .shouldAddToToolWindow(false)
            .deferSessionStartUntilUiShown(true)
            .requestFocus(true)
            .createTab()

        terminalView = tab.view
        terminalContainer.add(tab.view.component, BorderLayout.CENTER)
        terminalContainer.revalidate()
        terminalContainer.repaint()

        val view = tab.view

        // Launch claude + wire output listener + watch for exit
        view.coroutineScope.launch {
            view.sessionState.first { it is TerminalViewSessionState.Running }
            updateStatusText("Launching Claude...")
            view.createSendTextBuilder().shouldExecute().send("claude")

            // Wire output listener once running
            wireOutputListener(view)

            // Watch for session termination → auto-restart
            view.sessionState.first { it is TerminalViewSessionState.Terminated }
            updateStatusText("Session ended. Restarting...")
            delay(1500)
            SwingUtilities.invokeLater { launchClaude() }
        }
    }

    private fun wireOutputListener(view: TerminalView) {
        view.outputModels.regular.addListener(this, object : TerminalOutputModelListener {
            override fun afterContentChanged(event: TerminalContentChangeEvent) {
                if (event.isTypeAhead || event.isTrimming) return
                lastOutputTime = System.currentTimeMillis()

                val newText = event.newText.toString()
                if (newText.isNotBlank()) {
                    log.warn("[CLAUDE_OUTPUT] new=${newText.take(500).replace("\n", "\\n")}")
                    outputParser.feed(newText)
                }
            }
        })
    }

    private fun showAskUserDialog(question: ParsedQuestion) {
        SwingUtilities.invokeLater {
            val dialog = AskUserQuestionDialog(project, question)
            if (dialog.showAndGet()) {
                answerQuestion(dialog.getSelectedOptionIndex(), dialog.isFreeTextSelected(), dialog.getFreeText())
            }
        }
    }

    private fun answerQuestion(optionIndex: Int, isFreeText: Boolean, freeText: String) {
        val view = terminalView ?: return
        log.warn("[CLAUDE_ANSWER] optionIndex=$optionIndex isFreeText=$isFreeText freeText='$freeText'")

        view.coroutineScope.launch {
            delay(200) // let dialog close

            // Navigate down to the selected option (option 0 = already selected)
            repeat(optionIndex) {
                log.warn("[CLAUDE_ANSWER] sending DOWN arrow")
                view.createSendTextBuilder().send("\u001b[B") // Down arrow escape sequence
                delay(100)
            }

            // Press Enter to select
            log.warn("[CLAUDE_ANSWER] sending ENTER")
            view.createSendTextBuilder().send("\r") // Enter/carriage return
            delay(100)

            // If free text option, type the answer after the prompt switches to text input
            if (isFreeText && freeText.isNotEmpty()) {
                delay(300)
                log.warn("[CLAUDE_ANSWER] sending free text: '$freeText'")
                view.createSendTextBuilder().shouldExecute().send(freeText)
            }
        }
    }

    private fun updateStatus() {
        val view = terminalView ?: return
        val state = view.sessionState.value

        when {
            state is TerminalViewSessionState.Terminated -> updateStatusText("Session ended")
            state is TerminalViewSessionState.NotStarted -> updateStatusText("Starting...")
            lastOutputTime == 0L -> updateStatusText("Ready")
            System.currentTimeMillis() - lastOutputTime < 1000 -> updateStatusText("Generating...")
            else -> updateStatusText("Ready")
        }
    }

    private fun updateStatusText(text: String) {
        SwingUtilities.invokeLater {
            statusLabel.text = "  $text"
        }
    }

    fun sendText(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        val view = terminalView ?: return

        view.createSendTextBuilder()
            .shouldExecute()
            .send(trimmed)

        inputArea.text = ""
        view.preferredFocusableComponent.requestFocusInWindow()
    }

    fun appendToInput(text: String) {
        inputArea.append(text)
        inputArea.requestFocusInWindow()
        inputArea.caretPosition = inputArea.document.length
    }

    private fun buildInputBar(): JPanel {
        val bar = JPanel(BorderLayout())
        bar.border = BorderFactory.createCompoundBorder(
            BorderFactory.createMatteBorder(1, 0, 0, 0, UIManager.getColor("Separator.foreground")),
            BorderFactory.createEmptyBorder(4, 6, 4, 6),
        )

        inputArea.lineWrap = true
        inputArea.wrapStyleWord = true
        inputArea.font = Font("JetBrains Mono", Font.PLAIN, 13)
        inputArea.border = BorderFactory.createEmptyBorder(4, 4, 4, 4)

        val sendKey = "send-prompt"
        val mask = Toolkit.getDefaultToolkit().menuShortcutKeyMaskEx
        inputArea.getInputMap(JComponent.WHEN_FOCUSED)
            .put(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, mask), sendKey)
        inputArea.actionMap.put(sendKey, object : AbstractAction() {
            override fun actionPerformed(e: ActionEvent) = sendText(inputArea.text)
        })

        inputArea.getInputMap(JComponent.WHEN_FOCUSED)
            .put(KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE, 0), "escape")
        inputArea.actionMap.put("escape", object : AbstractAction() {
            override fun actionPerformed(e: ActionEvent) {
                inputArea.text = ""
                terminalView?.preferredFocusableComponent?.requestFocusInWindow()
            }
        })

        val scroll = JScrollPane(inputArea)
        scroll.preferredSize = Dimension(0, 72)
        scroll.border = BorderFactory.createEmptyBorder()

        val sendBtn = JButton("Send")
        sendBtn.addActionListener { sendText(inputArea.text) }

        // Status label styling
        statusLabel.font = Font("JetBrains Mono", Font.ITALIC, 11)
        statusLabel.foreground = UIManager.getColor("Component.infoForeground")
            ?: Color.GRAY

        val rightPanel = JPanel()
        rightPanel.layout = BoxLayout(rightPanel, BoxLayout.Y_AXIS)
        rightPanel.border = BorderFactory.createEmptyBorder(0, 6, 0, 0)
        rightPanel.add(sendBtn)
        rightPanel.add(Box.createVerticalStrut(4))
        rightPanel.add(statusLabel)

        bar.add(scroll, BorderLayout.CENTER)
        bar.add(rightPanel, BorderLayout.EAST)
        return bar
    }

    override fun dispose() {
        activityTimer.stop()
    }
}
