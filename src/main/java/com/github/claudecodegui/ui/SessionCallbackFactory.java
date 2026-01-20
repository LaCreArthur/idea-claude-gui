package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.permission.PermissionRequest;
import com.github.claudecodegui.util.JsUtils;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.vfs.VirtualFileManager;

import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Factory for creating ClaudeSession.SessionCallback instances.
 * Extracts callback logic from ClaudeChatWindow to reduce file size.
 */
public class SessionCallbackFactory {
    private static final Logger LOG = Logger.getInstance(SessionCallbackFactory.class);

    /**
     * Dependencies needed for the session callback.
     */
    public interface Dependencies {
        /** Get the streaming message handler */
        StreamingMessageHandler getStreamingHandler();

        /** Get the slash command manager */
        SlashCommandManager getSlashCommandManager();

        /** Call JavaScript function with given name and arguments */
        void callJavaScript(String function, String... args);

        /** Show permission dialog for the given request */
        void showPermissionDialog(PermissionRequest request);
    }

    /**
     * Creates a SessionCallback configured with the given dependencies.
     *
     * @param deps Dependencies for the callback
     * @return A configured SessionCallback instance
     */
    public static ClaudeSession.SessionCallback create(Dependencies deps) {
        return new ClaudeSession.SessionCallback() {
            @Override
            public void onMessageUpdate(List<ClaudeSession.Message> messages) {
                // Always use throttled update mechanism to prevent excessive refreshes
                deps.getStreamingHandler().enqueueUpdate(messages);
            }

            @Override
            public void onStateChange(boolean busy, boolean loading, String error) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("showLoading", String.valueOf(loading));
                    if (error != null) {
                        deps.callJavaScript("updateStatus", JsUtils.escapeJs("错误: " + error));
                    }
                    if (!busy && !loading) {
                        VirtualFileManager.getInstance().asyncRefresh(null);
                    }
                });
            }

            @Override
            public void onSessionIdReceived(String sessionId) {
                LOG.info("Session ID: " + sessionId);
                // Send sessionId to frontend for rewind feature
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("setSessionId", JsUtils.escapeJs(sessionId));
                });
            }

            @Override
            public void onPermissionRequested(PermissionRequest request) {
                ApplicationManager.getApplication().invokeLater(() -> deps.showPermissionDialog(request));
            }

            @Override
            public void onThinkingStatusChanged(boolean isThinking) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("showThinkingStatus", String.valueOf(isThinking));
                    LOG.debug("Thinking status changed: " + isThinking);
                });
            }

            @Override
            public void onSlashCommandsReceived(List<String> slashCommands) {
                // Don't send old format (string array) commands to frontend
                // Reason:
                // 1. On init we already got full command list (with description) from getSlashCommands()
                // 2. Here we receive old format (only command names, no descriptions)
                // 3. Sending to frontend would overwrite the full command list, losing descriptions
                int incomingCount = slashCommands != null ? slashCommands.size() : 0;
                LOG.debug("onSlashCommandsReceived called (old format, ignored). incoming=" + incomingCount);

                // Record receipt but don't send to frontend
                if (slashCommands != null && !slashCommands.isEmpty() && !deps.getSlashCommandManager().isSlashCommandsFetched()) {
                    LOG.debug("Received " + incomingCount + " slash commands (old format), but keeping existing commands with descriptions");
                }
            }

            @Override
            public void onSummaryReceived(String summary) {
                LOG.debug("Summary received: " + (summary != null ? summary.substring(0, Math.min(50, summary.length())) : "null"));
            }

            @Override
            public void onNodeLog(String log) {
                LOG.debug("Node log: " + (log != null ? log.substring(0, Math.min(100, log.length())) : "null"));
            }

            // ===== Streaming callbacks =====

            @Override
            public void onStreamStart() {
                deps.getStreamingHandler().setStreamActive(true);
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("onStreamStart");
                    LOG.debug("Stream started - notified frontend");
                });
            }

            @Override
            public void onStreamEnd() {
                deps.getStreamingHandler().setStreamActive(false);
                deps.getStreamingHandler().flushUpdates(() -> {
                    deps.callJavaScript("onStreamEnd");
                    LOG.debug("Stream ended - notified frontend");
                });
            }

            @Override
            public void onContentDelta(String delta) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("onContentDelta", JsUtils.escapeJs(delta));
                });
            }

            @Override
            public void onThinkingDelta(String delta) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    deps.callJavaScript("onThinkingDelta", JsUtils.escapeJs(delta));
                });
            }
        };
    }
}
