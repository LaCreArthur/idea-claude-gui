package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSDKToolWindow;
import com.github.claudecodegui.util.JsUtils;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Handles code snippet operations for ClaudeChatWindow.
 * Manages adding code selections to the chat context bar and input box.
 */
public class CodeSnippetHandler {
    private static final Logger LOG = Logger.getInstance(CodeSnippetHandler.class);

    /**
     * Dependencies interface for dependency injection.
     */
    public interface Dependencies {
        boolean isDisposed();
        boolean isInitialized();
        void callJavaScript(String function, String... args);
    }

    private final Dependencies deps;

    public CodeSnippetHandler(Dependencies deps) {
        this.deps = deps;
    }

    /**
     * Update ContextBar - called by automatic editor listener.
     * Only updates the gray context bar display, doesn't add code snippet tags.
     */
    public void addSelectionInfo(String selectionInfo) {
        if (selectionInfo != null && !selectionInfo.isEmpty()) {
            deps.callJavaScript("addSelectionInfo", JsUtils.escapeJs(selectionInfo));
        }
    }

    /**
     * Add code snippet to input box - called by right-click "Send to GUI".
     * Adds code snippet tag inside the input box.
     */
    public void addCodeSnippet(String selectionInfo) {
        if (selectionInfo != null && !selectionInfo.isEmpty()) {
            deps.callJavaScript("addCodeSnippet", JsUtils.escapeJs(selectionInfo));
        }
    }

    /**
     * Clear selection info from the context bar.
     */
    public void clearSelectionInfo() {
        deps.callJavaScript("clearSelectionInfo");
    }

    /**
     * Add code snippet from external source (right-click menu).
     * Calls addCodeSnippet rather than addSelectionInfo.
     */
    public static void addSelectionFromExternal(Project project, String selectionInfo) {
        if (project == null) {
            LOG.error("project parameter is null");
            return;
        }

        ClaudeChatWindow window = ClaudeSDKToolWindow.getChatWindow(project);
        if (window == null) {
            // If window doesn't exist, automatically open the tool window
            LOG.info("Window instance doesn't exist, auto-opening tool window: " + project.getName());
            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    ToolWindow toolWindow = ToolWindowManager.getInstance(project).getToolWindow("CCG");
                    if (toolWindow != null) {
                        toolWindow.show(null);
                        // Use proper delayed retry mechanism
                        scheduleCodeSnippetRetry(project, selectionInfo, 3);
                    } else {
                        LOG.error("Cannot find CCG tool window");
                    }
                } catch (Exception e) {
                    LOG.error("Error opening tool window: " + e.getMessage());
                }
            });
            return;
        }

        if (window.isDisposed()) {
            ClaudeSDKToolWindow.removeChatWindow(project);
            return;
        }

        if (!window.isInitialized()) {
            // Use proper retry mechanism instead of Thread.sleep on EDT
            scheduleCodeSnippetRetry(project, selectionInfo, 3);
            return;
        }

        // From external call, use addCodeSnippet to add code snippet tag
        window.getCodeSnippetHandler().addCodeSnippet(selectionInfo);
    }

    /**
     * Schedule code snippet addition with retry mechanism using ScheduledExecutorService.
     * Uses exponential backoff (200ms, 400ms, 800ms) to avoid resource waste.
     */
    private static void scheduleCodeSnippetRetry(Project project, String selectionInfo, int retriesLeft) {
        if (retriesLeft <= 0) {
            LOG.warn("Failed to add code snippet after max retries");
            return;
        }

        // Calculate delay with exponential backoff (200ms, 400ms, 800ms)
        int delay = 200 * (int) Math.pow(2, 3 - retriesLeft);

        AppExecutorUtil.getAppScheduledExecutorService().schedule(() -> {
            ApplicationManager.getApplication().invokeLater(() -> {
                if (project.isDisposed()) {
                    return;
                }
                ClaudeChatWindow retryWindow = ClaudeSDKToolWindow.getChatWindow(project);
                if (retryWindow != null && retryWindow.isInitialized() && !retryWindow.isDisposed()) {
                    retryWindow.getCodeSnippetHandler().addCodeSnippet(selectionInfo);
                } else {
                    LOG.debug("Window not ready, retrying (retries left: " + (retriesLeft - 1) + ")");
                    scheduleCodeSnippetRetry(project, selectionInfo, retriesLeft - 1);
                }
            });
        }, delay, TimeUnit.MILLISECONDS);
    }
}
