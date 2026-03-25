package com.github.claudecodegui

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.wm.ToolWindowManager

/**
 * Cmd+Alt+K: send editor selection to the Claude input bar.
 */
class SendSelectionAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val selectedText = editor.selectionModel.selectedText ?: return

        val startLine = editor.document.getLineNumber(editor.selectionModel.selectionStart) + 1
        val endLine = editor.document.getLineNumber(editor.selectionModel.selectionEnd) + 1
        val relativePath = file.path.removePrefix(project.basePath ?: "").removePrefix("/")

        val range = if (startLine == endLine) "L$startLine" else "L$startLine-L$endLine"
        val formatted = "@$relativePath#$range\n```\n$selectedText\n```\n"

        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Claude") ?: return
        toolWindow.show {
            val content = toolWindow.contentManager.getContent(0) ?: return@show
            val panel = content.component as? ClaudePanel ?: return@show
            panel.appendToInput(formatted)
        }
    }

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = editor?.selectionModel?.hasSelection() == true
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT
}
