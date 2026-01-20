package com.github.claudecodegui.ui;

// ClaudeChatWindow is now in the same package (com.github.claudecodegui.ui)
import com.intellij.openapi.project.Project;

/**
 * Registry interface for managing ClaudeChatWindow instances.
 * Implemented by ClaudeSDKToolWindow to maintain the project-to-window mapping.
 */
public interface ChatWindowRegistry {
    /**
     * Register a chat window for a project.
     * If a window already exists for the project, disposes the old one first.
     *
     * @param project the project
     * @param window  the chat window to register
     */
    void registerWindow(Project project, ClaudeChatWindow window);

    /**
     * Unregister a chat window for a project.
     * Only removes if the current registered window matches the provided one.
     *
     * @param project the project
     * @param window  the chat window to unregister
     */
    void unregisterWindow(Project project, ClaudeChatWindow window);

    /**
     * Get the chat window for a project.
     *
     * @param project the project
     * @return the chat window, or null if none registered
     */
    ClaudeChatWindow getWindow(Project project);
}
