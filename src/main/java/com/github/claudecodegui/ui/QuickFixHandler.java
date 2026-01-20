package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.github.claudecodegui.util.JsUtils;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.List;

/**
 * Handles QuickFix message processing for ClaudeChatWindow.
 * Manages the sending of QuickFix prompts to the Claude session,
 * including handling cases where the frontend is not yet ready.
 */
public class QuickFixHandler {
    private static final Logger LOG = Logger.getInstance(QuickFixHandler.class);

    /**
     * Callback interface for QuickFix dependencies.
     */
    public interface Dependencies {
        /** Get the current Claude session */
        ClaudeSession getSession();
        /** Check if the handler is disposed */
        boolean isDisposed();
        /** Check if frontend is ready to receive messages */
        boolean isFrontendReady();
        /** Call a JavaScript function on the frontend */
        void callJavaScript(String function, String... args);
    }

    private final Dependencies deps;

    // Pending QuickFix message (waiting for frontend to be ready)
    private volatile String pendingPrompt = null;
    private volatile MessageCallback pendingCallback = null;

    public QuickFixHandler(Dependencies deps) {
        this.deps = deps;
    }

    /**
     * Get the pending prompt, if any.
     */
    public String getPendingPrompt() {
        return pendingPrompt;
    }

    /**
     * Get the pending callback, if any.
     */
    public MessageCallback getPendingCallback() {
        return pendingCallback;
    }

    /**
     * Check if there's a pending QuickFix message.
     */
    public boolean hasPending() {
        return pendingPrompt != null && pendingCallback != null;
    }

    /**
     * Clear pending QuickFix message.
     */
    public void clearPending() {
        pendingPrompt = null;
        pendingCallback = null;
    }

    /**
     * Send a QuickFix message.
     * If frontend is not ready, queues the message for later processing.
     *
     * @param prompt The prompt to send
     * @param isQuickFix Whether this is a QuickFix request
     * @param callback Callback for completion/error
     */
    public void sendQuickFixMessage(String prompt, boolean isQuickFix, MessageCallback callback) {
        ClaudeSession session = deps.getSession();
        if (session == null) {
            LOG.warn("QuickFix: Session is null, cannot send message");
            ApplicationManager.getApplication().invokeLater(() -> {
                callback.onError("Session not initialized. Please wait for the tool window to fully load.");
            });
            return;
        }

        session.getContextCollector().setQuickFix(isQuickFix);

        // If frontend is not ready yet, queue the message for later processing
        if (!deps.isFrontendReady()) {
            LOG.info("QuickFix: Frontend not ready, queuing message for later");
            pendingPrompt = prompt;
            pendingCallback = callback;
            return;
        }

        // Frontend is ready, execute immediately
        executeInternal(prompt, callback);
    }

    /**
     * Execute pending QuickFix message after frontend is ready.
     * Called when frontend_ready signal is received.
     */
    public void executePending() {
        if (!hasPending()) {
            return;
        }

        String prompt = pendingPrompt;
        MessageCallback callback = pendingCallback;
        clearPending();

        ClaudeSession session = deps.getSession();
        if (session == null || deps.isDisposed()) {
            ApplicationManager.getApplication().invokeLater(() -> {
                callback.onError("Session not available");
            });
            return;
        }

        executeInternal(prompt, callback);
    }

    /**
     * Internal method to execute QuickFix message.
     */
    private void executeInternal(String prompt, MessageCallback callback) {
        // Immediately show user message in frontend before sending
        // Set loading state to disable send button during AI response
        String escapedPrompt = JsUtils.escapeJs(prompt);
        deps.callJavaScript("addUserMessage", escapedPrompt);
        deps.callJavaScript("showLoading", "true");

        ClaudeSession session = deps.getSession();
        session.send(prompt).thenRun(() -> {
            List<ClaudeSession.Message> messages = session.getMessages();
            if (!messages.isEmpty()) {
                ClaudeSession.Message last = messages.get(messages.size() - 1);
                if (last.type == ClaudeSession.Message.Type.ASSISTANT && last.content != null) {
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callback.onComplete(SDKResult.success(last.content));
                    });
                }
            }
        }).exceptionally(ex -> {
            ApplicationManager.getApplication().invokeLater(() -> {
                callback.onError(ex.getMessage());
            });
            return null;
        });
    }
}
