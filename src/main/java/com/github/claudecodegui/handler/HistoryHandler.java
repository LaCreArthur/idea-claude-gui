package com.github.claudecodegui.handler;

import com.github.claudecodegui.provider.claude.ClaudeHistoryReader;
import com.github.claudecodegui.util.JsUtils;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.util.concurrent.CompletableFuture;

/**
 * 历史数据处理器
 * 处理历史数据加载和会话加载
 */
public class HistoryHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(HistoryHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "load_history_data",
        "load_session",
        "delete_session",  // 新增:删除会话
        "export_session",  // 新增:导出会话
        "toggle_favorite", // 新增:切换收藏状态
        "update_title"     // 新增:更新会话标题
    };

    // 会话加载回调接口
    public interface SessionLoadCallback {
        void onLoadSession(String sessionId, String projectPath);
    }

    private SessionLoadCallback sessionLoadCallback;
    private String currentProvider = "claude"; // 默认为 claude

    public HistoryHandler(HandlerContext context) {
        super(context);
    }

    public void setSessionLoadCallback(SessionLoadCallback callback) {
        this.sessionLoadCallback = callback;
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "load_history_data":
                LOG.debug("[HistoryHandler] Processing: load_history_data, provider=" + content);
                handleLoadHistoryData(content);
                return true;
            case "load_session":
                LOG.debug("[HistoryHandler] Processing: load_session");
                handleLoadSession(content);
                return true;
            case "delete_session":
                LOG.info("[HistoryHandler] Processing: delete_session, sessionId=" + content);
                handleDeleteSession(content);
                return true;
            case "export_session":
                LOG.info("[HistoryHandler] Processing: export_session, sessionId=" + content);
                handleExportSession(content);
                return true;
            case "toggle_favorite":
                LOG.info("[HistoryHandler] Processing: toggle_favorite, sessionId=" + content);
                handleToggleFavorite(content);
                return true;
            case "update_title":
                LOG.info("[HistoryHandler] Processing: update_title");
                handleUpdateTitle(content);
                return true;
            default:
                return false;
        }
    }

    /**
     * Load and inject history data to frontend (with favorites info)
     * @param provider Provider identifier (always "claude")
     */
    private void handleLoadHistoryData(String provider) {
        // Always use Claude
        this.currentProvider = "claude";

        CompletableFuture.runAsync(() -> {
            LOG.info("[HistoryHandler] ========== Starting to load history data ==========");

            try {
                // Using ClaudeHistoryReader to read Claude sessions
                LOG.info("[HistoryHandler] Using ClaudeHistoryReader to read Claude sessions");
                String projectPath = context.getProject().getBasePath();
                ClaudeHistoryReader historyReader = new ClaudeHistoryReader();
                String historyJson = historyReader.getProjectDataAsJson(projectPath);

                // 加载收藏数据并合并到历史数据中
                String enhancedJson = enhanceHistoryWithFavorites(historyJson);
                LOG.info("[HistoryHandler] enhanceHistoryWithFavorites 完成，JSON 长度: " + enhancedJson.length());

                // 加载自定义标题并合并到历史数据中
                String finalJson = enhanceHistoryWithTitles(enhancedJson);
                LOG.info("[HistoryHandler] enhanceHistoryWithTitles 完成，JSON 长度: " + finalJson.length());

                // 使用 Base64 编码来避免 JavaScript 字符串转义问题
                String base64Json = java.util.Base64.getEncoder().encodeToString(finalJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                LOG.info("[HistoryHandler] Base64 编码完成，长度: " + base64Json.length());

                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "console.log('[Backend->Frontend] Starting to inject history data');" +
                        "if (window.setHistoryData) { " +
                        "  try { " +
                        "    var base64Str = '" + base64Json + "'; " +
                        "    console.log('[Backend->Frontend] Base64 length:', base64Str.length); " +
                        // 使用 TextDecoder 正确解码 UTF-8 的 Base64 字符串（避免中文乱码）
                        "    var binaryStr = atob(base64Str); " +
                        "    var bytes = new Uint8Array(binaryStr.length); " +
                        "    for (var i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); } " +
                        "    var jsonStr = new TextDecoder('utf-8').decode(bytes); " +
                        "    console.log('[Backend->Frontend] Decoded JSON length:', jsonStr.length); " +
                        "    var data = JSON.parse(jsonStr); " +
                        "    console.log('[Backend->Frontend] Parsed data, sessions:', data.sessions ? data.sessions.length : 0); " +
                        "    window.setHistoryData(data); " +
                        "    console.log('[Backend->Frontend] setHistoryData called successfully'); " +
                        "  } catch(e) { " +
                        "    console.error('[Backend->Frontend] Failed to parse/set history data:', e); " +
                        "    window.setHistoryData({ success: false, error: '解析历史数据失败: ' + e.message }); " +
                        "  } " +
                        "} else { " +
                        "  console.error('[Backend->Frontend] setHistoryData not available!'); " +
                        "}";

                    context.executeJavaScriptOnEDT(jsCode);
                    LOG.info("[HistoryHandler] JavaScript 代码已注入");
                });

            } catch (Exception e) {
                LOG.error("[HistoryHandler] ❌ Failed to load history data: " + e.getMessage(), e);

                ApplicationManager.getApplication().invokeLater(() -> {
                    String errorMsg = escapeJs(e.getMessage() != null ? e.getMessage() : "未知错误");
                    String jsCode = "if (window.setHistoryData) { " +
                        "  window.setHistoryData({ success: false, error: '" + errorMsg + "' }); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * 加载历史会话
     */
    private void handleLoadSession(String sessionId) {
        String projectPath = context.getProject().getBasePath();
        LOG.info("[HistoryHandler] Loading history session: " + sessionId + " from project: " + projectPath);

        // Claude session: use existing callback mechanism
        if (sessionLoadCallback != null) {
            sessionLoadCallback.onLoadSession(sessionId, projectPath);
        } else {
            LOG.warn("[HistoryHandler] WARNING: No session load callback set");
        }
    }

    /**
     * Convert content to Claude format content blocks.
     * Handles various formats: [{type: "input_text", text: "..."}, {type: "text", text: "..."}]
     * Output: [{type: "text", text: "..."}]
     */
    private com.google.gson.JsonArray convertToClaudeContentBlocks(com.google.gson.JsonElement contentElem) {
        com.google.gson.JsonArray claudeBlocks = new com.google.gson.JsonArray();

        if (contentElem == null) {
            return claudeBlocks;
        }

        // 处理字符串类型 - 转换为单个文本块
        if (contentElem.isJsonPrimitive()) {
            com.google.gson.JsonObject textBlock = new com.google.gson.JsonObject();
            textBlock.addProperty("type", "text");
            textBlock.addProperty("text", contentElem.getAsString());
            claudeBlocks.add(textBlock);
            return claudeBlocks;
        }

        // 处理数组类型
        if (contentElem.isJsonArray()) {
            com.google.gson.JsonArray contentArray = contentElem.getAsJsonArray();

            for (com.google.gson.JsonElement item : contentArray) {
                if (item.isJsonObject()) {
                    com.google.gson.JsonObject itemObj = item.getAsJsonObject();
                    String type = itemObj.has("type") ? itemObj.get("type").getAsString() : null;

                    if (type != null) {
                        com.google.gson.JsonObject claudeBlock = new com.google.gson.JsonObject();

                        // Convert "input_text" and "output_text" to "text"
                        if ("input_text".equals(type) || "output_text".equals(type) || "text".equals(type)) {
                            claudeBlock.addProperty("type", "text");
                            if (itemObj.has("text")) {
                                claudeBlock.addProperty("text", itemObj.get("text").getAsString());
                            }
                            claudeBlocks.add(claudeBlock);
                        }
                        // Handle tool use
                        else if ("tool_use".equals(type)) {
                            claudeBlock.addProperty("type", "tool_use");
                            if (itemObj.has("id")) {
                                claudeBlock.addProperty("id", itemObj.get("id").getAsString());
                            }
                            if (itemObj.has("name")) {
                                claudeBlock.addProperty("name", itemObj.get("name").getAsString());
                            }
                            if (itemObj.has("input")) {
                                claudeBlock.add("input", itemObj.get("input"));
                            }
                            claudeBlocks.add(claudeBlock);
                        }
                        // 处理工具结果
                        else if ("tool_result".equals(type)) {
                            claudeBlock.addProperty("type", "tool_result");
                            if (itemObj.has("tool_use_id")) {
                                claudeBlock.addProperty("tool_use_id", itemObj.get("tool_use_id").getAsString());
                            }
                            if (itemObj.has("content")) {
                                claudeBlock.add("content", itemObj.get("content"));
                            }
                            if (itemObj.has("is_error")) {
                                claudeBlock.addProperty("is_error", itemObj.get("is_error").getAsBoolean());
                            }
                            claudeBlocks.add(claudeBlock);
                        }
                        // 处理思考块
                        else if ("thinking".equals(type)) {
                            claudeBlock.addProperty("type", "thinking");
                            if (itemObj.has("thinking")) {
                                claudeBlock.addProperty("thinking", itemObj.get("thinking").getAsString());
                            }
                            if (itemObj.has("text")) {
                                claudeBlock.addProperty("text", itemObj.get("text").getAsString());
                            }
                            claudeBlocks.add(claudeBlock);
                        }
                        // 处理图片
                        else if ("image".equals(type)) {
                            claudeBlock.addProperty("type", "image");
                            if (itemObj.has("src")) {
                                claudeBlock.addProperty("src", itemObj.get("src").getAsString());
                            }
                            if (itemObj.has("mediaType")) {
                                claudeBlock.addProperty("mediaType", itemObj.get("mediaType").getAsString());
                            }
                            if (itemObj.has("alt")) {
                                claudeBlock.addProperty("alt", itemObj.get("alt").getAsString());
                            }
                            claudeBlocks.add(claudeBlock);
                        }
                        // 其他未知类型，尝试保持原样
                        else {
                            claudeBlocks.add(itemObj);
                        }
                    }
                }
            }

            return claudeBlocks;
        }

        // 处理对象类型 - 作为单个块
        if (contentElem.isJsonObject()) {
            claudeBlocks.add(contentElem.getAsJsonObject());
            return claudeBlocks;
        }

        return claudeBlocks;
    }

    /**
     * Extract text content from content field.
     * Content can be a string, object, or array format.
     */
    private String extractContentAsString(com.google.gson.JsonElement contentElem) {
        if (contentElem == null) {
            return null;
        }

        // 处理字符串类型
        if (contentElem.isJsonPrimitive()) {
            return contentElem.getAsString();
        }

        // 处理数组类型
        if (contentElem.isJsonArray()) {
            com.google.gson.JsonArray contentArray = contentElem.getAsJsonArray();
            StringBuilder sb = new StringBuilder();

            for (com.google.gson.JsonElement item : contentArray) {
                if (item.isJsonObject()) {
                    com.google.gson.JsonObject itemObj = item.getAsJsonObject();

                    // 提取文本类型
                    if (itemObj.has("type") && "text".equals(itemObj.get("type").getAsString())) {
                        if (itemObj.has("text")) {
                            if (sb.length() > 0) {
                                sb.append("\n");
                            }
                            sb.append(itemObj.get("text").getAsString());
                        }
                    }
                    // Extract input_text type (user message)
                    else if (itemObj.has("type") && "input_text".equals(itemObj.get("type").getAsString())) {
                        if (itemObj.has("text")) {
                            if (sb.length() > 0) {
                                sb.append("\n");
                            }
                            sb.append(itemObj.get("text").getAsString());
                        }
                    }
                    // Extract output_text type (assistant message)
                    else if (itemObj.has("type") && "output_text".equals(itemObj.get("type").getAsString())) {
                        if (itemObj.has("text")) {
                            if (sb.length() > 0) {
                                sb.append("\n");
                            }
                            sb.append(itemObj.get("text").getAsString());
                        }
                    }
                }
            }

            return sb.toString();
        }

        // 处理对象类型
        if (contentElem.isJsonObject()) {
            com.google.gson.JsonObject contentObj = contentElem.getAsJsonObject();
            if (contentObj.has("text")) {
                return contentObj.get("text").getAsString();
            }
        }

        return null;
    }

    /**
     * Delete session history file
     * 删除指定 sessionId 的 .jsonl 文件以及相关的 agent-xxx.jsonl 文件
     */
    private void handleDeleteSession(String sessionId) {
        CompletableFuture.runAsync(() -> {
            try {
                LOG.info("[HistoryHandler] ========== Starting to delete session ==========");
                LOG.info("[HistoryHandler] SessionId: " + sessionId);

                String homeDir = System.getProperty("user.home");
                boolean mainDeleted = false;
                int agentFilesDeleted = 0;

                // Claude sessions: stored in ~/.claude/projects/{projectPath}/
                String projectPath = context.getProject().getBasePath();
                LOG.info("[HistoryHandler] ProjectPath: " + projectPath);

                java.nio.file.Path claudeDir = java.nio.file.Paths.get(homeDir, ".claude");
                java.nio.file.Path projectsDir = claudeDir.resolve("projects");

                // Normalize project path (consistent with ClaudeHistoryReader)
                String sanitizedPath = com.github.claudecodegui.util.PathUtils.sanitizePath(projectPath);
                java.nio.file.Path sessionDir = projectsDir.resolve(sanitizedPath);

                LOG.info("[HistoryHandler] Using Claude session directory: " + sessionDir);

                if (!java.nio.file.Files.exists(sessionDir)) {
                    LOG.error("[HistoryHandler] Claude project directory does not exist: " + sessionDir);
                    return;
                }

                // Delete main session file
                java.nio.file.Path mainSessionFile = sessionDir.resolve(sessionId + ".jsonl");

                if (java.nio.file.Files.exists(mainSessionFile)) {
                    java.nio.file.Files.delete(mainSessionFile);
                    LOG.info("[HistoryHandler] Deleted main session file: " + mainSessionFile.getFileName());
                    mainDeleted = true;
                } else {
                    LOG.warn("[HistoryHandler] Main session file does not exist: " + mainSessionFile.getFileName());
                }

                // Delete related agent files
                // Agent files are typically named agent-<uuid>.jsonl
                try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.list(sessionDir)) {
                    java.util.List<java.nio.file.Path> agentFiles = stream
                        .filter(path -> {
                            String filename = path.getFileName().toString();
                            // Match agent-*.jsonl files that belong to current session
                            if (!filename.startsWith("agent-") || !filename.endsWith(".jsonl")) {
                                return false;
                            }

                            // Check if agent file belongs to current session
                            return isAgentFileRelatedToSession(path, sessionId);
                        })
                        .collect(java.util.stream.Collectors.toList());

                    for (java.nio.file.Path agentFile : agentFiles) {
                        try {
                            java.nio.file.Files.delete(agentFile);
                            LOG.info("[HistoryHandler] Deleted related agent file: " + agentFile.getFileName());
                            agentFilesDeleted++;
                        } catch (Exception e) {
                            LOG.error("[HistoryHandler] Failed to delete agent file: " + agentFile.getFileName() + " - " + e.getMessage(), e);
                        }
                    }
                }

                LOG.info("[HistoryHandler] ========== 删除会话完成 ==========");
                LOG.info("[HistoryHandler] 主会话文件: " + (mainDeleted ? "已删除" : "未找到"));
                LOG.info("[HistoryHandler] Agent 文件: 删除了 " + agentFilesDeleted + " 个");

                // 清理相关的收藏和标题数据
                if (mainDeleted) {
                    try {
                        LOG.info("[HistoryHandler] 开始清理会话关联数据...");

                        // 清理收藏数据
                        callNodeJsFavoritesService("removeFavorite", sessionId);
                        LOG.info("[HistoryHandler] ✅ 已清理收藏数据");

                        // 清理标题数据
                        String deleteResult = callNodeJsDeleteTitle(sessionId);
                        LOG.info("[HistoryHandler] ✅ 已清理标题数据");

                    } catch (Exception e) {
                        LOG.warn("[HistoryHandler] ⚠️ 清理关联数据失败（不影响会话删除）: " + e.getMessage());
                    }
                }

                // 删除完成后，重新加载历史数据并推送给前端
                LOG.info("[HistoryHandler] 重新加载历史数据...");
                handleLoadHistoryData(currentProvider);

            } catch (Exception e) {
                LOG.error("[HistoryHandler] ❌ 删除会话失败: " + e.getMessage(), e);
            }
        });
    }

    /**
     * 导出会话数据
     * 读取会话的所有消息并返回给前端
     */
    private void handleExportSession(String content) {
        CompletableFuture.runAsync(() -> {
            LOG.info("[HistoryHandler] ========== 开始导出会话 ==========");

            try {
                // 解析前端传来的JSON，获取 sessionId 和 title
                com.google.gson.JsonObject exportRequest = new com.google.gson.Gson().fromJson(content, com.google.gson.JsonObject.class);
                String sessionId = exportRequest.get("sessionId").getAsString();
                String title = exportRequest.get("title").getAsString();

                String projectPath = context.getProject().getBasePath();
                LOG.info("[HistoryHandler] SessionId: " + sessionId);
                LOG.info("[HistoryHandler] Title: " + title);
                LOG.info("[HistoryHandler] ProjectPath: " + projectPath);
                // Using ClaudeHistoryReader to read Claude session messages
                LOG.info("[HistoryHandler] Using ClaudeHistoryReader to read Claude session messages");
                ClaudeHistoryReader historyReader = new ClaudeHistoryReader();
                String messagesJson = historyReader.getSessionMessagesAsJson(projectPath, sessionId);

                // 将消息包装到包含 sessionId 和 title 的对象中
                com.google.gson.JsonObject exportData = new com.google.gson.JsonObject();
                exportData.addProperty("sessionId", sessionId);
                exportData.addProperty("title", title);
                exportData.add("messages", com.google.gson.JsonParser.parseString(messagesJson));

                String wrappedJson = new com.google.gson.Gson().toJson(exportData);

                LOG.info("[HistoryHandler] 读取到会话消息，准备注入到前端");

                String escapedJson = escapeJs(wrappedJson);

                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "console.log('[Backend->Frontend] Starting to inject export data');" +
                        "if (window.onExportSessionData) { " +
                        "  try { " +
                        "    var jsonStr = '" + escapedJson + "'; " +
                        "    window.onExportSessionData(jsonStr); " +
                        "    console.log('[Backend->Frontend] Export data injected successfully'); " +
                        "  } catch(e) { " +
                        "    console.error('[Backend->Frontend] Failed to inject export data:', e); " +
                        "  } " +
                        "} else { " +
                        "  console.error('[Backend->Frontend] onExportSessionData not available!'); " +
                        "}";

                    context.executeJavaScriptOnEDT(jsCode);
                });

                LOG.info("[HistoryHandler] ========== 导出会话完成 ==========");

            } catch (Exception e) {
                LOG.error("[HistoryHandler] ❌ 导出会话失败: " + e.getMessage(), e);

                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "if (window.addToast) { " +
                        "  window.addToast('导出失败: " + escapeJs(e.getMessage() != null ? e.getMessage() : "未知错误") + "', 'error'); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * 切换收藏状态
     */
    private void handleToggleFavorite(String sessionId) {
        CompletableFuture.runAsync(() -> {
            try {
                LOG.info("[HistoryHandler] ========== 切换收藏状态 ==========");
                LOG.info("[HistoryHandler] SessionId: " + sessionId);

                // 调用 Node.js favorites-service 切换收藏状态
                String result = callNodeJsFavoritesService("toggleFavorite", sessionId);
                LOG.info("[HistoryHandler] 收藏状态切换结果: " + result);

            } catch (Exception e) {
                LOG.error("[HistoryHandler] ❌ 切换收藏状态失败: " + e.getMessage(), e);
            }
        });
    }

    /**
     * 更新会话标题
     */
    private void handleUpdateTitle(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                LOG.info("[HistoryHandler] ========== 更新会话标题 ==========");

                // 解析前端传来的JSON，获取 sessionId 和 customTitle
                com.google.gson.JsonObject request = new com.google.gson.Gson().fromJson(content, com.google.gson.JsonObject.class);
                String sessionId = request.get("sessionId").getAsString();
                String customTitle = request.get("customTitle").getAsString();

                LOG.info("[HistoryHandler] SessionId: " + sessionId);
                LOG.info("[HistoryHandler] CustomTitle: " + customTitle);

                // 调用 Node.js session-titles-service 更新标题
                String result = callNodeJsTitlesServiceWithParams("updateTitle", sessionId, customTitle);
                LOG.info("[HistoryHandler] 标题更新结果: " + result);

                // 解析结果
                com.google.gson.JsonObject resultObj = new com.google.gson.Gson().fromJson(result, com.google.gson.JsonObject.class);
                boolean success = resultObj.get("success").getAsBoolean();

                if (!success && resultObj.has("error")) {
                    String error = resultObj.get("error").getAsString();
                    ApplicationManager.getApplication().invokeLater(() -> {
                        String jsCode = "if (window.addToast) { " +
                            "  window.addToast('更新标题失败: " + escapeJs(error) + "', 'error'); " +
                            "}";
                        context.executeJavaScriptOnEDT(jsCode);
                    });
                }

            } catch (Exception e) {
                LOG.error("[HistoryHandler] ❌ 更新标题失败: " + e.getMessage(), e);
                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "if (window.addToast) { " +
                        "  window.addToast('更新标题失败: " + escapeJs(e.getMessage() != null ? e.getMessage() : "未知错误") + "', 'error'); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * 增强历史数据：添加收藏信息到每个会话
     */
    private String enhanceHistoryWithFavorites(String historyJson) {
        try {
            // 加载收藏数据
            String favoritesJson = callNodeJsFavoritesService("loadFavorites", "");

            // 解析历史数据和收藏数据
            com.google.gson.JsonObject history = new com.google.gson.Gson().fromJson(historyJson, com.google.gson.JsonObject.class);
            com.google.gson.JsonObject favorites = new com.google.gson.Gson().fromJson(favoritesJson, com.google.gson.JsonObject.class);

            // 为每个会话添加收藏信息和 provider 信息
            if (history.has("sessions") && history.get("sessions").isJsonArray()) {
                com.google.gson.JsonArray sessions = history.getAsJsonArray("sessions");
                for (int i = 0; i < sessions.size(); i++) {
                    com.google.gson.JsonObject session = sessions.get(i).getAsJsonObject();
                    String sessionId = session.get("sessionId").getAsString();

                    // 添加 provider 信息
                    session.addProperty("provider", currentProvider);

                    if (favorites.has(sessionId)) {
                        com.google.gson.JsonObject favoriteInfo = favorites.getAsJsonObject(sessionId);
                        session.addProperty("isFavorited", true);
                        session.addProperty("favoritedAt", favoriteInfo.get("favoritedAt").getAsLong());
                    } else {
                        session.addProperty("isFavorited", false);
                    }
                }
            }

            // 将收藏数据也添加到历史数据中
            history.add("favorites", favorites);

            return new com.google.gson.Gson().toJson(history);

        } catch (Exception e) {
            LOG.warn("[HistoryHandler] ⚠️ 增强历史数据失败，返回原始数据: " + e.getMessage());
            return historyJson;
        }
    }

    /**
     * 增强历史数据：添加自定义标题到每个会话
     */
    private String enhanceHistoryWithTitles(String historyJson) {
        try {
            // 加载标题数据
            String titlesJson = callNodeJsTitlesService("loadTitles", "", "");

            // 解析历史数据和标题数据
            com.google.gson.JsonObject history = new com.google.gson.Gson().fromJson(historyJson, com.google.gson.JsonObject.class);
            com.google.gson.JsonObject titles = new com.google.gson.Gson().fromJson(titlesJson, com.google.gson.JsonObject.class);

            // 为每个会话添加自定义标题
            if (history.has("sessions") && history.get("sessions").isJsonArray()) {
                com.google.gson.JsonArray sessions = history.getAsJsonArray("sessions");
                for (int i = 0; i < sessions.size(); i++) {
                    com.google.gson.JsonObject session = sessions.get(i).getAsJsonObject();
                    String sessionId = session.get("sessionId").getAsString();

                    if (titles.has(sessionId)) {
                        com.google.gson.JsonObject titleInfo = titles.getAsJsonObject(sessionId);
                        // 如果有自定义标题，则覆盖原始标题
                        if (titleInfo.has("customTitle")) {
                            String customTitle = titleInfo.get("customTitle").getAsString();
                            session.addProperty("title", customTitle);
                            session.addProperty("hasCustomTitle", true);
                        }
                    }
                }
            }

            return new com.google.gson.Gson().toJson(history);

        } catch (Exception e) {
            LOG.warn("[HistoryHandler] ⚠️ 增强标题数据失败，返回原始数据: " + e.getMessage());
            return historyJson;
        }
    }

    /**
     * 调用 Node.js favorites-service
     */
    private String callNodeJsFavoritesService(String functionName, String sessionId) throws Exception {
        // 获取 ai-bridge 路径
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        // 构建 Node.js 命令
        String nodeScript = String.format(
            "const { %s } = require('%s/services/favorites-service.cjs'); " +
            "const result = %s('%s'); " +
            "console.log(JSON.stringify(result));",
            functionName,
            bridgePath.replace("\\", "\\\\"),
            functionName,
            sessionId
        );

        ProcessBuilder pb = new ProcessBuilder(nodePath, "-e", nodeScript);
        pb.redirectErrorStream(true);

        Process process = pb.start();

        // 读取输出
        StringBuilder output = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception("Node.js process exited with code " + exitCode + ": " + output.toString());
        }

        // 返回最后一行（JSON 输出）
        String[] lines = output.toString().split("\n");
        return lines.length > 0 ? lines[lines.length - 1] : "{}";
    }

    /**
     * 调用 Node.js session-titles-service（无参数版本，用于 loadTitles）
     */
    private String callNodeJsTitlesService(String functionName, String dummy1, String dummy2) throws Exception {
        // 获取 ai-bridge 路径
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        // 构建 Node.js 命令（loadTitles 不需要参数）
        String nodeScript = String.format(
            "const { %s } = require('%s/services/session-titles-service.cjs'); " +
            "const result = %s(); " +
            "console.log(JSON.stringify(result));",
            functionName,
            bridgePath.replace("\\", "\\\\"),
            functionName
        );

        ProcessBuilder pb = new ProcessBuilder(nodePath, "-e", nodeScript);
        pb.redirectErrorStream(true);

        Process process = pb.start();

        // 读取输出
        StringBuilder output = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception("Node.js process exited with code " + exitCode + ": " + output.toString());
        }

        // 返回最后一行（JSON 输出）
        String[] lines = output.toString().split("\n");
        return lines.length > 0 ? lines[lines.length - 1] : "{}";
    }

    /**
     * 调用 Node.js session-titles-service（带参数版本，用于 updateTitle）
     */
    private String callNodeJsTitlesServiceWithParams(String functionName, String sessionId, String customTitle) throws Exception {
        // 获取 ai-bridge 路径
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        // 转义特殊字符
        String escapedTitle = customTitle.replace("\\", "\\\\").replace("'", "\\'");

        // 构建 Node.js 命令
        String nodeScript = String.format(
            "const { %s } = require('%s/services/session-titles-service.cjs'); " +
            "const result = %s('%s', '%s'); " +
            "console.log(JSON.stringify(result));",
            functionName,
            bridgePath.replace("\\", "\\\\"),
            functionName,
            sessionId,
            escapedTitle
        );

        ProcessBuilder pb = new ProcessBuilder(nodePath, "-e", nodeScript);
        pb.redirectErrorStream(true);

        Process process = pb.start();

        // 读取输出
        StringBuilder output = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception("Node.js process exited with code " + exitCode + ": " + output.toString());
        }

        // 返回最后一行（JSON 输出）
        String[] lines = output.toString().split("\n");
        return lines.length > 0 ? lines[lines.length - 1] : "{}";
    }

    /**
     * 调用 Node.js session-titles-service 删除标题（单参数版本）
     */
    private String callNodeJsDeleteTitle(String sessionId) throws Exception {
        // 获取 ai-bridge 路径
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        // 构建 Node.js 命令
        String nodeScript = String.format(
            "const { deleteTitle } = require('%s/services/session-titles-service.cjs'); " +
            "const result = deleteTitle('%s'); " +
            "console.log(JSON.stringify({ success: result }));",
            bridgePath.replace("\\", "\\\\"),
            sessionId
        );

        ProcessBuilder pb = new ProcessBuilder(nodePath, "-e", nodeScript);
        pb.redirectErrorStream(true);

        Process process = pb.start();

        // 读取输出
        StringBuilder output = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception("Node.js process exited with code " + exitCode + ": " + output.toString());
        }

        // 返回最后一行（JSON 输出）
        String[] lines = output.toString().split("\n");
        return lines.length > 0 ? lines[lines.length - 1] : "{}";
    }

    /**
     * 检查agent文件是否属于指定的会话
     * 通过读取文件内容查找sessionId引用
     */
    private boolean isAgentFileRelatedToSession(java.nio.file.Path agentFilePath, String sessionId) {
        try (java.io.BufferedReader reader = java.nio.file.Files.newBufferedReader(agentFilePath, java.nio.charset.StandardCharsets.UTF_8)) {
            String line;
            int lineCount = 0;
            // 只读取前20行以提高性能（通常sessionId会在文件开头）
            while ((line = reader.readLine()) != null && lineCount < 20) {
                // 检查这一行是否包含sessionId
                if (line.contains("\"sessionId\":\"" + sessionId + "\"") ||
                    line.contains("\"parentSessionId\":\"" + sessionId + "\"")) {
                    LOG.debug("[HistoryHandler] Agent文件 " + agentFilePath.getFileName() + " 属于会话 " + sessionId);
                    return true;
                }
                lineCount++;
            }
            // 如果前20行都没找到，说明这个agent文件不属于当前会话
            LOG.debug("[HistoryHandler] Agent文件 " + agentFilePath.getFileName() + " 不属于会话 " + sessionId);
            return false;
        } catch (Exception e) {
            // 如果读取失败，为了安全起见，不删除这个文件
            LOG.warn("[HistoryHandler] ⚠️ 无法读取agent文件 " + agentFilePath.getFileName() + ": " + e.getMessage());
            return false;
        }
    }
}
