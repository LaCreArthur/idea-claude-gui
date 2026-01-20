package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.handler.SettingsHandler;
import com.github.claudecodegui.util.JsUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.ui.jcef.JBCefBrowser;

import java.util.List;
import java.util.function.Supplier;

/**
 * Tracks and updates token usage statistics for Claude sessions.
 * Extracts usage info from message responses and pushes updates to the webview.
 */
public class UsageTracker {
    private static final Logger LOG = Logger.getInstance(UsageTracker.class);
    private static final Gson GSON = new Gson();

    /**
     * Dependencies interface for UsageTracker.
     */
    public interface Dependencies {
        boolean isDisposed();
        JBCefBrowser getBrowser();
        String getCurrentModel();
    }

    private final Dependencies deps;

    public UsageTracker(Dependencies deps) {
        this.deps = deps;
    }

    /**
     * Push usage update from messages to the frontend.
     * Extracts usage info from the last assistant message and sends to webview.
     */
    public void pushUsageUpdateFromMessages(List<ClaudeSession.Message> messages) {
        try {
            LOG.debug("pushUsageUpdateFromMessages called with " + messages.size() + " messages");

            JsonObject lastUsage = findLastUsageInfo(messages);

            if (lastUsage == null) {
                LOG.debug("No usage info found in messages");
            }

            int inputTokens = getIntOrDefault(lastUsage, "input_tokens", 0);
            int cacheWriteTokens = getIntOrDefault(lastUsage, "cache_creation_input_tokens", 0);
            int cacheReadTokens = getIntOrDefault(lastUsage, "cache_read_input_tokens", 0);
            int outputTokens = getIntOrDefault(lastUsage, "output_tokens", 0);

            int usedTokens = inputTokens + cacheWriteTokens + cacheReadTokens + outputTokens;
            int maxTokens = SettingsHandler.getModelContextLimit(deps.getCurrentModel());
            int percentage = Math.min(100, maxTokens > 0 ? (int) ((usedTokens * 100.0) / maxTokens) : 0);

            LOG.debug("Pushing usage update: input=" + inputTokens + ", cacheWrite=" + cacheWriteTokens +
                ", cacheRead=" + cacheReadTokens + ", output=" + outputTokens +
                ", total=" + usedTokens + ", max=" + maxTokens + ", percentage=" + percentage + "%");

            JsonObject usageUpdate = buildUsageUpdate(percentage, usedTokens, maxTokens);
            sendUsageUpdateToFrontend(usageUpdate);
        } catch (Exception e) {
            LOG.warn("Failed to push usage update: " + e.getMessage(), e);
        }
    }

    /**
     * Send a usage reset (zero tokens) to the frontend.
     * Called when creating a new session.
     */
    public void resetUsage() {
        int maxTokens = SettingsHandler.getModelContextLimit(deps.getCurrentModel());
        JsonObject usageUpdate = buildUsageUpdate(0, 0, maxTokens);
        sendUsageUpdateToFrontend(usageUpdate);
        LOG.debug("Usage reset for new session");
    }

    private JsonObject findLastUsageInfo(List<ClaudeSession.Message> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            ClaudeSession.Message msg = messages.get(i);

            if (msg.type != ClaudeSession.Message.Type.ASSISTANT || msg.raw == null) {
                continue;
            }

            // Check if usage is nested inside "message" object
            if (msg.raw.has("message")) {
                JsonObject message = msg.raw.getAsJsonObject("message");
                if (message.has("usage")) {
                    return message.getAsJsonObject("usage");
                }
            }

            // Check if usage is at root level
            if (msg.raw.has("usage")) {
                return msg.raw.getAsJsonObject("usage");
            }
        }
        return null;
    }

    private int getIntOrDefault(JsonObject json, String key, int defaultValue) {
        if (json != null && json.has(key)) {
            return json.get(key).getAsInt();
        }
        return defaultValue;
    }

    private JsonObject buildUsageUpdate(int percentage, int usedTokens, int maxTokens) {
        JsonObject usageUpdate = new JsonObject();
        usageUpdate.addProperty("percentage", percentage);
        usageUpdate.addProperty("totalTokens", usedTokens);
        usageUpdate.addProperty("limit", maxTokens);
        usageUpdate.addProperty("usedTokens", usedTokens);
        usageUpdate.addProperty("maxTokens", maxTokens);
        return usageUpdate;
    }

    private void sendUsageUpdateToFrontend(JsonObject usageUpdate) {
        String usageJson = GSON.toJson(usageUpdate);
        ApplicationManager.getApplication().invokeLater(() -> {
            JBCefBrowser browser = deps.getBrowser();
            if (browser != null && !deps.isDisposed()) {
                String js = "(function() {" +
                    "  if (typeof window.onUsageUpdate === 'function') {" +
                    "    window.onUsageUpdate('" + JsUtils.escapeJs(usageJson) + "');" +
                    "    console.log('[Backend->Frontend] Usage update sent successfully');" +
                    "  } else {" +
                    "    console.warn('[Backend->Frontend] window.onUsageUpdate not found');" +
                    "  }" +
                    "})();";
                browser.getCefBrowser().executeJavaScript(js, browser.getCefBrowser().getURL(), 0);
            }
        });
    }
}
