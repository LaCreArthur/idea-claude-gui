package com.github.claudecodegui.ui;

import com.github.claudecodegui.handler.MessageDispatcher;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/**
 * Handles JavaScript bridge messages from the webview.
 * Extracted from ClaudeChatWindow for better separation of concerns.
 */
public class JsBridgeMessageHandler {
    private static final Logger LOG = Logger.getInstance(JsBridgeMessageHandler.class);
    private final Gson gson = new Gson();

    /**
     * Dependencies interface for testability.
     */
    public interface Dependencies {
        MessageDispatcher getMessageDispatcher();
        SlashCommandManager getSlashCommandManager();
        QuickFixHandler getQuickFixHandler();
        String getSessionCwd();
        boolean hasCachedSlashCommands();
        void setFrontendReady(boolean ready);
        void sendCurrentPermissionMode();
        void createNewSession();
    }

    private final Dependencies deps;

    public JsBridgeMessageHandler(Dependencies deps) {
        this.deps = deps;
    }

    /**
     * Handle a message from the JavaScript bridge.
     * @param message The raw message string from webview
     */
    public void handleMessage(String message) {
        // Handle console log forwarding
        if (message.startsWith("{\"type\":\"console.")) {
            handleConsoleLog(message);
            return;
        }

        String[] parts = message.split(":", 2);
        if (parts.length < 1) {
            LOG.error("Invalid message format");
            return;
        }

        String type = parts[0];
        String content = parts.length > 1 ? parts[1] : "";

        // Use handler dispatcher for registered handlers
        if (deps.getMessageDispatcher().dispatch(type, content)) {
            return;
        }

        // Special handling: create_new_session needs to rebuild session object
        if ("create_new_session".equals(type)) {
            deps.createNewSession();
            return;
        }

        // Special handling: frontend ready signal
        if ("frontend_ready".equals(type)) {
            handleFrontendReady();
            return;
        }

        // Special handling: refresh slash commands list
        if ("refresh_slash_commands".equals(type)) {
            handleRefreshSlashCommands();
            return;
        }

        LOG.warn("Unknown message type: " + type);
    }

    /**
     * Handle console log forwarding from webview.
     */
    private void handleConsoleLog(String message) {
        try {
            JsonObject json = gson.fromJson(message, JsonObject.class);
            String logType = json.get("type").getAsString();
            JsonArray args = json.getAsJsonArray("args");

            StringBuilder logMessage = new StringBuilder("[Webview] ");
            for (int i = 0; i < args.size(); i++) {
                if (i > 0) logMessage.append(" ");
                logMessage.append(args.get(i).toString());
            }

            if ("console.error".equals(logType)) {
                LOG.warn(logMessage.toString());
            } else if ("console.warn".equals(logType)) {
                LOG.info(logMessage.toString());
            } else {
                LOG.debug(logMessage.toString());
            }
        } catch (Exception e) {
            LOG.warn("Failed to parse console log: " + e.getMessage());
        }
    }

    /**
     * Handle frontend_ready signal from webview.
     */
    private void handleFrontendReady() {
        LOG.info("Received frontend_ready signal, frontend is now ready to receive data");
        deps.setFrontendReady(true);

        // Send current permission mode to frontend
        deps.sendCurrentPermissionMode();

        // If cache has data, send immediately
        if (deps.hasCachedSlashCommands()) {
            LOG.info("Cache has data, sending immediately");
            deps.getSlashCommandManager().sendCachedCommands();
        }

        // Process pending QuickFix message if exists
        QuickFixHandler quickFixHandler = deps.getQuickFixHandler();
        if (quickFixHandler.hasPending()) {
            LOG.info("Processing pending QuickFix message after frontend ready");
            ApplicationManager.getApplication().executeOnPooledThread(() -> {
                quickFixHandler.executePending();
            });
        }
    }

    /**
     * Handle refresh_slash_commands request from frontend.
     */
    private void handleRefreshSlashCommands() {
        LOG.info("Received refresh_slash_commands request from frontend");
        deps.getSlashCommandManager().initializeCache(deps.getSessionCwd());
    }
}
