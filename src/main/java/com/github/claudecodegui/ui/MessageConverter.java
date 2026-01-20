package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Utility class for converting messages to JSON format for transport to the webview.
 * Handles truncation of large tool results to prevent memory issues.
 */
public final class MessageConverter {

    private static final int MAX_TOOL_RESULT_CHARS = 20000;

    private MessageConverter() {
        // Utility class - prevent instantiation
    }

    /**
     * Converts a list of messages to JSON string for transport to the webview.
     * Large tool results are truncated to prevent memory issues.
     *
     * @param messages The list of messages to convert
     * @return JSON string representation of the messages
     */
    public static String convertMessagesToJson(List<ClaudeSession.Message> messages) {
        Gson gson = new Gson();
        JsonArray messagesArray = new JsonArray();
        for (ClaudeSession.Message msg : messages) {
            JsonObject msgObj = new JsonObject();
            msgObj.addProperty("type", msg.type.toString().toLowerCase());
            msgObj.addProperty("timestamp", msg.timestamp);
            msgObj.addProperty("content", msg.content != null ? msg.content : "");
            if (msg.raw != null) {
                msgObj.add("raw", truncateRawForTransport(msg.raw));
            }
            messagesArray.add(msgObj);
        }
        return gson.toJson(messagesArray);
    }

    /**
     * Truncates large tool_result content blocks in a raw JSON message object.
     * This prevents memory/performance issues when sending large outputs to the webview.
     *
     * @param raw The raw JSON object to process
     * @return The original object if no truncation needed, or a deep copy with truncated content
     */
    public static JsonObject truncateRawForTransport(JsonObject raw) {
        JsonElement contentEl = null;
        if (raw.has("content")) {
            contentEl = raw.get("content");
        } else if (raw.has("message") && raw.get("message").isJsonObject()) {
            JsonObject message = raw.getAsJsonObject("message");
            if (message.has("content")) {
                contentEl = message.get("content");
            }
        }

        if (contentEl == null || !contentEl.isJsonArray()) {
            return raw;
        }

        JsonArray contentArr = contentEl.getAsJsonArray();
        boolean needsCopy = false;
        for (JsonElement el : contentArr) {
            if (!el.isJsonObject()) continue;
            JsonObject block = el.getAsJsonObject();
            if (!block.has("type") || block.get("type").isJsonNull()) continue;
            if (!"tool_result".equals(block.get("type").getAsString())) continue;
            if (!block.has("content") || block.get("content").isJsonNull()) continue;
            JsonElement c = block.get("content");
            if (c.isJsonPrimitive() && c.getAsJsonPrimitive().isString()) {
                String s = c.getAsString();
                if (s.length() > MAX_TOOL_RESULT_CHARS) {
                    needsCopy = true;
                    break;
                }
            }
        }

        if (!needsCopy) {
            return raw;
        }

        JsonObject copied = raw.deepCopy();
        JsonElement copiedContentEl = null;
        if (copied.has("content")) {
            copiedContentEl = copied.get("content");
        } else if (copied.has("message") && copied.get("message").isJsonObject()) {
            JsonObject message = copied.getAsJsonObject("message");
            if (message.has("content")) {
                copiedContentEl = message.get("content");
            }
        }

        if (copiedContentEl == null || !copiedContentEl.isJsonArray()) {
            return copied;
        }

        JsonArray copiedArr = copiedContentEl.getAsJsonArray();
        for (JsonElement el : copiedArr) {
            if (!el.isJsonObject()) continue;
            JsonObject block = el.getAsJsonObject();
            if (!block.has("type") || block.get("type").isJsonNull()) continue;
            if (!"tool_result".equals(block.get("type").getAsString())) continue;
            if (!block.has("content") || block.get("content").isJsonNull()) continue;
            JsonElement c = block.get("content");
            if (c.isJsonPrimitive() && c.getAsJsonPrimitive().isString()) {
                String s = c.getAsString();
                if (s.length() > MAX_TOOL_RESULT_CHARS) {
                    int head = (int) Math.floor(MAX_TOOL_RESULT_CHARS * 0.65);
                    int tail = MAX_TOOL_RESULT_CHARS - head;
                    String prefix = s.substring(0, Math.min(head, s.length()));
                    String suffix = tail > 0 ? s.substring(Math.max(0, s.length() - tail)) : "";
                    String truncated = prefix + "\n...\n(truncated, original length: " + s.length() + " chars)\n...\n" + suffix;
                    block.addProperty("content", truncated);
                }
            }
        }

        return copied;
    }
}
