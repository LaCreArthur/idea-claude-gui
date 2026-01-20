package com.github.claudecodegui.handler;

import com.github.claudecodegui.provider.claude.ClaudeHistoryReader;
import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.model.NodeDetectionResult;
import com.github.claudecodegui.util.FontConfigService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class SettingsHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SettingsHandler.class);

    private static final String NODE_PATH_PROPERTY_KEY = "claude.code.node.path";
    private static final String PERMISSION_MODE_PROPERTY_KEY = "claude.code.permission.mode";
    private static final String SEND_SHORTCUT_PROPERTY_KEY = "claude.code.send.shortcut";

    private static final String[] SUPPORTED_TYPES = {
        "get_mode",
        "set_mode",
        "set_model",
        "set_provider",
        "get_node_path",
        "set_node_path",
        "get_usage_statistics",
        "get_working_directory",
        "set_working_directory",
        "get_editor_font_config",
        "get_streaming_enabled",
        "set_streaming_enabled",
        "get_send_shortcut",
        "set_send_shortcut",
        "get_providers",
        "get_current_claude_config",
        "get_thinking_enabled",
        "set_thinking_enabled",
        "add_provider",
        "update_provider",
        "delete_provider",
        "switch_provider",
        "get_active_provider",
        "save_imported_providers"
    };

    private static final Map<String, Integer> MODEL_CONTEXT_LIMITS = new HashMap<>();
    static {
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-4-5", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-5-20251101", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-haiku-4-5", 200_000);
    }

    private final ProviderOperationsHandler providerOps;

    public SettingsHandler(HandlerContext context) {
        super(context);
        this.providerOps = new ProviderOperationsHandler(context, new ProviderOperationsHandler.JavaScriptCaller() {
            @Override
            public void callJavaScript(String function, String... args) {
                SettingsHandler.this.callJavaScript(function, args);
            }
            @Override
            public String escapeJs(String value) {
                return SettingsHandler.this.escapeJs(value);
            }
        });
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "get_mode":
                handleGetMode();
                return true;
            case "set_mode":
                handleSetMode(content);
                return true;
            case "set_model":
                handleSetModel(content);
                return true;
            case "set_provider":
                handleSetProvider(content);
                return true;
            case "get_node_path":
                handleGetNodePath();
                return true;
            case "set_node_path":
                handleSetNodePath(content);
                return true;
            case "get_usage_statistics":
                handleGetUsageStatistics(content);
                return true;
            case "get_working_directory":
                handleGetWorkingDirectory();
                return true;
            case "set_working_directory":
                handleSetWorkingDirectory(content);
                return true;
            case "get_editor_font_config":
                handleGetEditorFontConfig();
                return true;
            case "get_streaming_enabled":
                handleGetStreamingEnabled();
                return true;
            case "set_streaming_enabled":
                handleSetStreamingEnabled(content);
                return true;
            case "get_send_shortcut":
                handleGetSendShortcut();
                return true;
            case "set_send_shortcut":
                handleSetSendShortcut(content);
                return true;
            case "get_providers":
                providerOps.handleGetProviders();
                return true;
            case "get_current_claude_config":
                providerOps.handleGetCurrentClaudeConfig();
                return true;
            case "get_thinking_enabled":
                providerOps.handleGetThinkingEnabled();
                return true;
            case "set_thinking_enabled":
                providerOps.handleSetThinkingEnabled(content);
                return true;
            case "add_provider":
                providerOps.handleAddProvider(content);
                return true;
            case "update_provider":
                providerOps.handleUpdateProvider(content);
                return true;
            case "delete_provider":
                providerOps.handleDeleteProvider(content);
                return true;
            case "switch_provider":
                providerOps.handleSwitchProvider(content);
                return true;
            case "get_active_provider":
                providerOps.handleGetActiveProvider();
                return true;
            case "save_imported_providers":
                providerOps.handleSaveImportedProviders(content);
                return true;
            default:
                return false;
        }
    }

    private void handleGetMode() {
        try {
            String currentMode = "bypassPermissions";

            if (context.getSession() != null) {
                String sessionMode = context.getSession().getPermissionMode();
                if (sessionMode != null && !sessionMode.trim().isEmpty()) {
                    currentMode = sessionMode;
                }
            } else {
                PropertiesComponent props = PropertiesComponent.getInstance();
                String savedMode = props.getValue(PERMISSION_MODE_PROPERTY_KEY);
                if (savedMode != null && !savedMode.trim().isEmpty()) {
                    currentMode = savedMode.trim();
                }
            }

            final String modeToSend = currentMode;

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.onModeReceived", escapeJs(modeToSend));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get mode: " + e.getMessage(), e);
        }
    }

    private void handleSetMode(String content) {
        try {
            String mode = content;
            if (content != null && !content.isEmpty()) {
                try {
                    Gson gson = new Gson();
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("mode")) {
                        mode = json.get("mode").getAsString();
                    }
                } catch (Exception e) {
                }
            }

            if (context.getSession() != null) {
                context.getSession().setPermissionMode(mode);

                PropertiesComponent props = PropertiesComponent.getInstance();
                props.setValue(PERMISSION_MODE_PROPERTY_KEY, mode);
                LOG.info("Saved permission mode to settings: " + mode);
                com.github.claudecodegui.notifications.ClaudeNotifier.setMode(context.getProject(), mode);
            } else {
                LOG.warn("[SettingsHandler] WARNING: Session is null! Cannot set permission mode");
            }
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set mode: " + e.getMessage(), e);
        }
    }

    private void handleSetModel(String content) {
        try {
            String model = content;
            if (content != null && !content.isEmpty()) {
                try {
                    Gson gson = new Gson();
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("model")) {
                        model = json.get("model").getAsString();
                    }
                } catch (Exception e) {
                }
            }

            LOG.info("[SettingsHandler] Setting model to: " + model);

            String actualModel = resolveActualModelName(model);
            String finalModelName;
            if (actualModel != null && !actualModel.equals(model)) {
                LOG.info("[SettingsHandler] Resolved to actual model: " + actualModel);
                context.setCurrentModel(actualModel);
                finalModelName = actualModel;
            } else {
                context.setCurrentModel(model);
                finalModelName = model;
            }

            if (context.getSession() != null) {
                context.getSession().setModel(model);
            }

            com.github.claudecodegui.notifications.ClaudeNotifier.setModel(context.getProject(), model);

            int newMaxTokens = getModelContextLimit(finalModelName);
            LOG.info("[SettingsHandler] Model context limit: " + newMaxTokens + " tokens for model: " + finalModelName);

            final String confirmedModel = model;
            final String confirmedProvider = context.getCurrentProvider();
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.onModelConfirmed", escapeJs(confirmedModel), escapeJs(confirmedProvider));
                pushUsageUpdateAfterModelChange(newMaxTokens);
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set model: " + e.getMessage(), e);
        }
    }

    private void pushUsageUpdateAfterModelChange(int newMaxTokens) {
        try {
            ClaudeSession session = context.getSession();
            if (session == null) {
                sendUsageUpdate(0, newMaxTokens);
                return;
            }

            List<ClaudeSession.Message> messages = session.getMessages();
            JsonObject lastUsage = null;

            for (int i = messages.size() - 1; i >= 0; i--) {
                ClaudeSession.Message msg = messages.get(i);

                if (msg.type != ClaudeSession.Message.Type.ASSISTANT || msg.raw == null) {
                    continue;
                }

                if (msg.raw.has("message")) {
                    JsonObject message = msg.raw.getAsJsonObject("message");
                    if (message.has("usage")) {
                        lastUsage = message.getAsJsonObject("usage");
                        break;
                    }
                }

                if (msg.raw.has("usage")) {
                    lastUsage = msg.raw.getAsJsonObject("usage");
                    break;
                }
            }

            int inputTokens = lastUsage != null && lastUsage.has("input_tokens") ? lastUsage.get("input_tokens").getAsInt() : 0;
            int cacheWriteTokens = lastUsage != null && lastUsage.has("cache_creation_input_tokens") ? lastUsage.get("cache_creation_input_tokens").getAsInt() : 0;
            int cacheReadTokens = lastUsage != null && lastUsage.has("cache_read_input_tokens") ? lastUsage.get("cache_read_input_tokens").getAsInt() : 0;
            int outputTokens = lastUsage != null && lastUsage.has("output_tokens") ? lastUsage.get("output_tokens").getAsInt() : 0;

            int usedTokens = inputTokens + cacheWriteTokens + cacheReadTokens + outputTokens;

            sendUsageUpdate(usedTokens, newMaxTokens);

        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to push usage update after model change: " + e.getMessage(), e);
        }
    }

    private void sendUsageUpdate(int usedTokens, int maxTokens) {
        int percentage = Math.min(100, maxTokens > 0 ? (int) ((usedTokens * 100.0) / maxTokens) : 0);

        LOG.info("[SettingsHandler] Sending usage update: usedTokens=" + usedTokens + ", maxTokens=" + maxTokens + ", percentage=" + percentage + "%");

        JsonObject usageUpdate = new JsonObject();
        usageUpdate.addProperty("percentage", percentage);
        usageUpdate.addProperty("totalTokens", usedTokens);
        usageUpdate.addProperty("limit", maxTokens);
        usageUpdate.addProperty("usedTokens", usedTokens);
        usageUpdate.addProperty("maxTokens", maxTokens);

        String usageJson = new Gson().toJson(usageUpdate);

        ApplicationManager.getApplication().invokeLater(() -> {
            if (context.getBrowser() != null && !context.isDisposed()) {
                String js = "(function() {" +
                        "  if (typeof window.onUsageUpdate === 'function') {" +
                        "    window.onUsageUpdate('" + escapeJs(usageJson) + "');" +
                        "  }" +
                        "})();";
                context.getBrowser().getCefBrowser().executeJavaScript(js, context.getBrowser().getCefBrowser().getURL(), 0);
            } else {
                LOG.warn("[SettingsHandler] Cannot send usage update: browser is null or disposed");
            }
        });
    }

    private void handleSetProvider(String content) {
        try {
            String provider = content;
            if (content != null && !content.isEmpty()) {
                try {
                    Gson gson = new Gson();
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("provider")) {
                        provider = json.get("provider").getAsString();
                    }
                } catch (Exception e) {
                }
            }

            LOG.info("[SettingsHandler] Setting provider to: " + provider);
            context.setCurrentProvider(provider);

            if (context.getSession() != null) {
                context.getSession().setProvider(provider);
            }
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set provider: " + e.getMessage(), e);
        }
    }

    private void handleGetNodePath() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String saved = props.getValue(NODE_PATH_PROPERTY_KEY);
            String pathToSend = "";
            String versionToSend = null;

            if (saved != null && !saved.trim().isEmpty()) {
                pathToSend = saved.trim();
                NodeDetectionResult result = context.getClaudeSDKBridge().verifyAndCacheNodePath(pathToSend);
                if (result != null && result.isFound()) {
                    versionToSend = result.getNodeVersion();
                }
            } else {
                NodeDetectionResult detected = context.getClaudeSDKBridge().detectNodeWithDetails();
                if (detected != null && detected.isFound() && detected.getNodePath() != null) {
                    pathToSend = detected.getNodePath();
                    versionToSend = detected.getNodeVersion();
                    props.setValue(NODE_PATH_PROPERTY_KEY, pathToSend);
                    context.getClaudeSDKBridge().verifyAndCacheNodePath(pathToSend);
                }
            }

            final String finalPath = pathToSend;
            final String finalVersion = versionToSend;

            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("path", finalPath);
                response.addProperty("version", finalVersion);
                response.addProperty("minVersion", NodeDetector.MIN_NODE_MAJOR_VERSION);
                callJavaScript("window.updateNodePath", escapeJs(new Gson().toJson(response)));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get Node.js path: " + e.getMessage(), e);
        }
    }

    private void handleSetNodePath(String content) {
        LOG.debug("[SettingsHandler] ========== handleSetNodePath START ==========");
        LOG.debug("[SettingsHandler] Received content: " + content);
        try {
            Gson gson = new Gson();
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String path = null;
            if (json != null && json.has("path") && !json.get("path").isJsonNull()) {
                path = json.get("path").getAsString();
            }

            if (path != null) {
                path = path.trim();
            }

            PropertiesComponent props = PropertiesComponent.getInstance();
            String finalPath = "";
            String versionToSend = null;
            boolean verifySuccess = false;
            String failureMsg = null;

            if (path == null || path.isEmpty()) {
                props.unsetValue(NODE_PATH_PROPERTY_KEY);
                context.getClaudeSDKBridge().setNodeExecutable(null);
                LOG.info("[SettingsHandler] Cleared manual Node.js path from settings");

                NodeDetectionResult detected = context.getClaudeSDKBridge().detectNodeWithDetails();
                if (detected != null && detected.isFound() && detected.getNodePath() != null) {
                    finalPath = detected.getNodePath();
                    versionToSend = detected.getNodeVersion();
                    props.setValue(NODE_PATH_PROPERTY_KEY, finalPath);
                    context.getClaudeSDKBridge().verifyAndCacheNodePath(finalPath);
                    verifySuccess = true;
                }
            } else {
                props.setValue(NODE_PATH_PROPERTY_KEY, path);
                NodeDetectionResult result = context.getClaudeSDKBridge().verifyAndCacheNodePath(path);
                LOG.info("[SettingsHandler] Updated manual Node.js path from settings: " + path);
                finalPath = path;
                if (result != null && result.isFound()) {
                    versionToSend = result.getNodeVersion();
                    verifySuccess = true;
                } else {
                    failureMsg = result != null ? result.getErrorMessage() : "Unable to verify specified Node.js path";
                }
            }

            final boolean successFlag = verifySuccess;
            final String failureMsgFinal = failureMsg;
            final String finalPathToSend = finalPath;
            final String finalVersionToSend = versionToSend;

            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("path", finalPathToSend);
                response.addProperty("version", finalVersionToSend);
                response.addProperty("minVersion", NodeDetector.MIN_NODE_MAJOR_VERSION);
                callJavaScript("window.updateNodePath", escapeJs(gson.toJson(response)));

                if (successFlag) {
                    callJavaScript("window.showSwitchSuccess", escapeJs("Node.js path saved.\n\nIf environment check still fails, please close and reopen the tool window."));
                } else {
                    String msg = failureMsgFinal != null ? failureMsgFinal : "Cannot verify specified Node.js path";
                    callJavaScript("window.showError", escapeJs("Saved Node.js path is invalid: " + msg));
                }
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set Node.js path: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to save Node.js path: " + e.getMessage()));
            });
        }
        LOG.debug("[SettingsHandler] ========== handleSetNodePath END ==========");
    }

    private void handleGetUsageStatistics(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                String projectPath = "all";

                if (content != null && !content.isEmpty() && !content.equals("{}")) {
                    try {
                        Gson gson = new Gson();
                        JsonObject json = gson.fromJson(content, JsonObject.class);

                        if (json.has("scope")) {
                            String scope = json.get("scope").getAsString();
                            if ("current".equals(scope)) {
                                projectPath = context.getProject().getBasePath();
                            } else {
                                projectPath = "all";
                            }
                        }
                    } catch (Exception e) {
                        if ("current".equals(content)) {
                            projectPath = context.getProject().getBasePath();
                        } else {
                            projectPath = content;
                        }
                    }
                }

                ClaudeHistoryReader reader = new ClaudeHistoryReader();
                ClaudeHistoryReader.ProjectStatistics stats = reader.getProjectStatistics(projectPath);
                Gson gson = new Gson();
                String json = gson.toJson(stats);

                final String statsJsonFinal = json;

                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.updateUsageStatistics", escapeJs(statsJsonFinal));
                });
            } catch (Exception e) {
                LOG.error("[SettingsHandler] Failed to get usage statistics: " + e.getMessage(), e);
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.showError", escapeJs("Failed to get statistics: " + e.getMessage()));
                });
            }
        });
    }

    private void handleGetWorkingDirectory() {
        try {
            String projectPath = context.getProject().getBasePath();
            if (projectPath == null) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.updateWorkingDirectory", "{}");
                });
                return;
            }

            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            String customWorkingDir = settingsService.getCustomWorkingDirectory(projectPath);

            Gson gson = new Gson();
            JsonObject response = new JsonObject();
            response.addProperty("projectPath", projectPath);
            response.addProperty("customWorkingDir", customWorkingDir != null ? customWorkingDir : "");

            String json = gson.toJson(response);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateWorkingDirectory", escapeJs(json));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get working directory: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to get working directory config: " + e.getMessage()));
            });
        }
    }

    private void handleSetWorkingDirectory(String content) {
        try {
            String projectPath = context.getProject().getBasePath();
            if (projectPath == null) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.showError", escapeJs("Cannot get project path"));
                });
                return;
            }

            Gson gson = new Gson();
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String customWorkingDir = null;

            if (json != null && json.has("customWorkingDir") && !json.get("customWorkingDir").isJsonNull()) {
                customWorkingDir = json.get("customWorkingDir").getAsString();
            }

            if (customWorkingDir != null && !customWorkingDir.trim().isEmpty()) {
                java.io.File workingDirFile = new java.io.File(customWorkingDir);
                if (!workingDirFile.isAbsolute()) {
                    workingDirFile = new java.io.File(projectPath, customWorkingDir);
                }

                if (!workingDirFile.exists() || !workingDirFile.isDirectory()) {
                    final String errorPath = workingDirFile.getAbsolutePath();
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("window.showError", escapeJs("Working directory does not exist: " + errorPath));
                    });
                    return;
                }
            }

            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            settingsService.setCustomWorkingDirectory(projectPath, customWorkingDir);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showSuccess", escapeJs("Working directory configuration saved"));
            });

            LOG.info("[SettingsHandler] Set custom working directory: " + customWorkingDir);
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set working directory: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to save working directory config: " + e.getMessage()));
            });
        }
    }

    private void handleGetEditorFontConfig() {
        try {
            JsonObject fontConfig = FontConfigService.getEditorFontConfig();
            String fontConfigJson = fontConfig.toString();

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.onEditorFontConfigReceived", escapeJs(fontConfigJson));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get editor font config: " + e.getMessage(), e);
        }
    }

    private void handleGetStreamingEnabled() {
        try {
            String projectPath = context.getProject().getBasePath();
            if (projectPath == null) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    JsonObject response = new JsonObject();
                    response.addProperty("streamingEnabled", false);
                    callJavaScript("window.updateStreamingEnabled", escapeJs(new Gson().toJson(response)));
                });
                return;
            }

            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            boolean streamingEnabled = settingsService.getStreamingEnabled(projectPath);

            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("streamingEnabled", streamingEnabled);
                callJavaScript("window.updateStreamingEnabled", escapeJs(new Gson().toJson(response)));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get streaming enabled: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("streamingEnabled", false);
                callJavaScript("window.updateStreamingEnabled", escapeJs(new Gson().toJson(response)));
            });
        }
    }

    private void handleSetStreamingEnabled(String content) {
        try {
            String projectPath = context.getProject().getBasePath();
            if (projectPath == null) {
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.showError", escapeJs("Cannot get project path"));
                });
                return;
            }

            Gson gson = new Gson();
            JsonObject json = gson.fromJson(content, JsonObject.class);
            boolean streamingEnabled = false;

            if (json != null && json.has("streamingEnabled") && !json.get("streamingEnabled").isJsonNull()) {
                streamingEnabled = json.get("streamingEnabled").getAsBoolean();
            }

            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            settingsService.setStreamingEnabled(projectPath, streamingEnabled);

            LOG.info("[SettingsHandler] Set streaming enabled: " + streamingEnabled);

            final boolean finalStreamingEnabled = streamingEnabled;
            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("streamingEnabled", finalStreamingEnabled);
                callJavaScript("window.updateStreamingEnabled", escapeJs(gson.toJson(response)));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set streaming enabled: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to save streaming config: " + e.getMessage()));
            });
        }
    }

    private String resolveActualModelName(String baseModel) {
        try {
            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            com.google.gson.JsonObject config = settingsService.readConfig();

            if (config == null || !config.has("activeProvider")) {
                return null;
            }

            String activeProviderId = config.get("activeProvider").getAsString();
            if (!"claude-code".equals(activeProviderId)) {
                return null;
            }

            if (!config.has("providers") || !config.get("providers").isJsonArray()) {
                return null;
            }

            com.google.gson.JsonArray providers = config.getAsJsonArray("providers");
            for (com.google.gson.JsonElement providerElement : providers) {
                if (!providerElement.isJsonObject()) continue;
                com.google.gson.JsonObject provider = providerElement.getAsJsonObject();

                if (!provider.has("id") || !"claude-code".equals(provider.get("id").getAsString())) {
                    continue;
                }

                if (!provider.has("settingsConfig") || !provider.get("settingsConfig").isJsonObject()) {
                    continue;
                }

                com.google.gson.JsonObject settingsConfig = provider.getAsJsonObject("settingsConfig");
                if (!settingsConfig.has("env") || !settingsConfig.get("env").isJsonObject()) {
                    continue;
                }

                com.google.gson.JsonObject env = settingsConfig.getAsJsonObject("env");

                String actualModel = null;

                if (env.has("ANTHROPIC_MODEL") && !env.get("ANTHROPIC_MODEL").isJsonNull()) {
                    String mainModel = env.get("ANTHROPIC_MODEL").getAsString();
                    if (mainModel != null && !mainModel.trim().isEmpty()) {
                        actualModel = mainModel.trim();
                    }
                }

                if (actualModel == null) {
                    if (baseModel.contains("sonnet") && env.has("ANTHROPIC_DEFAULT_SONNET_MODEL")) {
                        actualModel = env.get("ANTHROPIC_DEFAULT_SONNET_MODEL").getAsString();
                    } else if (baseModel.contains("opus") && env.has("ANTHROPIC_DEFAULT_OPUS_MODEL")) {
                        actualModel = env.get("ANTHROPIC_DEFAULT_OPUS_MODEL").getAsString();
                    } else if (baseModel.contains("haiku") && env.has("ANTHROPIC_DEFAULT_HAIKU_MODEL")) {
                        actualModel = env.get("ANTHROPIC_DEFAULT_HAIKU_MODEL").getAsString();
                    }
                }

                if (actualModel != null && !actualModel.trim().isEmpty()) {
                    return actualModel.trim();
                }
            }
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to resolve actual model name: " + e.getMessage());
        }

        return null;
    }

    public static int getModelContextLimit(String model) {
        if (model == null || model.isEmpty()) {
            return 200_000;
        }

        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\s*\\[([0-9.]+)([kKmM])\\]\\s*$");
        java.util.regex.Matcher matcher = pattern.matcher(model);

        if (matcher.find()) {
            try {
                double value = Double.parseDouble(matcher.group(1));
                String unit = matcher.group(2).toLowerCase();

                if ("m".equals(unit)) {
                    return (int)(value * 1_000_000);
                } else if ("k".equals(unit)) {
                    return (int)(value * 1_000);
                }
            } catch (NumberFormatException e) {
                LOG.error("Failed to parse capacity from model name: " + model);
            }
        }

        return MODEL_CONTEXT_LIMITS.getOrDefault(model, 200_000);
    }

    private void handleGetSendShortcut() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String sendShortcut = props.getValue(SEND_SHORTCUT_PROPERTY_KEY, "enter");

            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("sendShortcut", sendShortcut);
                callJavaScript("window.updateSendShortcut", escapeJs(new Gson().toJson(response)));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to get send shortcut: " + e.getMessage(), e);
        }
    }

    private void handleSetSendShortcut(String content) {
        try {
            Gson gson = new Gson();
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String sendShortcut = "enter";

            if (json != null && json.has("sendShortcut") && !json.get("sendShortcut").isJsonNull()) {
                sendShortcut = json.get("sendShortcut").getAsString();
            }

            if (!"enter".equals(sendShortcut) && !"cmdEnter".equals(sendShortcut)) {
                sendShortcut = "enter";
            }

            PropertiesComponent props = PropertiesComponent.getInstance();
            props.setValue(SEND_SHORTCUT_PROPERTY_KEY, sendShortcut);

            LOG.info("[SettingsHandler] Set send shortcut: " + sendShortcut);

            final String finalSendShortcut = sendShortcut;
            ApplicationManager.getApplication().invokeLater(() -> {
                JsonObject response = new JsonObject();
                response.addProperty("sendShortcut", finalSendShortcut);
                callJavaScript("window.updateSendShortcut", escapeJs(gson.toJson(response)));
            });
        } catch (Exception e) {
            LOG.error("[SettingsHandler] Failed to set send shortcut: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to save send shortcut: " + e.getMessage()));
            });
        }
    }
}
