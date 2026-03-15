package com.github.claudecodegui.provider.claude;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.model.NodeDetectionResult;
import com.github.claudecodegui.provider.common.BaseSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Claude Agent SDK bridge.
 * Handles Java to Node.js SDK communication, supports async and streaming responses.
 */
public class ClaudeSDKBridge extends BaseSDKBridge {

    private final SlashCommandClient slashCommandClient;
    private final McpStatusClient mcpStatusClient;
    private final RewindOperations rewindOperations;
    private final SessionOperations sessionOperations;
    private final SyncQueryClient syncQueryClient;

    // Daemon mode: persistent bridge process
    private volatile DaemonConnection daemon;
    private final Object daemonLock = new Object();
    // Maps queryId → channelId for abort routing
    private final Map<String, String> queryToChannel = new ConcurrentHashMap<>();

    public ClaudeSDKBridge() {
        super(ClaudeSDKBridge.class);
        this.slashCommandClient = new SlashCommandClient(
                gson,
                nodeDetector,
                getDirectoryResolver(),
                envConfigurator,
                processManager
        );
        this.mcpStatusClient = new McpStatusClient(
                gson,
                nodeDetector,
                getDirectoryResolver(),
                envConfigurator,
                processManager
        );
        this.rewindOperations = new RewindOperations(
                gson,
                nodeDetector,
                getDirectoryResolver(),
                envConfigurator,
                processManager
        );
        this.sessionOperations = new SessionOperations(
                gson,
                nodeDetector,
                getDirectoryResolver(),
                envConfigurator
        );
        this.syncQueryClient = new SyncQueryClient(
                gson,
                nodeDetector,
                getDirectoryResolver(),
                envConfigurator,
                processManager
        );
    }

    // ============================================================================
    // Abstract method implementations
    // ============================================================================

    @Override
    protected String getProviderName() {
        return "claude";
    }

    // ============================================================================
    // Node.js detection methods (Claude-specific extensions)
    // ============================================================================

    /**
     * Detect Node.js and return detailed results.
     */
    public NodeDetectionResult detectNodeWithDetails() {
        return nodeDetector.detectNodeWithDetails();
    }

    /**
     * Clear Node.js detection cache.
     */
    public void clearNodeCache() {
        nodeDetector.clearCache();
    }

    /**
     * Verify Node.js path and return version.
     */
    public String verifyNodePath(String path) {
        return nodeDetector.verifyNodePath(path);
    }

    /**
     * Get cached Node.js version.
     */
    public String getCachedNodeVersion() {
        return nodeDetector.getCachedNodeVersion();
    }

    /**
     * Get cached Node.js path.
     */
    public String getCachedNodePath() {
        return nodeDetector.getCachedNodePath();
    }

    /**
     * Verify and cache Node.js path.
     */
    public NodeDetectionResult verifyAndCacheNodePath(String path) {
        return nodeDetector.verifyAndCacheNodePath(path);
    }

    // ============================================================================
    // Bridge directory methods
    // ============================================================================

    /**
     * Set claude-bridge directory path manually.
     */
    public void setSdkTestDir(String path) {
        getDirectoryResolver().setSdkDir(path);
    }

    /**
     * Get current claude-bridge directory.
     */
    public File getSdkTestDir() {
        return getDirectoryResolver().getSdkDir();
    }

    // ============================================================================
    // Sync query methods (Claude-specific) - delegated to SyncQueryClient
    // ============================================================================

    /**
     * Execute query synchronously (blocking).
     */
    public SDKResult executeQuerySync(String prompt) {
        return syncQueryClient.executeQuerySync(prompt);
    }

    /**
     * Execute query synchronously with timeout.
     */
    public SDKResult executeQuerySync(String prompt, int timeoutSeconds) {
        return syncQueryClient.executeQuerySync(prompt, timeoutSeconds);
    }

    /**
     * Execute query asynchronously.
     */
    public CompletableFuture<SDKResult> executeQueryAsync(String prompt) {
        return syncQueryClient.executeQueryAsync(prompt);
    }

    /**
     * Execute query with streaming.
     */
    public CompletableFuture<SDKResult> executeQueryStream(String prompt, MessageCallback callback) {
        return syncQueryClient.executeQueryStream(prompt, callback);
    }

    /**
     * Get session history messages.
     */
    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        return sessionOperations.getSessionMessages(sessionId, cwd);
    }

    /**
     * Get slash commands list.
     */
    public CompletableFuture<List<JsonObject>> getSlashCommands(String cwd) {
        return slashCommandClient.getSlashCommands(cwd);
    }

    /**
     * Get MCP server connection status.
     */
    public CompletableFuture<List<JsonObject>> getMcpServerStatus(String cwd) {
        return mcpStatusClient.getMcpServerStatus(cwd);
    }

    // ============================================================================
    // Rewind files support
    // ============================================================================

    /**
     * Rewind files to a specific user message state.
     * Uses the SDK's rewindFiles() API to restore files to their state at a given message.
     *
     * @param sessionId The session ID
     * @param userMessageId The user message UUID to rewind to
     * @param cwd Working directory for the session
     * @return CompletableFuture with the result
     */
    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId, String cwd) {
        return rewindOperations.rewindFiles(sessionId, userMessageId, cwd);
    }

    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId) {
        return rewindOperations.rewindFiles(sessionId, userMessageId);
    }

    // ============================================================================
    // Daemon mode (persistent bridge process)
    // ============================================================================

    /**
     * Get or create a daemon connection. Pre-warms the SDK on first call.
     * Thread-safe — only one daemon per bridge instance.
     */
    public DaemonConnection getOrCreateDaemon() throws Exception {
        DaemonConnection d = daemon;
        if (d != null && d.isAlive()) {
            return d;
        }

        synchronized (daemonLock) {
            d = daemon;
            if (d != null && d.isAlive()) {
                return d;
            }

            String node = nodeDetector.findNodeExecutable();
            File bridgeDir = getDirectoryResolver().findSdkDir();
            if (bridgeDir == null) {
                throw new Exception("Bridge directory not ready (extraction in progress)");
            }

            List<String> command = new ArrayList<>();
            command.add(node);
            command.add(new File(bridgeDir, BRIDGE_SCRIPT).getAbsolutePath());
            command.add("--daemon");

            d = new DaemonConnection(command, bridgeDir, envConfigurator, processManager, node);
            d.start();
            daemon = d;
            LOG.info("[Daemon] Created and started daemon connection");
            return d;
        }
    }

    /**
     * Shut down the daemon connection.
     */
    public void shutdownDaemon() {
        DaemonConnection d = daemon;
        if (d != null) {
            daemon = null;
            d.shutdown();
        }
    }

    /**
     * Override interruptChannel to use daemon abort when available.
     */
    @Override
    public void interruptChannel(String channelId) {
        DaemonConnection d = daemon;
        if (d != null && d.isAlive()) {
            // Find the queryId for this channelId
            String queryId = null;
            for (Map.Entry<String, String> entry : queryToChannel.entrySet()) {
                if (channelId.equals(entry.getValue())) {
                    queryId = entry.getKey();
                    break;
                }
            }
            if (queryId != null) {
                LOG.info("[Daemon] Aborting query " + queryId + " for channel " + channelId);
                d.abort(queryId);
                queryToChannel.remove(queryId);
                processManager.markInterrupted(channelId);
                return;
            }
            // Daemon is alive but no query mapping — channel might have already finished
            LOG.info("[Daemon] No active query for channel " + channelId + " (may have already completed)");
            processManager.markInterrupted(channelId);
            return;
        }
        // Safety fallback: kill any registered process
        super.interruptChannel(channelId);
    }

    // ============================================================================
    // New Bridge Protocol (Phase 1 simplification)
    // ============================================================================

    /**
     * Callback interface for handling permission requests from the bridge.
     * Returns a CompletableFuture that resolves to a JsonObject response.
     */
    public interface PermissionCallback {
        /**
         * Handle a permission request from the bridge.
         *
         * @param requestId   Unique request ID for correlation
         * @param toolName    Name of the tool requesting permission
         * @param toolInput   Input parameters for the tool
         * @return CompletableFuture resolving to { allow: boolean, message?: string, updatedInput?: object }
         */
        CompletableFuture<JsonObject> onPermissionRequest(String requestId, String toolName, JsonObject toolInput);
    }

    /**
     * Callback interface for handling AskUserQuestion requests from the bridge.
     */
    public interface AskUserQuestionCallback {
        /**
         * Handle an AskUserQuestion request from the bridge.
         *
         * @param requestId  Unique request ID for correlation
         * @param questions  Array of questions to ask
         * @return CompletableFuture resolving to { allow: boolean, answers?: object }
         */
        CompletableFuture<JsonObject> onAskUserQuestion(String requestId, JsonArray questions);
    }

    private static final String BRIDGE_SCRIPT = "bridge.js";

    /**
     * Send a message using the bridge.js protocol via the daemon connection.
     */
    public CompletableFuture<SDKResult> sendMessageWithBridge(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            List<ClaudeSession.Attachment> attachments,
            String permissionMode,
            String model,
            JsonObject openedFiles,
            String agentPrompt,
            Boolean streaming,
            int maxThinkingTokens,
            PermissionCallback permissionCallback,
            AskUserQuestionCallback askUserCallback,
            MessageCallback callback
    ) {
        JsonObject commandJson = buildCommandJson(
                message, sessionId, cwd, permissionMode, model,
                maxThinkingTokens, openedFiles, agentPrompt, streaming, attachments);

        try {
            DaemonConnection d = getOrCreateDaemon();
            return sendViaDaemon(d, channelId, commandJson, permissionCallback, askUserCallback, callback);
        } catch (Exception e) {
            LOG.error("[Bridge] Failed to start daemon: " + e.getMessage());
            SDKResult errorResult = new SDKResult();
            errorResult.success = false;
            errorResult.error = "Failed to start bridge daemon: " + e.getMessage();
            callback.onError(errorResult.error);
            return CompletableFuture.completedFuture(errorResult);
        }
    }

    /**
     * Build the command JSON for the daemon query.
     */
    private JsonObject buildCommandJson(
            String message, String sessionId, String cwd, String permissionMode,
            String model, int maxThinkingTokens, JsonObject openedFiles,
            String agentPrompt, Boolean streaming, List<ClaudeSession.Attachment> attachments) {
        JsonObject commandJson = new JsonObject();
        commandJson.addProperty("message", message);
        commandJson.addProperty("sessionId", sessionId != null ? sessionId : "");
        commandJson.addProperty("cwd", cwd != null ? cwd : "");
        commandJson.addProperty("permissionMode", permissionMode != null ? permissionMode : "default");
        if (model != null && !model.isEmpty()) {
            commandJson.addProperty("model", model);
        }
        if (maxThinkingTokens > 0) {
            commandJson.addProperty("maxThinkingTokens", maxThinkingTokens);
        }
        if (openedFiles != null && openedFiles.size() > 0) {
            commandJson.add("openedFiles", openedFiles);
        }
        if (agentPrompt != null && !agentPrompt.isEmpty()) {
            commandJson.addProperty("agentPrompt", agentPrompt);
        }
        if (streaming != null) {
            commandJson.addProperty("streaming", streaming);
        }
        if (attachments != null && !attachments.isEmpty()) {
            JsonArray attArray = new JsonArray();
            for (ClaudeSession.Attachment att : attachments) {
                if (att == null) continue;
                JsonObject attObj = new JsonObject();
                attObj.addProperty("fileName", att.fileName);
                attObj.addProperty("mediaType", att.mediaType);
                attObj.addProperty("data", att.data);
                attArray.add(attObj);
            }
            commandJson.add("attachments", attArray);
        }
        return commandJson;
    }

    /**
     * Send a query through the daemon connection.
     */
    private CompletableFuture<SDKResult> sendViaDaemon(
            DaemonConnection d,
            String channelId,
            JsonObject commandJson,
            PermissionCallback permissionCallback,
            AskUserQuestionCallback askUserCallback,
            MessageCallback callback
    ) {
        CompletableFuture<SDKResult> future = new CompletableFuture<>();
        String queryId = UUID.randomUUID().toString();
        queryToChannel.put(queryId, channelId);

        SDKResult result = new SDKResult();
        StringBuilder assistantContent = new StringBuilder();

        DaemonConnection.DaemonQueryCallback queryCallback = new DaemonConnection.DaemonQueryCallback() {
            @Override
            public void onMessage(String line) {
                // Reuse the existing line-handling switch logic
                handleBridgeLine(line, result, assistantContent, permissionCallback, askUserCallback, callback, d);
            }

            @Override
            public void onDone(String sessionId) {
                LOG.info("[Daemon] onDone: queryId=" + queryId + ", channelId=" + channelId + ", sessionId=" + sessionId);
                queryToChannel.remove(queryId);
                result.success = true;
                result.finalResult = assistantContent.toString();
                result.messageCount = result.messages.size();
                callback.onComplete(result);
                future.complete(result);
            }

            @Override
            public void onError(String message) {
                LOG.warn("[Daemon] onError: queryId=" + queryId + ", channelId=" + channelId + ", message=" + message);
                queryToChannel.remove(queryId);
                result.success = false;
                result.error = message;
                callback.onError(message);
                future.complete(result);
            }
        };

        try {
            d.sendQuery(commandJson, queryId, queryCallback);
        } catch (Exception e) {
            queryToChannel.remove(queryId);
            result.success = false;
            result.error = e.getMessage();
            callback.onError(e.getMessage());
            future.complete(result);
        }

        return future;
    }

    /**
     * Handle a single line from bridge.js output.
     * Permission responses are sent back through the daemon connection.
     */
    private void handleBridgeLine(
            String line,
            SDKResult result,
            StringBuilder assistantContent,
            PermissionCallback permissionCallback,
            AskUserQuestionCallback askUserCallback,
            MessageCallback callback,
            DaemonConnection daemon
    ) {
        JsonObject msg;
        try {
            msg = gson.fromJson(line, JsonObject.class);
        } catch (Exception e) {
            LOG.debug("[Bridge] Non-JSON output: " + line);
            return;
        }

        String type = msg.has("type") ? msg.get("type").getAsString() : "";

        switch (type) {
            case "permission_request":
                if (permissionCallback != null) {
                    try {
                        String reqId = msg.has("id") ? String.valueOf(msg.get("id").getAsInt()) : "0";
                        String toolName = msg.has("toolName") ? msg.get("toolName").getAsString() : "";
                        JsonObject toolInput = msg.has("toolInput") ? msg.getAsJsonObject("toolInput") : new JsonObject();

                        LOG.info("[Bridge] Permission request: " + toolName);

                        CompletableFuture<JsonObject> responseFuture = permissionCallback.onPermissionRequest(reqId, toolName, toolInput);
                        JsonObject response = responseFuture.get();

                        JsonObject responseMsg = new JsonObject();
                        responseMsg.addProperty("type", "response");
                        responseMsg.addProperty("id", Integer.parseInt(reqId));
                        responseMsg.addProperty("allow", response.has("allow") && response.get("allow").getAsBoolean());
                        if (response.has("message")) {
                            responseMsg.addProperty("message", response.get("message").getAsString());
                        }
                        if (response.has("updatedInput")) {
                            responseMsg.add("updatedInput", response.get("updatedInput"));
                        }

                        daemon.sendResponse(responseMsg);
                        LOG.info("[Bridge] Permission response sent: allow=" + responseMsg.get("allow").getAsBoolean());
                    } catch (Exception e) {
                        LOG.error("[Bridge] Permission handling failed: " + e.getMessage());
                    }
                }
                break;

            case "ask_user_question":
                if (askUserCallback != null) {
                    try {
                        String reqId = msg.has("id") ? String.valueOf(msg.get("id").getAsInt()) : "0";
                        JsonArray questions = msg.has("questions") ? msg.getAsJsonArray("questions") : new JsonArray();

                        LOG.info("[Bridge] AskUserQuestion request received, id=" + reqId);

                        CompletableFuture<JsonObject> responseFuture = askUserCallback.onAskUserQuestion(reqId, questions);
                        JsonObject response = responseFuture.get();

                        JsonObject responseMsg = new JsonObject();
                        responseMsg.addProperty("type", "response");
                        responseMsg.addProperty("id", Integer.parseInt(reqId));
                        boolean allow = response != null && response.has("allow") && response.get("allow").getAsBoolean();
                        responseMsg.addProperty("allow", allow);
                        if (response != null && response.has("answers")) {
                            responseMsg.add("answers", response.get("answers"));
                        }

                        daemon.sendResponse(responseMsg);
                        LOG.info("[Bridge] AskUserQuestion response sent successfully");
                    } catch (Exception e) {
                        LOG.error("[Bridge] AskUserQuestion handling failed: " + e.getMessage());
                    }
                }
                break;

            case "session_id":
                String sid = msg.has("sessionId") ? msg.get("sessionId").getAsString() : "";
                callback.onMessage("session_id", sid);
                break;

            case "content":
                String text = msg.has("text") ? msg.get("text").getAsString() : "";
                assistantContent.append(text);
                callback.onMessage("content", text);
                break;

            case "content_delta":
                String delta = msg.has("delta") ? msg.get("delta").getAsString() : "";
                assistantContent.append(delta);
                callback.onMessage("content_delta", delta);
                break;

            case "thinking":
                String thinking = msg.has("text") ? msg.get("text").getAsString() : "";
                callback.onMessage("thinking", thinking);
                break;

            case "thinking_delta":
                String thinkingDelta = msg.has("delta") ? msg.get("delta").getAsString() : "";
                callback.onMessage("thinking_delta", thinkingDelta);
                break;

            case "tool_use":
                callback.onMessage("tool_use", gson.toJson(msg.get("tool")));
                break;

            case "tool_result":
                callback.onMessage("tool_result", gson.toJson(msg.get("result")));
                break;

            case "event":
                JsonObject event = msg.has("event") ? msg.getAsJsonObject("event") : new JsonObject();
                String eventType = event.has("type") ? event.get("type").getAsString() : "unknown";
                callback.onMessage(eventType, gson.toJson(event));
                result.messages.add(event);
                break;

            case "stream_start":
                callback.onMessage("stream_start", "");
                break;

            case "stream_end":
                callback.onMessage("stream_end", "");
                break;

            case "done":
            case "query_done":
                // Handled by DaemonQueryCallback.onDone
                break;

            case "error":
            case "query_error":
                String errorMsg = msg.has("message") ? msg.get("message").getAsString() : "Unknown error";
                LOG.error("[Bridge] Error: " + errorMsg);
                result.success = false;
                result.error = errorMsg;
                callback.onError(errorMsg);
                break;

            case "console.log":
                // Ignore console.log messages
                break;

            default:
                callback.onMessage(type, line);
                break;
        }
    }

}
