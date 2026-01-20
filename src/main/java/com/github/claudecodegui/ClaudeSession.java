package com.github.claudecodegui;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.github.claudecodegui.permission.PermissionManager;
import com.github.claudecodegui.permission.PermissionRequest;
import com.github.claudecodegui.permission.PermissionService;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.session.ClaudeMessageHandler;
import com.github.claudecodegui.util.EditorFileUtils;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.project.Project;
import com.intellij.util.concurrency.AppExecutorUtil;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Claude session manager
 * Maintains state and message history for a conversation session
 */
public class ClaudeSession {

    private static final Logger LOG = Logger.getInstance(ClaudeSession.class);
    private final Gson gson = new Gson();
    private final Project project;

    // Session state manager
    private final com.github.claudecodegui.session.SessionState state;

    // Message handlers
    private final com.github.claudecodegui.session.MessageParser messageParser;
    private final com.github.claudecodegui.session.MessageMerger messageMerger;

    // Context collector
    private final com.github.claudecodegui.session.EditorContextCollector contextCollector;

    // Callback handler
    private final com.github.claudecodegui.session.CallbackHandler callbackHandler;

    // SDK bridge
    private final ClaudeSDKBridge claudeSDKBridge;

    // Permission management
    private final PermissionManager permissionManager = new PermissionManager();

    /**
     * Message class
     */
    public static class Message {
        public enum Type {
            USER, ASSISTANT, SYSTEM, ERROR
        }

        public Type type;
        public String content;
        public long timestamp;
        public JsonObject raw; // Raw message data

        public Message(Type type, String content) {
            this.type = type;
            this.content = content;
            this.timestamp = System.currentTimeMillis();
        }

        public Message(Type type, String content, JsonObject raw) {
            this(type, content);
            this.raw = raw;
        }
    }

    /**
     * Session callback interface
     */
    public interface SessionCallback {
        void onMessageUpdate(List<Message> messages);
        void onStateChange(boolean busy, boolean loading, String error);
        void onSessionIdReceived(String sessionId);
        void onPermissionRequested(PermissionRequest request);
        void onThinkingStatusChanged(boolean isThinking);
        void onSlashCommandsReceived(List<String> slashCommands);
        void onNodeLog(String log);
        void onSummaryReceived(String summary);

        // Streaming callbacks (with default implementations for backward compatibility)
        default void onStreamStart() {}
        default void onStreamEnd() {}
        default void onContentDelta(String delta) {}
        default void onThinkingDelta(String delta) {}
    }

    public ClaudeSession(Project project, ClaudeSDKBridge claudeSDKBridge) {
        this.project = project;
        this.claudeSDKBridge = claudeSDKBridge;

        // Initialize managers
        this.state = new com.github.claudecodegui.session.SessionState();
        this.messageParser = new com.github.claudecodegui.session.MessageParser();
        this.messageMerger = new com.github.claudecodegui.session.MessageMerger();
        this.contextCollector = new com.github.claudecodegui.session.EditorContextCollector(project);
        this.callbackHandler = new com.github.claudecodegui.session.CallbackHandler();

        // Set permission manager callback
        permissionManager.setOnPermissionRequestedCallback(request -> {
            callbackHandler.notifyPermissionRequested(request);
        });
    }

    public void setCallback(SessionCallback callback) {
        callbackHandler.setCallback(callback);
    }

    public com.github.claudecodegui.session.EditorContextCollector getContextCollector() {
        return contextCollector;
    }

    // Getters - delegated to SessionState
    public String getSessionId() {
        return state.getSessionId();
    }

    public String getChannelId() {
        return state.getChannelId();
    }

    public boolean isBusy() {
        return state.isBusy();
    }

    public boolean isLoading() {
        return state.isLoading();
    }

    public String getError() {
        return state.getError();
    }

    public List<Message> getMessages() {
        return state.getMessages();
    }

    public String getSummary() {
        return state.getSummary();
    }

    public long getLastModifiedTime() {
        return state.getLastModifiedTime();
    }

    /**
     * Set session ID and working directory (for session restoration)
     */
    public void setSessionInfo(String sessionId, String cwd) {
        state.setSessionId(sessionId);
        if (cwd != null) {
            setCwd(cwd);
        } else {
            state.setCwd(null);
        }
    }

    /**
     * Get current working directory
     */
    public String getCwd() {
        return state.getCwd();
    }

    /**
     * Set working directory
     */
    public void setCwd(String cwd) {
        state.setCwd(cwd);
        LOG.info("Working directory updated to: " + cwd);
    }

    /**
     * Launch Claude Agent
     * Reuse channelId if exists, otherwise create new one
     */
    public CompletableFuture<String> launchClaude() {
        if (state.getChannelId() != null) {
            return CompletableFuture.completedFuture(state.getChannelId());
        }

        state.setError(null);
        state.setChannelId(UUID.randomUUID().toString());

        return CompletableFuture.supplyAsync(() -> {
            try {
                // Check and clean incorrect sessionId (if it's a path instead of UUID)
                String currentSessionId = state.getSessionId();
                if (currentSessionId != null && (currentSessionId.contains("/") || currentSessionId.contains("\\"))) {
                    LOG.warn("sessionId looks like a path, resetting: " + currentSessionId);
                    state.setSessionId(null);
                    currentSessionId = null;
                }

                String currentChannelId = state.getChannelId();
                String currentCwd = state.getCwd();
                JsonObject result = claudeSDKBridge.launchChannel(currentChannelId, currentSessionId, currentCwd);

                // Check if sessionId exists and is not null
                if (result.has("sessionId") && !result.get("sessionId").isJsonNull()) {
                    String newSessionId = result.get("sessionId").getAsString();
                    // Validate sessionId format (should be UUID format)
                    if (!newSessionId.contains("/") && !newSessionId.contains("\\")) {
                        state.setSessionId(newSessionId);
                        callbackHandler.notifySessionIdReceived(newSessionId);
                    } else {
                        LOG.warn("Ignoring invalid sessionId: " + newSessionId);
                    }
                }

                return currentChannelId;
            } catch (Exception e) {
                state.setError(e.getMessage());
                state.setChannelId(null);
                updateState();
                throw new RuntimeException("Failed to launch: " + e.getMessage(), e);
            }
        }).orTimeout(com.github.claudecodegui.config.TimeoutConfig.QUICK_OPERATION_TIMEOUT,
                     com.github.claudecodegui.config.TimeoutConfig.QUICK_OPERATION_UNIT)
          .exceptionally(ex -> {
              if (ex instanceof java.util.concurrent.TimeoutException) {
                  String timeoutMsg = "Channel launch timeout (" +
                      com.github.claudecodegui.config.TimeoutConfig.QUICK_OPERATION_TIMEOUT + "s), please retry";
                  LOG.warn(timeoutMsg);
                  state.setError(timeoutMsg);
                  state.setChannelId(null);
                  updateState();
                  throw new RuntimeException(timeoutMsg);
              }
              throw new RuntimeException(ex.getCause());
          });
    }

    /**
     * Send message (for backward compatibility)
     */
    public CompletableFuture<Void> send(String input) {
        return send(input, (List<Attachment>) null, null);
    }

    /**
     * Send message with specific agent prompt
     */
    public CompletableFuture<Void> send(String input, String agentPrompt) {
        return send(input, null, agentPrompt);
    }

    /**
     * Send message with attachments (for backward compatibility)
     */
    public CompletableFuture<Void> send(String input, List<Attachment> attachments) {
        return send(input, attachments, null);
    }

    /**
     * Send message with attachments and specific agent prompt
     * @param input User input message text
     * @param attachments Attachment list (can be null)
     * @param agentPrompt Agent prompt (if null, uses global setting)
     */
    public CompletableFuture<Void> send(String input, List<Attachment> attachments, String agentPrompt) {
        // Step 1: Prepare user message
        String normalizedInput = (input != null) ? input.trim() : "";
        Message userMessage = buildUserMessage(normalizedInput, attachments);

        // Step 2: Update session state
        updateSessionStateForSend(userMessage, normalizedInput);

        // Save agentPrompt for later use
        final String finalAgentPrompt = agentPrompt;

        // Step 3: Launch Claude and send message
        return launchClaude().thenCompose(chId -> {
            // Set whether PSI semantic context collection is enabled
            contextCollector.setPsiContextEnabled(state.isPsiContextEnabled());
            return contextCollector.collectContext().thenCompose(openedFilesJson ->
                sendMessageToClaude(chId, normalizedInput, attachments, openedFilesJson, finalAgentPrompt)
            );
        }).exceptionally(ex -> {
            state.setError(ex.getMessage());
            state.setBusy(false);
            state.setLoading(false);
            updateState();
            return null;
        });
    }

    /**
     * Build user message
     */
    private Message buildUserMessage(String normalizedInput, List<Attachment> attachments) {
        Message userMessage = new Message(Message.Type.USER, normalizedInput);

        try {
            JsonArray contentArr = new JsonArray();
            String userDisplayText = normalizedInput;

            // Handle attachments
            if (attachments != null && !attachments.isEmpty()) {
                // Add image blocks
                for (Attachment att : attachments) {
                    if (isImageAttachment(att)) {
                        contentArr.add(createImageBlock(att));
                    }
                }

                // Provide placeholder when no text input
                if (userDisplayText.isEmpty()) {
                    userDisplayText = generateAttachmentSummary(attachments);
                }
            }

            // Always add text block
            contentArr.add(createTextBlock(userDisplayText));

            // Assemble complete message
            JsonObject messageObj = new JsonObject();
            messageObj.add("content", contentArr);
            JsonObject rawUser = new JsonObject();
            rawUser.add("message", messageObj);
            userMessage.raw = rawUser;
            userMessage.content = userDisplayText;

            LOG.info("[ClaudeSession] Created user message: content=" +
                    (userDisplayText.length() > 50 ? userDisplayText.substring(0, 50) + "..." : userDisplayText) +
                    ", hasRaw=true, contentBlocks=" + contentArr.size());
        } catch (Exception e) {
            LOG.warn("Failed to build user message raw: " + e.getMessage());
        }

        return userMessage;
    }

    /**
     * Check if attachment is an image
     */
    private boolean isImageAttachment(Attachment att) {
        if (att == null) return false;
        String mt = (att.mediaType != null) ? att.mediaType : "";
        return mt.startsWith("image/") && att.data != null;
    }

    /**
     * Create image block
     */
    private JsonObject createImageBlock(Attachment att) {
        JsonObject imageBlock = new JsonObject();
        imageBlock.addProperty("type", "image");

        JsonObject source = new JsonObject();
        source.addProperty("type", "base64");
        source.addProperty("media_type", att.mediaType);
        source.addProperty("data", att.data);
        imageBlock.add("source", source);

        return imageBlock;
    }

    /**
     * Create text block
     */
    private JsonObject createTextBlock(String text) {
        JsonObject textBlock = new JsonObject();
        textBlock.addProperty("type", "text");
        textBlock.addProperty("text", text);
        return textBlock;
    }

    /**
     * Generate attachment summary
     */
    private String generateAttachmentSummary(List<Attachment> attachments) {
        int imageCount = 0;
        List<String> names = new ArrayList<>();

        for (Attachment att : attachments) {
            if (att != null && att.fileName != null && !att.fileName.isEmpty()) {
                names.add(att.fileName);
            }
            String mt = (att != null && att.mediaType != null) ? att.mediaType : "";
            if (mt.startsWith("image/")) {
                imageCount++;
            }
        }

        String nameSummary;
        if (names.isEmpty()) {
            nameSummary = imageCount > 0 ? (imageCount + " images") : (attachments.size() + " attachments");
        } else {
            if (names.size() > 3) {
                nameSummary = String.join(", ", names.subList(0, 3)) + " etc.";
            } else {
                nameSummary = String.join(", ", names);
            }
        }

        return "Uploaded attachments: " + nameSummary;
    }

    /**
     * Update session state when sending message
     */
    private void updateSessionStateForSend(Message userMessage, String normalizedInput) {
        // Add message to history
        state.addMessage(userMessage);
        notifyMessageUpdate();

        // Update summary (first message)
        if (state.getSummary() == null) {
            String baseSummary = (userMessage.content != null && !userMessage.content.isEmpty())
                ? userMessage.content
                : normalizedInput;
            String newSummary = baseSummary.length() > 45 ? baseSummary.substring(0, 45) + "..." : baseSummary;
            state.setSummary(newSummary);
            callbackHandler.notifySummaryReceived(newSummary);
        }

        // Update state
        state.updateLastModifiedTime();
        state.setError(null);
        state.setBusy(true);
        state.setLoading(true);
        com.github.claudecodegui.notifications.ClaudeNotifier.setWaiting(project);
        updateState();
    }

    /**
     * Send message to Claude
     */
    private CompletableFuture<Void> sendMessageToClaude(
        String channelId,
        String input,
        List<Attachment> attachments,
        JsonObject openedFilesJson,
        String externalAgentPrompt
    ) {
        // Always use bridge.js protocol - it now handles attachments
        LOG.info("[ClaudeSession] Using bridge.js protocol" +
            (attachments != null && !attachments.isEmpty() ? " (with attachments)" : ""));
        return sendMessageWithBridge(channelId, input, attachments, openedFilesJson, externalAgentPrompt);
    }

    /**
     * Check if the new bridge.js protocol should be used.
     * Can be controlled via settings or feature flag.
     */
    private boolean shouldUseNewBridge() {
        // New bridge.js protocol is now the default
        // Falls back to legacy only when attachments are present
        return true;
    }

    /**
     * Send message using new bridge.js protocol (stdin/stdout IPC).
     * This method handles permissions directly without file-based polling.
     *
     * @param channelId           Channel ID
     * @param input               User message
     * @param attachments         List of attachments (images, etc.)
     * @param openedFilesJson     Open files context
     * @param externalAgentPrompt Agent prompt (optional)
     * @return CompletableFuture that completes when message is processed
     */
    private CompletableFuture<Void> sendMessageWithBridge(
        String channelId,
        String input,
        List<Attachment> attachments,
        JsonObject openedFilesJson,
        String externalAgentPrompt
    ) {
        String agentPrompt = externalAgentPrompt != null ? externalAgentPrompt : getAgentPrompt();

        // Get permission service for direct permission handling
        PermissionService permissionService = project.getService(PermissionService.class);

        // Create permission callback
        ClaudeSDKBridge.PermissionCallback permissionCallback = (requestId, toolName, toolInput) -> {
            LOG.info("[Bridge] Permission request: " + toolName);
            return permissionService.requestPermissionDirect(toolName, toolInput);
        };

        // Create AskUserQuestion callback
        ClaudeSDKBridge.AskUserQuestionCallback askUserCallback = (requestId, questions) -> {
            LOG.info("[Bridge] AskUserQuestion request");
            return permissionService.requestAskUserQuestionDirect(questions);
        };

        // Create message handler for streaming callbacks
        ClaudeMessageHandler handler = new ClaudeMessageHandler(
            project,
            state,
            callbackHandler,
            messageParser,
            messageMerger,
            gson
        );

        // Read streaming configuration
        Boolean streaming = null;
        try {
            String projectPath = project.getBasePath();
            if (projectPath != null) {
                PluginSettingsService settingsService = new PluginSettingsService();
                streaming = settingsService.getStreamingEnabled(projectPath);
            }
        } catch (Exception e) {
            LOG.warn("[Streaming] Failed to read streaming config: " + e.getMessage());
        }

        return claudeSDKBridge.sendMessageWithBridge(
            channelId,
            input,
            state.getSessionId(),
            state.getCwd(),
            attachments,
            state.getPermissionMode(),
            state.getModel(),
            openedFilesJson,
            agentPrompt,
            streaming,
            permissionCallback,
            askUserCallback,
            handler
        ).thenApply(result -> null);
    }

    /**
     * Get agent prompt
     */
    private String getAgentPrompt() {
        try {
            PluginSettingsService settingsService = new PluginSettingsService();
            String selectedAgentId = settingsService.getSelectedAgentId();
            LOG.info("[Agent] Checking selected agent ID: " + (selectedAgentId != null ? selectedAgentId : "null"));

            if (selectedAgentId != null && !selectedAgentId.isEmpty()) {
                JsonObject agent = settingsService.getAgent(selectedAgentId);
                if (agent != null && agent.has("prompt") && !agent.get("prompt").isJsonNull()) {
                    String agentPrompt = agent.get("prompt").getAsString();
                    String agentName = agent.has("name") ? agent.get("name").getAsString() : "Unknown";
                    LOG.info("[Agent] Found agent: " + agentName);
                    LOG.info("[Agent] Prompt length: " + agentPrompt.length() + " chars");
                    LOG.info("[Agent] Prompt preview: " + (agentPrompt.length() > 100 ? agentPrompt.substring(0, 100) + "..." : agentPrompt));
                    return agentPrompt;
                } else {
                    LOG.info("[Agent] Agent found but no prompt configured");
                }
            } else {
                LOG.info("[Agent] No agent selected");
            }
        } catch (Exception e) {
            LOG.warn("[Agent] Failed to get agent prompt: " + e.getMessage());
        }
        return null;
    }

    /**
     * Interrupt current execution
     */
    public CompletableFuture<Void> interrupt() {
        if (state.getChannelId() == null) {
            return CompletableFuture.completedFuture(null);
        }

        return CompletableFuture.runAsync(() -> {
            try {
                claudeSDKBridge.interruptChannel(state.getChannelId());
                state.setError(null);  // Clear previous error state
                state.setBusy(false);
                updateState();
            } catch (Exception e) {
                state.setError(e.getMessage());
                updateState();
            }
        });
    }

    /**
     * Restart Claude Agent
     */
    public CompletableFuture<Void> restart() {
        return interrupt().thenCompose(v -> {
            state.setChannelId(null);
            state.setBusy(false);
            updateState();
            return launchClaude().thenApply(chId -> null);
        });
    }

    /**
     * Load history messages from server
     */
    public CompletableFuture<Void> loadFromServer() {
        if (state.getSessionId() == null) {
            return CompletableFuture.completedFuture(null);
        }

        state.setLoading(true);
        updateState();

        return CompletableFuture.runAsync(() -> {
            try {
                String currentSessionId = state.getSessionId();
                String currentCwd = state.getCwd();

                LOG.info("Loading session from server: sessionId=" + currentSessionId + ", cwd=" + currentCwd);
                List<JsonObject> serverMessages = claudeSDKBridge.getSessionMessages(currentSessionId, currentCwd);
                LOG.debug("Received " + serverMessages.size() + " messages from server");

                state.clearMessages();
                for (JsonObject msg : serverMessages) {
                    Message message = messageParser.parseServerMessage(msg);
                    if (message != null) {
                        state.addMessage(message);
                    }
                }

                LOG.debug("Total messages in session: " + state.getMessages().size());
                notifyMessageUpdate();
            } catch (Exception e) {
                LOG.error("Error loading session: " + e.getMessage(), e);
                state.setError(e.getMessage());
            } finally {
                state.setLoading(false);
                updateState();
            }
        });
    }

    /**
     * Notify message update
     */
    private void notifyMessageUpdate() {
        callbackHandler.notifyMessageUpdate(getMessages());
    }

    /**
     * Notify state update
     */
    private void updateState() {
        callbackHandler.notifyStateChange(state.isBusy(), state.isLoading(), state.getError());

        // Show error in status bar
        String error = state.getError();
        if (error != null && !error.isEmpty()) {
            com.github.claudecodegui.notifications.ClaudeNotifier.showError(project, error);
        }
    }

    /**
     * Attachment class
     */
    public static class Attachment {
        public String fileName;
        public String mediaType;
        public String data; // Base64 encoded

        public Attachment(String fileName, String mediaType, String data) {
            this.fileName = fileName;
            this.mediaType = mediaType;
            this.data = data;
        }
    }

    /**
     * Get permission manager
     */
    public PermissionManager getPermissionManager() {
        return permissionManager;
    }

    /**
     * Set permission mode
     * Maps frontend permission mode string to PermissionManager enum value
     */
    public void setPermissionMode(String mode) {
        state.setPermissionMode(mode);

        // Sync update PermissionManager's permission mode
        // Frontend mode mapping:
        // - "default" -> DEFAULT (ask each time)
        // - "acceptEdits" -> ACCEPT_EDITS (agent mode, auto-accept file edits)
        // - "bypassPermissions" -> ALLOW_ALL (auto mode, bypass all permission checks)
        // - "plan" -> DENY_ALL (plan mode, not supported yet)
        PermissionManager.PermissionMode pmMode;
        if ("bypassPermissions".equals(mode)) {
            pmMode = PermissionManager.PermissionMode.ALLOW_ALL;
            LOG.info("Permission mode set to ALLOW_ALL for mode: " + mode);
        } else if ("acceptEdits".equals(mode)) {
            pmMode = PermissionManager.PermissionMode.ACCEPT_EDITS;
            LOG.info("Permission mode set to ACCEPT_EDITS for mode: " + mode);
        } else if ("plan".equals(mode)) {
            pmMode = PermissionManager.PermissionMode.DENY_ALL;
            LOG.info("Permission mode set to DENY_ALL for mode: " + mode);
        } else {
            // "default" or other unknown modes
            pmMode = PermissionManager.PermissionMode.DEFAULT;
            LOG.info("Permission mode set to DEFAULT for mode: " + mode);
        }

        permissionManager.setPermissionMode(pmMode);
    }

    /**
     * Get permission mode
     */
    public String getPermissionMode() {
        return state.getPermissionMode();
    }

    /**
     * Set model
     */
    public void setModel(String model) {
        state.setModel(model);
        LOG.info("Model updated to: " + model);
    }

    /**
     * Get model
     */
    public String getModel() {
        return state.getModel();
    }

    /**
     * Set AI provider
     */
    public void setProvider(String provider) {
        state.setProvider(provider);
        LOG.info("Provider updated to: " + provider);
    }

    /**
     * Get AI provider
     */
    public String getProvider() {
        return state.getProvider();
    }

    /**
     * Get slash commands list
     */
    public List<String> getSlashCommands() {
        return state.getSlashCommands();
    }

    /**
     * Create permission request (for SDK call)
     */
    public PermissionRequest createPermissionRequest(String toolName, Map<String, Object> inputs, JsonObject suggestions, Project project) {
        return permissionManager.createRequest(state.getChannelId(), toolName, inputs, suggestions, project);
    }

    /**
     * Handle permission decision
     */
    public void handlePermissionDecision(String channelId, boolean allow, boolean remember, String rejectMessage) {
        permissionManager.handlePermissionDecision(channelId, allow, remember, rejectMessage);
    }

    /**
     * Handle permission decision (always allow)
     */
    public void handlePermissionDecisionAlways(String channelId, boolean allow) {
        permissionManager.handlePermissionDecisionAlways(channelId, allow);
    }
}
