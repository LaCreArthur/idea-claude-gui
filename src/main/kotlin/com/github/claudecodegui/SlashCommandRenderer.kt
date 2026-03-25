package com.github.claudecodegui

import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import java.awt.Component
import javax.swing.JList
import javax.swing.ListCellRenderer

class SlashCommandRenderer : ListCellRenderer<SlashCommand> {
    private val component = SimpleColoredComponent()

    override fun getListCellRendererComponent(
        list: JList<out SlashCommand>,
        value: SlashCommand,
        index: Int,
        isSelected: Boolean,
        cellHasFocus: Boolean,
    ): Component {
        component.clear()
        component.append("/${value.name}", SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
        component.append("  ${value.description}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        if (isSelected) {
            component.background = list.selectionBackground
            component.foreground = list.selectionForeground
        } else {
            component.background = list.background
            component.foreground = list.foreground
        }
        component.isOpaque = true
        return component
    }
}
