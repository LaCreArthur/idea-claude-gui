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
import java.util.HashMap;
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
    private final OutputLineProcessor outputLineProcessor;
    private final SyncQueryClient syncQueryClient;

    public ClaudeSDKBridge() {
        super(ClaudeSDKBridge.class);
        this.outputLineProcessor = new OutputLineProcessor(gson);
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

    @Override
    protected void configureProviderEnv(Map<String, String> env, String stdinJson) {
        env.put("CLAUDE_USE_STDIN", "true");
    }

    @Override
    protected void processOutputLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent,
            boolean[] hadSendError,
            String[] lastNodeError
    ) {
        // Create context and delegate to OutputLineProcessor
        OutputLineProcessor.ProcessingContext context =
                new OutputLineProcessor.ProcessingContext(result, assistantContent);

        outputLineProcessor.processLine(line, context, callback);

        // Sync state back to arrays
        if (context.hadSendError) {
            hadSendError[0] = true;
        }
        if (context.lastNodeError != null) {
            lastNodeError[0] = context.lastNodeError;
        }
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

    // ============================================================================
    // Multi-turn interaction support
    // ============================================================================

    /**
     * Send message in existing channel (streaming response).
     */
    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            List<ClaudeSession.Attachment> attachments,
            MessageCallback callback
    ) {
        return sendMessage(channelId, message, sessionId, cwd, attachments, null, null, null, null, null, callback);
    }

    /**
     * Send message in existing channel (streaming response, with permission mode and model selection).
     */
    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            List<ClaudeSession.Attachment> attachments,
            String permissionMode,
            String model,
            JsonObject openedFiles,
            String agentPrompt,
            MessageCallback callback
    ) {
        return sendMessage(channelId, message, sessionId, cwd, attachments, permissionMode, model, openedFiles, agentPrompt, null, callback);
    }

    /**
     * Send message in existing channel (streaming response, with all options including streaming flag).
     */
    public CompletableFuture<SDKResult> sendMessage(
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
            MessageCallback callback
    ) {
        return CompletableFuture.supplyAsync(() -> {
            SDKResult result = new SDKResult();
            StringBuilder assistantContent = new StringBuilder();
            final boolean[] hadSendError = {false};
            final String[] lastNodeError = {null};

            try {
                // Serialize attachments
                String attachmentsJson = null;
                boolean hasAttachments = attachments != null && !attachments.isEmpty();
                if (hasAttachments) {
                    try {
                        List<Map<String, String>> serializable = new ArrayList<>();
                        for (ClaudeSession.Attachment att : attachments) {
                            if (att == null) continue;
                            Map<String, String> obj = new HashMap<>();
                            obj.put("fileName", att.fileName);
                            obj.put("mediaType", att.mediaType);
                            obj.put("data", att.data);
                            serializable.add(obj);
                        }
                        attachmentsJson = gson.toJson(serializable);
                    } catch (Exception e) {
                        hasAttachments = false;
                    }
                }

                String node = nodeDetector.findNodeExecutable();
                File workDir = getDirectoryResolver().findSdkDir();

                // Diagnostics
                LOG.info("[ClaudeSDKBridge] Environment diagnostics:");
                LOG.info("[ClaudeSDKBridge]   Node.js path: " + node);
                String nodeVersion = nodeDetector.verifyNodePath(node);
                LOG.info("[ClaudeSDKBridge]   Node.js version: " + (nodeVersion != null ? nodeVersion : "unknown"));
                LOG.info("[ClaudeSDKBridge]   SDK directory: " + workDir.getAbsolutePath());

                // Build stdin input
                JsonObject stdinInput = new JsonObject();
                stdinInput.addProperty("message", message);
                stdinInput.addProperty("sessionId", sessionId != null ? sessionId : "");
                stdinInput.addProperty("cwd", cwd != null ? cwd : "");
                stdinInput.addProperty("permissionMode", permissionMode != null ? permissionMode : "");
                stdinInput.addProperty("model", model != null ? model : "");
                if (hasAttachments && attachmentsJson != null) {
                    stdinInput.add("attachments", gson.fromJson(attachmentsJson, JsonArray.class));
                }
                if (openedFiles != null && openedFiles.size() > 0) {
                    stdinInput.add("openedFiles", openedFiles);
                }
                if (agentPrompt != null && !agentPrompt.isEmpty()) {
                    stdinInput.addProperty("agentPrompt", agentPrompt);
                    LOG.info("[Agent] ✓ Adding agentPrompt to stdinInput (length: " + agentPrompt.length() + " chars)");
                }
                // 🔧 流式传输配置
                if (streaming != null) {
                    stdinInput.addProperty("streaming", streaming);
                    LOG.info("[Streaming] ✓ Adding streaming to stdinInput: " + streaming);
                }
                String stdinJson = gson.toJson(stdinInput);

                List<String> command = new ArrayList<>();
                command.add(node);
                command.add(new File(workDir, CHANNEL_SCRIPT).getAbsolutePath());
                command.add("claude");
                command.add(hasAttachments ? "sendWithAttachments" : "send");

                File processTempDir = processManager.prepareClaudeTempDir();
                Set<String> existingTempMarkers = processManager.snapshotClaudeCwdFiles(processTempDir);

                ProcessBuilder pb = new ProcessBuilder(command);

                // Set working directory
                if (cwd != null && !cwd.isEmpty() && !"undefined".equals(cwd) && !"null".equals(cwd)) {
                    File userWorkDir = new File(cwd);
                    if (userWorkDir.exists() && userWorkDir.isDirectory()) {
                        pb.directory(userWorkDir);
                    } else {
                        pb.directory(getDirectoryResolver().findSdkDir());
                    }
                } else {
                    pb.directory(getDirectoryResolver().findSdkDir());
                }

                Map<String, String> env = pb.environment();
                envConfigurator.configureProjectPath(env, cwd);
                envConfigurator.configureTempDir(env, processTempDir);
                env.put("CLAUDE_USE_STDIN", "true");

                pb.redirectErrorStream(true);
                envConfigurator.updateProcessEnvironment(pb, node);

                Process process = null;
                try {
                    process = pb.start();
                    LOG.info("[ClaudeSDKBridge] Node.js process started, PID: " + process.pid());

                    // Check for early exit
                    try {
                        Thread.sleep(500);
                        if (!process.isAlive()) {
                            int earlyExitCode = process.exitValue();
                            LOG.error("[ClaudeSDKBridge] Process exited immediately, exitCode: " + earlyExitCode);
                            try (BufferedReader earlyReader = new BufferedReader(
                                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                                StringBuilder earlyOutput = new StringBuilder();
                                String line;
                                while ((line = earlyReader.readLine()) != null) {
                                    earlyOutput.append(line).append("\n");
                                    LOG.error("[ClaudeSDKBridge] Process output: " + line);
                                }
                                LOG.debug("[ClaudeSDKBridge] Early exit - captured " + earlyOutput.length() + " chars");
                                if (earlyOutput.length() > 0) {
                                    lastNodeError[0] = earlyOutput.toString().trim();
                                }
                            }
                        }
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }

                    processManager.registerProcess(channelId, process);

                    // Write to stdin
                    try (java.io.OutputStream stdin = process.getOutputStream()) {
                        stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
                        stdin.flush();
                    } catch (Exception e) {
                        // Ignore
                    }

                    // Create processing context with diagnostics
                    OutputLineProcessor.ProcessingContext context =
                            new OutputLineProcessor.ProcessingContext(result, assistantContent)
                                    .withDiagnostics(node, nodeVersion, workDir.getAbsolutePath());

                    // Process output lines
                    final int[] lineCountHolder = {0};
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {

                        String line;
                        while ((line = reader.readLine()) != null) {
                            lineCountHolder[0]++;
                            // Diagnostic logging for first 50 lines
                            if (lineCountHolder[0] <= 50) {
                                LOG.info("[DIAG-OUTPUT] Line " + lineCountHolder[0] + ": " + line);
                            }

                            // Use OutputLineProcessor for standard message types
                            boolean processed = outputLineProcessor.processLine(line, context, callback);

                            if (!processed) {
                                // Forward unrecognized Node.js output to frontend for debugging
                                callback.onMessage("node_log", line);
                            }
                        }
                    }

                    // Sync state back from context
                    hadSendError[0] = context.hadSendError;
                    if (context.lastNodeError != null) {
                        lastNodeError[0] = context.lastNodeError;
                    }

                    LOG.debug("[ClaudeSDKBridge] Output loop ended, waiting for process to exit...");
                    LOG.info("[DIAG-OUTPUT] Total lines received: " + lineCountHolder[0]);
                    process.waitFor();

                    int exitCode = process.exitValue();
                    boolean wasInterrupted = processManager.wasInterrupted(channelId);
                    LOG.info("[DIAG-OUTPUT] Process exited, exitCode=" + exitCode + ", wasInterrupted=" + wasInterrupted + ", hadSendError=" + hadSendError[0] + ", totalLines=" + lineCountHolder[0]);

                    result.finalResult = assistantContent.toString();
                    result.messageCount = result.messages.size();

                    if (wasInterrupted) {
                        callback.onComplete(result);
                    } else if (!hadSendError[0]) {
                        result.success = exitCode == 0 && !wasInterrupted;
                        if (result.success) {
                            callback.onComplete(result);
                        } else {
                            String errorMsg = "Process exited with code: " + exitCode;

                            if (lastNodeError[0] != null && !lastNodeError[0].isEmpty()) {
                                errorMsg = errorMsg + "\n\nDetails: " + lastNodeError[0];
                            }
                            result.success = false;
                            result.error = errorMsg;
                            callback.onError(errorMsg);
                        }
                    } else {
                        // 已经有 SEND_ERROR，不再附加输出
                        if (exitCode == 0) {
                            result.success = true;
                            callback.onComplete(result);
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
