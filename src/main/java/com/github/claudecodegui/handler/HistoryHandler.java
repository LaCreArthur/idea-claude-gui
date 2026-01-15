package com.github.claudecodegui.handler;

import com.github.claudecodegui.provider.claude.ClaudeHistoryReader;
import com.github.claudecodegui.util.JsUtils;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.CompletableFuture;

/**
 * History data handler.
 * Handles history loading, session management, favorites, and titles.
 */
public class HistoryHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(HistoryHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "load_history_data",
        "load_session",
        "delete_session",
        "export_session",
        "toggle_favorite",
        "update_title"
    };

    public interface SessionLoadCallback {
        void onLoadSession(String sessionId, String projectPath);
    }

    private SessionLoadCallback sessionLoadCallback;

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
     * Load and inject history data to frontend (with favorites and titles)
     */
    private void handleLoadHistoryData(String provider) {
        CompletableFuture.runAsync(() -> {
            try {
                String projectPath = context.getProject().getBasePath();
                ClaudeHistoryReader historyReader = new ClaudeHistoryReader();
                String historyJson = historyReader.getProjectDataAsJson(projectPath);

                // Enhance with favorites and titles
                String enhancedJson = enhanceHistoryWithFavorites(historyJson);
                String finalJson = enhanceHistoryWithTitles(enhancedJson);

                // Use Base64 encoding to avoid JavaScript string escaping issues
                String base64Json = java.util.Base64.getEncoder().encodeToString(finalJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));

                ApplicationManager.getApplication().invokeLater(() -> {
                    // Use TextDecoder to properly decode UTF-8 Base64 string
                    String jsCode = "if (window.setHistoryData) { " +
                        "  try { " +
                        "    var base64Str = '" + base64Json + "'; " +
                        "    var binaryStr = atob(base64Str); " +
                        "    var bytes = new Uint8Array(binaryStr.length); " +
                        "    for (var i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); } " +
                        "    var jsonStr = new TextDecoder('utf-8').decode(bytes); " +
                        "    var data = JSON.parse(jsonStr); " +
                        "    window.setHistoryData(data); " +
                        "  } catch(e) { " +
                        "    console.error('[HistoryHandler] Failed to parse history data:', e); " +
                        "    window.setHistoryData({ success: false, error: 'Failed to parse history: ' + e.message }); " +
                        "  } " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });

            } catch (Exception e) {
                LOG.error("[HistoryHandler] Failed to load history data: " + e.getMessage(), e);

                ApplicationManager.getApplication().invokeLater(() -> {
                    String errorMsg = escapeJs(e.getMessage() != null ? e.getMessage() : "Unknown error");
                    String jsCode = "if (window.setHistoryData) { " +
                        "  window.setHistoryData({ success: false, error: '" + errorMsg + "' }); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * Load history session
     */
    private void handleLoadSession(String sessionId) {
        String projectPath = context.getProject().getBasePath();
        if (sessionLoadCallback != null) {
            sessionLoadCallback.onLoadSession(sessionId, projectPath);
        } else {
            LOG.warn("[HistoryHandler] No session load callback set");
        }
    }

    /**
     * Delete session history file and related agent files
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

                LOG.info("[HistoryHandler] Session deleted: main=" + mainDeleted + ", agents=" + agentFilesDeleted);

                // Clean up related favorites and titles
                if (mainDeleted) {
                    try {
                        callNodeJsFavoritesService("removeFavorite", sessionId);
                        callNodeJsDeleteTitle(sessionId);
                    } catch (Exception e) {
                        LOG.warn("[HistoryHandler] Failed to cleanup associated data: " + e.getMessage());
                    }
                }

                // Reload history data
                handleLoadHistoryData("claude");

            } catch (Exception e) {
                LOG.error("[HistoryHandler] Failed to delete session: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Export session data to frontend
     */
    private void handleExportSession(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                com.google.gson.JsonObject exportRequest = new com.google.gson.Gson().fromJson(content, com.google.gson.JsonObject.class);
                String sessionId = exportRequest.get("sessionId").getAsString();
                String title = exportRequest.get("title").getAsString();
                String projectPath = context.getProject().getBasePath();

                ClaudeHistoryReader historyReader = new ClaudeHistoryReader();
                String messagesJson = historyReader.getSessionMessagesAsJson(projectPath, sessionId);

                com.google.gson.JsonObject exportData = new com.google.gson.JsonObject();
                exportData.addProperty("sessionId", sessionId);
                exportData.addProperty("title", title);
                exportData.add("messages", com.google.gson.JsonParser.parseString(messagesJson));

                String escapedJson = escapeJs(new com.google.gson.Gson().toJson(exportData));

                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "if (window.onExportSessionData) { " +
                        "  try { window.onExportSessionData('" + escapedJson + "'); } " +
                        "  catch(e) { console.error('[HistoryHandler] Failed to export:', e); } " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });

            } catch (Exception e) {
                LOG.error("[HistoryHandler] Failed to export session: " + e.getMessage(), e);
                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "if (window.addToast) { " +
                        "  window.addToast('Export failed: " + escapeJs(e.getMessage() != null ? e.getMessage() : "Unknown error") + "', 'error'); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * Toggle favorite status
     */
    private void handleToggleFavorite(String sessionId) {
        CompletableFuture.runAsync(() -> {
            try {
                callNodeJsFavoritesService("toggleFavorite", sessionId);
            } catch (Exception e) {
                LOG.error("[HistoryHandler] Failed to toggle favorite: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Update session title
     */
    private void handleUpdateTitle(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                com.google.gson.JsonObject request = new com.google.gson.Gson().fromJson(content, com.google.gson.JsonObject.class);
                String sessionId = request.get("sessionId").getAsString();
                String customTitle = request.get("customTitle").getAsString();

                String result = callNodeJsTitlesServiceWithParams("updateTitle", sessionId, customTitle);
                com.google.gson.JsonObject resultObj = new com.google.gson.Gson().fromJson(result, com.google.gson.JsonObject.class);
                boolean success = resultObj.get("success").getAsBoolean();

                if (!success && resultObj.has("error")) {
                    String error = resultObj.get("error").getAsString();
                    ApplicationManager.getApplication().invokeLater(() -> {
                        String jsCode = "if (window.addToast) { " +
                            "  window.addToast('Update failed: " + escapeJs(error) + "', 'error'); " +
                            "}";
                        context.executeJavaScriptOnEDT(jsCode);
                    });
                }

            } catch (Exception e) {
                LOG.error("[HistoryHandler] Failed to update title: " + e.getMessage(), e);
                ApplicationManager.getApplication().invokeLater(() -> {
                    String jsCode = "if (window.addToast) { " +
                        "  window.addToast('Update failed: " + escapeJs(e.getMessage() != null ? e.getMessage() : "Unknown error") + "', 'error'); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                });
            }
        });
    }

    /**
     * Enhance history data with favorites info
     */
    private String enhanceHistoryWithFavorites(String historyJson) {
        try {
            String favoritesJson = callNodeJsFavoritesService("loadFavorites", "");
            com.google.gson.JsonObject history = new com.google.gson.Gson().fromJson(historyJson, com.google.gson.JsonObject.class);
            com.google.gson.JsonObject favorites = new com.google.gson.Gson().fromJson(favoritesJson, com.google.gson.JsonObject.class);

            if (history.has("sessions") && history.get("sessions").isJsonArray()) {
                com.google.gson.JsonArray sessions = history.getAsJsonArray("sessions");
                for (int i = 0; i < sessions.size(); i++) {
                    com.google.gson.JsonObject session = sessions.get(i).getAsJsonObject();
                    String sessionId = session.get("sessionId").getAsString();

                    session.addProperty("provider", "claude");

                    if (favorites.has(sessionId)) {
                        com.google.gson.JsonObject favoriteInfo = favorites.getAsJsonObject(sessionId);
                        session.addProperty("isFavorited", true);
                        session.addProperty("favoritedAt", favoriteInfo.get("favoritedAt").getAsLong());
                    } else {
                        session.addProperty("isFavorited", false);
                    }
                }
            }

            history.add("favorites", favorites);
            return new com.google.gson.Gson().toJson(history);

        } catch (Exception e) {
            LOG.warn("[HistoryHandler] Failed to enhance with favorites: " + e.getMessage());
            return historyJson;
        }
    }

    /**
     * Enhance history data with custom titles
     */
    private String enhanceHistoryWithTitles(String historyJson) {
        try {
            String titlesJson = callNodeJsTitlesService("loadTitles", "", "");
            com.google.gson.JsonObject history = new com.google.gson.Gson().fromJson(historyJson, com.google.gson.JsonObject.class);
            com.google.gson.JsonObject titles = new com.google.gson.Gson().fromJson(titlesJson, com.google.gson.JsonObject.class);

            if (history.has("sessions") && history.get("sessions").isJsonArray()) {
                com.google.gson.JsonArray sessions = history.getAsJsonArray("sessions");
                for (int i = 0; i < sessions.size(); i++) {
                    com.google.gson.JsonObject session = sessions.get(i).getAsJsonObject();
                    String sessionId = session.get("sessionId").getAsString();

                    if (titles.has(sessionId)) {
                        com.google.gson.JsonObject titleInfo = titles.getAsJsonObject(sessionId);
                        if (titleInfo.has("customTitle")) {
                            session.addProperty("title", titleInfo.get("customTitle").getAsString());
                            session.addProperty("hasCustomTitle", true);
                        }
                    }
                }
            }

            return new com.google.gson.Gson().toJson(history);

        } catch (Exception e) {
            LOG.warn("[HistoryHandler] Failed to enhance with titles: " + e.getMessage());
            return historyJson;
        }
    }

    /**
     * Call Node.js favorites-service
     */
    private String callNodeJsFavoritesService(String functionName, String sessionId) throws Exception {
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        String nodeScript = String.format(
            "const { %s } = require('%s/services/favorites-service.cjs'); " +
            "const result = %s('%s'); " +
            "console.log(JSON.stringify(result));",
            functionName,
            bridgePath.replace("\\", "\\\\"),
            functionName,
            sessionId
        );

        return executeNodeScript(nodePath, nodeScript);
    }

    /**
     * Call Node.js session-titles-service (no params, for loadTitles)
     */
    private String callNodeJsTitlesService(String functionName, String dummy1, String dummy2) throws Exception {
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        String nodeScript = String.format(
            "const { %s } = require('%s/services/session-titles-service.cjs'); " +
            "const result = %s(); " +
            "console.log(JSON.stringify(result));",
            functionName,
            bridgePath.replace("\\", "\\\\"),
            functionName
        );

        return executeNodeScript(nodePath, nodeScript);
    }

    /**
     * Call Node.js session-titles-service (with params, for updateTitle)
     */
    private String callNodeJsTitlesServiceWithParams(String functionName, String sessionId, String customTitle) throws Exception {
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();
        String escapedTitle = customTitle.replace("\\", "\\\\").replace("'", "\\'");

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

        return executeNodeScript(nodePath, nodeScript);
    }

    /**
     * Delete session title
     */
    private String callNodeJsDeleteTitle(String sessionId) throws Exception {
        String bridgePath = context.getClaudeSDKBridge().getSdkTestDir().getAbsolutePath();
        String nodePath = context.getClaudeSDKBridge().getNodeExecutable();

        String nodeScript = String.format(
            "const { deleteTitle } = require('%s/services/session-titles-service.cjs'); " +
            "const result = deleteTitle('%s'); " +
            "console.log(JSON.stringify({ success: result }));",
            bridgePath.replace("\\", "\\\\"),
            sessionId
        );

        return executeNodeScript(nodePath, nodeScript);
    }

    /**
     * Execute Node.js script and return last line of output
     */
    private String executeNodeScript(String nodePath, String nodeScript) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(nodePath, "-e", nodeScript);
        pb.redirectErrorStream(true);

        Process process = pb.start();

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
            throw new Exception("Node.js process exited with code " + exitCode + ": " + output);
        }

        String[] lines = output.toString().split("\n");
        return lines.length > 0 ? lines[lines.length - 1] : "{}";
    }

    /**
     * Check if agent file belongs to specified session
     */
    private boolean isAgentFileRelatedToSession(java.nio.file.Path agentFilePath, String sessionId) {
        try (java.io.BufferedReader reader = java.nio.file.Files.newBufferedReader(agentFilePath, java.nio.charset.StandardCharsets.UTF_8)) {
            String line;
            int lineCount = 0;
            // Only read first 20 lines for performance
            while ((line = reader.readLine()) != null && lineCount < 20) {
                if (line.contains("\"sessionId\":\"" + sessionId + "\"") ||
                    line.contains("\"parentSessionId\":\"" + sessionId + "\"")) {
                    return true;
                }
                lineCount++;
            }
            return false;
        } catch (Exception e) {
            // If read fails, don't delete the file for safety
            LOG.warn("[HistoryHandler] Failed to read agent file " + agentFilePath.getFileName() + ": " + e.getMessage());
            return false;
        }
    }
}
