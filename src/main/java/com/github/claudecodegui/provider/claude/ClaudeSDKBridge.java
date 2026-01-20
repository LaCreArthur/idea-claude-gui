package com.github.claudecodegui.provider.claude;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.model.NodeDetectionResult;
import com.github.claudecodegui.provider.common.BaseSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

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
     * Send a message using the new bridge.js protocol with stdin/stdout IPC.
     * This method keeps stdin open for bidirectional communication.
     *
     * @param channelId          Channel identifier
     * @param message            User message
     * @param sessionId          Session ID (null for new session)
     * @param cwd                Working directory
     * @param attachments        List of attachments (images, etc.)
     * @param permissionMode     Permission mode (default, acceptEdits, bypassPermissions)
     * @param model              Model to use (optional)
     * @param permissionCallback Callback for handling permission requests
     * @param askUserCallback    Callback for handling AskUserQuestion requests
     * @param callback           Message callback for streaming events
     * @return CompletableFuture with the result
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
            PermissionCallback permissionCallback,
            AskUserQuestionCallback askUserCallback,
            MessageCallback callback
    ) {
        return CompletableFuture.supplyAsync(() -> {
            SDKResult result = new SDKResult();
            StringBuilder assistantContent = new StringBuilder();
            String[] currentSessionId = {sessionId};

            try {
                String node = nodeDetector.findNodeExecutable();
                File bridgeDir = getDirectoryResolver().findSdkDir();
                if (bridgeDir == null) {
                    result.success = false;
                    result.error = "Bridge directory not ready (extraction in progress)";
                    callback.onError(result.error);
                    return result;
                }

                // Build initial command JSON
                JsonObject commandJson = new JsonObject();
                commandJson.addProperty("message", message);
                commandJson.addProperty("sessionId", sessionId != null ? sessionId : "");
                commandJson.addProperty("cwd", cwd != null ? cwd : "");
                commandJson.addProperty("permissionMode", permissionMode != null ? permissionMode : "default");
                if (model != null && !model.isEmpty()) {
                    commandJson.addProperty("model", model);
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
                // Add attachments if present
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

                // Build command
                List<String> command = new ArrayList<>();
                command.add(node);
                command.add(new File(bridgeDir, BRIDGE_SCRIPT).getAbsolutePath());

                // Set up process
                File processTempDir = processManager.prepareClaudeTempDir();
                Set<String> existingTempMarkers = processManager.snapshotClaudeCwdFiles(processTempDir);

                ProcessBuilder pb = new ProcessBuilder(command);

                // Set working directory
                if (cwd != null && !cwd.isEmpty() && !"undefined".equals(cwd) && !"null".equals(cwd)) {
                    File userWorkDir = new File(cwd);
                    if (userWorkDir.exists() && userWorkDir.isDirectory()) {
                        pb.directory(userWorkDir);
                    } else {
                        pb.directory(bridgeDir);
                    }
                } else {
                    pb.directory(bridgeDir);
                }

                Map<String, String> env = pb.environment();
                envConfigurator.configureTempDir(env, processTempDir);
                envConfigurator.configureProjectPath(env, cwd);
                pb.redirectErrorStream(true);
                envConfigurator.updateProcessEnvironment(pb, node);

                Process process = null;
                try {
                    process = pb.start();
                    processManager.registerProcess(channelId, process);
                    LOG.info("[Bridge] Process started, PID: " + process.pid());

                    // Keep stdin open for bidirectional communication
                    BufferedWriter stdinWriter = new BufferedWriter(
                            new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));

                    // Write initial command
                    stdinWriter.write(gson.toJson(commandJson));
                    stdinWriter.newLine();
                    stdinWriter.flush();
                    LOG.info("[Bridge] Initial command sent");

                    // Read stdout line by line
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {

                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (line.trim().isEmpty()) continue;

                            // Try to parse as JSON
                            JsonObject msg;
                            try {
                                msg = gson.fromJson(line, JsonObject.class);
                            } catch (Exception e) {
                                // Not JSON, log and skip
                                LOG.debug("[Bridge] Non-JSON output: " + line);
                                continue;
                            }

                            String type = msg.has("type") ? msg.get("type").getAsString() : "";

                            switch (type) {
                                case "permission_request":
                                    // Handle permission request
                                    if (permissionCallback != null) {
                                        String reqId = msg.has("id") ? String.valueOf(msg.get("id").getAsInt()) : "0";
                                        String toolName = msg.has("toolName") ? msg.get("toolName").getAsString() : "";
                                        JsonObject toolInput = msg.has("toolInput") ? msg.getAsJsonObject("toolInput") : new JsonObject();

                                        LOG.info("[Bridge] Permission request: " + toolName);

                                        // Call permission callback and wait for response
                                        CompletableFuture<JsonObject> responseFuture = permissionCallback.onPermissionRequest(reqId, toolName, toolInput);
                                        JsonObject response = responseFuture.get(); // Block until user responds

                                        // Send response back to bridge
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

                                        stdinWriter.write(gson.toJson(responseMsg));
                                        stdinWriter.newLine();
                                        stdinWriter.flush();
                                        LOG.info("[Bridge] Permission response sent: allow=" + responseMsg.get("allow").getAsBoolean());
                                    }
                                    break;

                                case "ask_user_question":
                                    // Handle AskUserQuestion
                                    if (askUserCallback != null) {
                                        String reqId = msg.has("id") ? String.valueOf(msg.get("id").getAsInt()) : "0";
                                        JsonArray questions = msg.has("questions") ? msg.getAsJsonArray("questions") : new JsonArray();

                                        LOG.info("[Bridge] AskUserQuestion request received, id=" + reqId);

                                        CompletableFuture<JsonObject> responseFuture = askUserCallback.onAskUserQuestion(reqId, questions);
                                        LOG.info("[Bridge] AskUserQuestion waiting for user response...");
                                        JsonObject response = responseFuture.get();
                                        LOG.info("[Bridge] AskUserQuestion got response: " + response);

                                        JsonObject responseMsg = new JsonObject();
                                        responseMsg.addProperty("type", "response");
                                        responseMsg.addProperty("id", Integer.parseInt(reqId));
                                        boolean allow = response != null && response.has("allow") && response.get("allow").getAsBoolean();
                                        responseMsg.addProperty("allow", allow);
                                        if (response != null && response.has("answers")) {
                                            responseMsg.add("answers", response.get("answers"));
                                        }

                                        String responseMsgStr = gson.toJson(responseMsg);
                                        LOG.info("[Bridge] AskUserQuestion sending to bridge: " + responseMsgStr);
                                        stdinWriter.write(responseMsgStr);
                                        stdinWriter.newLine();
                                        stdinWriter.flush();
                                        LOG.info("[Bridge] AskUserQuestion response sent successfully");
                                    } else {
                                        LOG.warn("[Bridge] AskUserQuestion received but no callback registered!");
                                    }
                                    break;

                                case "session_id":
                                    currentSessionId[0] = msg.has("sessionId") ? msg.get("sessionId").getAsString() : "";
                                    callback.onMessage("session_id", currentSessionId[0]);
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
                                    // Forward raw SDK event
                                    JsonObject event = msg.has("event") ? msg.getAsJsonObject("event") : new JsonObject();
                                    String eventType = event.has("type") ? event.get("type").getAsString() : "unknown";
                                    callback.onMessage(eventType, gson.toJson(event));
                                    result.messages.add(event);
                                    break;

                                case "done":
                                    LOG.info("[Bridge] Query complete, sessionId=" + currentSessionId[0]);
                                    break;

                                case "error":
                                    String errorMsg = msg.has("message") ? msg.get("message").getAsString() : "Unknown error";
                                    LOG.error("[Bridge] Error: " + errorMsg);
                                    result.success = false;
                                    result.error = errorMsg;
                                    callback.onError(errorMsg);
                                    break;

                                default:
                                    // Forward unknown message types
                                    callback.onMessage(type, line);
                                    break;
                            }
                        }
                    }

                    // Close stdin
                    stdinWriter.close();

                    // Wait for process to exit
                    process.waitFor();
                    int exitCode = process.exitValue();
                    boolean wasInterrupted = processManager.wasInterrupted(channelId);

                    result.finalResult = assistantContent.toString();
                    result.messageCount = result.messages.size();

                    if (wasInterrupted) {
                        callback.onComplete(result);
                    } else if (result.error == null) {
                        result.success = exitCode == 0;
                        if (result.success) {
                            callback.onComplete(result);
                        } else {
                            result.error = "Bridge process exited with code: " + exitCode;
                            callback.onError(result.error);
                        }
                    }

                    return result;

                } finally {
                    processManager.unregisterProcess(channelId, process);
                    processManager.waitForProcessTermination(process);
                    processManager.cleanupClaudeTempFiles(processTempDir, existingTempMarkers);
                }

            } catch (Exception e) {
                result.success = false;
                result.error = e.getMessage();
                callback.onError(e.getMessage());
                return result;
            }
        }).exceptionally(ex -> {
            SDKResult errorResult = new SDKResult();
            errorResult.success = false;
            errorResult.error = ex.getCause() != null ? ex.getCause().getMessage() : ex.getMessage();
            callback.onError(errorResult.error);
            return errorResult;
        });
    }

    // ============================================================================
    // Utility methods
    // ============================================================================

    private String extractBetween(String text, String start, String end) {
        int startIdx = text.indexOf(start);
        if (startIdx == -1) return null;
        startIdx += start.length();

        int endIdx = text.indexOf(end, startIdx);
        if (endIdx == -1) return null;

        return text.substring(startIdx, endIdx);
    }
}
