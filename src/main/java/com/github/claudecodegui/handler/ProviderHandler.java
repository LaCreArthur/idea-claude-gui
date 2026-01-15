package com.github.claudecodegui.handler;

import com.github.claudecodegui.model.DeleteResult;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileChooser.FileChooser;
import com.intellij.openapi.fileChooser.FileChooserDescriptor;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Provider message handler
 * Handles provider CRUD operations and switching for Claude
 */
public class ProviderHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(ProviderHandler.class);

    private static final String[] SUPPORTED_TYPES = {
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

    public ProviderHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "get_providers":
                handleGetProviders();
                return true;
            case "get_current_claude_config":
                handleGetCurrentClaudeConfig();
                return true;
            case "get_thinking_enabled":
                handleGetThinkingEnabled();
                return true;
            case "set_thinking_enabled":
                handleSetThinkingEnabled(content);
                return true;
            case "add_provider":
                handleAddProvider(content);
                return true;
            case "update_provider":
                handleUpdateProvider(content);
                return true;
            case "delete_provider":
                handleDeleteProvider(content);
                return true;
            case "switch_provider":
                handleSwitchProvider(content);
                return true;
            case "get_active_provider":
                handleGetActiveProvider();
                return true;
            case "save_imported_providers":
                handleSaveImportedProviders(content);
                return true;
            default:
                return false;
        }
    }

    private void handleGetThinkingEnabled() {
        try {
            Boolean enabled = context.getSettingsService().getAlwaysThinkingEnabledFromClaudeSettings();
            boolean value = enabled != null ? enabled : true;

            JsonObject payload = new JsonObject();
            payload.addProperty("enabled", value);
            payload.addProperty("explicit", enabled != null);

            Gson gson = new Gson();
            String json = gson.toJson(payload);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateThinkingEnabled", escapeJs(json));
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to get thinking enabled: " + e.getMessage(), e);
        }
    }

    private void handleSetThinkingEnabled(String content) {
        try {
            Gson gson = new Gson();
            Boolean enabled = null;
            if (content != null && !content.trim().isEmpty()) {
                try {
                    JsonObject data = gson.fromJson(content, JsonObject.class);
                    if (data != null && data.has("enabled") && !data.get("enabled").isJsonNull()) {
                        enabled = data.get("enabled").getAsBoolean();
                    }
                } catch (Exception ignored) {
                }
            }

            if (enabled == null) {
                enabled = Boolean.parseBoolean(content != null ? content.trim() : "false");
            }

            context.getSettingsService().setAlwaysThinkingEnabledInClaudeSettings(enabled);
            try {
                context.getSettingsService().setAlwaysThinkingEnabledInActiveProvider(enabled);
            } catch (Exception ignored) {
            }

            JsonObject payload = new JsonObject();
            payload.addProperty("enabled", enabled);
            payload.addProperty("explicit", true);
            String json = gson.toJson(payload);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateThinkingEnabled", escapeJs(json));
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to set thinking enabled: " + e.getMessage(), e);
        }
    }

    /**
     * Get all providers
     */
    private void handleGetProviders() {
        try {
            List<JsonObject> providers = context.getSettingsService().getClaudeProviders();
            Gson gson = new Gson();
            String providersJson = gson.toJson(providers);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateProviders", escapeJs(providersJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to get providers: " + e.getMessage(), e);
        }
    }

    /**
     * Get current Claude CLI configuration (~/.claude/settings.json)
     */
    private void handleGetCurrentClaudeConfig() {
        try {
            JsonObject config = context.getSettingsService().getCurrentClaudeConfig();
            Gson gson = new Gson();
            String configJson = gson.toJson(config);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateCurrentClaudeConfig", escapeJs(configJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to get current claude config: " + e.getMessage(), e);
        }
    }

    /**
     * Add provider
     */
    private void handleAddProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject provider = gson.fromJson(content, JsonObject.class);
            context.getSettingsService().addClaudeProvider(provider);

            ApplicationManager.getApplication().invokeLater(() -> {
                handleGetProviders(); // Refresh list
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to add provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to add provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Update provider
     */
    private void handleUpdateProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject data = gson.fromJson(content, JsonObject.class);
            String id = data.get("id").getAsString();
            JsonObject updates = data.getAsJsonObject("updates");

            context.getSettingsService().updateClaudeProvider(id, updates);

            boolean syncedActiveProvider = false;
            JsonObject activeProvider = context.getSettingsService().getActiveClaudeProvider();
            if (activeProvider != null &&
                activeProvider.has("id") &&
                id.equals(activeProvider.get("id").getAsString())) {
                context.getSettingsService().applyProviderToClaudeSettings(activeProvider);
                syncedActiveProvider = true;
            }

            final boolean finalSynced = syncedActiveProvider;
            ApplicationManager.getApplication().invokeLater(() -> {
                handleGetProviders(); // Refresh list
                if (finalSynced) {
                    handleGetActiveProvider(); // Refresh active provider config
                }
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to update provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to update provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Delete provider
     */
    private void handleDeleteProvider(String content) {
        LOG.debug("[ProviderHandler] ========== handleDeleteProvider START ==========");
        LOG.debug("[ProviderHandler] Received content: " + content);

        try {
            Gson gson = new Gson();
            JsonObject data = gson.fromJson(content, JsonObject.class);
            LOG.debug("[ProviderHandler] Parsed JSON data: " + data);

            if (!data.has("id")) {
                LOG.error("[ProviderHandler] ERROR: Missing 'id' field in request");
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.showError", escapeJs("Delete failed: Missing provider ID"));
                });
                return;
            }

            String id = data.get("id").getAsString();
            LOG.info("[ProviderHandler] Deleting provider with ID: " + id);

            DeleteResult result = context.getSettingsService().deleteClaudeProvider(id);
            LOG.debug("[ProviderHandler] Delete result - success: " + result.isSuccess());

            if (result.isSuccess()) {
                LOG.info("[ProviderHandler] Delete successful, refreshing provider list");
                ApplicationManager.getApplication().invokeLater(() -> {
                    handleGetProviders(); // Refresh list
                });
            } else {
                String errorMsg = result.getUserFriendlyMessage();
                LOG.warn("[ProviderHandler] Delete provider failed: " + errorMsg);
                LOG.warn("[ProviderHandler] Error type: " + result.getErrorType());
                LOG.warn("[ProviderHandler] Error details: " + result.getErrorMessage());
                ApplicationManager.getApplication().invokeLater(() -> {
                    LOG.debug("[ProviderHandler] Calling window.showError with: " + errorMsg);
                    callJavaScript("window.showError", escapeJs(errorMsg));
                });
            }
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Exception in handleDeleteProvider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to delete provider: " + e.getMessage()));
            });
        }

        LOG.debug("[ProviderHandler] ========== handleDeleteProvider END ==========");
    }

    /**
     * Switch provider
     */
    private void handleSwitchProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject data = gson.fromJson(content, JsonObject.class);
            String id = data.get("id").getAsString();

            if ("__local_settings_json__".equals(id)) {
                // Validate settings.json exists
                Path settingsPath = Paths.get(System.getProperty("user.home"), ".claude", "settings.json");
                if (!Files.exists(settingsPath)) {
                    LOG.warn("[ProviderHandler] Local settings.json does not exist at: " + settingsPath);
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("window.showError",
                            escapeJs("Local provider settings.json not found"));
                    });
                    return;
                }

                // Validate JSON format
                try {
                    String settingsContent = Files.readString(settingsPath);
                    gson.fromJson(settingsContent, JsonObject.class);
                } catch (JsonSyntaxException e) {
                    LOG.error("[ProviderHandler] Invalid JSON in settings.json: " + e.getMessage(), e);
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("window.showError",
                            escapeJs("Invalid JSON in local settings.json: " + e.getMessage()));
                    });
                    return;
                }

                JsonObject config = context.getSettingsService().readConfig();
                if (!config.has("claude")) {
                    JsonObject claude = new JsonObject();
                    claude.add("providers", new JsonObject());
                    claude.addProperty("current", "");
                    config.add("claude", claude);
                }
                config.getAsJsonObject("claude").addProperty("current", id);
                context.getSettingsService().writeConfig(config);

                LOG.info("[ProviderHandler] Switched to LOCAL settings.json provider");

                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("window.showSwitchSuccess",
                        escapeJs("Successfully switched to local settings"));
                    handleGetProviders();
                    handleGetCurrentClaudeConfig();
                    handleGetActiveProvider();
                });
                return;
            }

            context.getSettingsService().switchClaudeProvider(id);
            context.getSettingsService().applyActiveProviderToClaudeSettings();

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showSwitchSuccess", escapeJs("Provider switched successfully\n\nAutomatically synced to ~/.claude/settings.json. Next query will use the new configuration."));
                handleGetProviders();
                handleGetCurrentClaudeConfig();
                handleGetActiveProvider();
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to switch provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.showError", escapeJs("Failed to switch provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Get currently active provider
     */
    private void handleGetActiveProvider() {
        try {
            JsonObject provider = context.getSettingsService().getActiveClaudeProvider();
            Gson gson = new Gson();
            String providerJson = gson.toJson(provider);

            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("window.updateActiveProvider", escapeJs(providerJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderHandler] Failed to get active provider: " + e.getMessage(), e);
        }
    }

    /**
     * Save imported providers
     */
    private void handleSaveImportedProviders(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                Gson gson = new Gson();
                JsonObject request = gson.fromJson(content, JsonObject.class);
                JsonArray providersArray = request.getAsJsonArray("providers");

                if (providersArray == null || providersArray.size() == 0) {
                    return;
                }

                List<JsonObject> providers = new ArrayList<>();
                for (JsonElement e : providersArray) {
                    if (e.isJsonObject()) {
                        providers.add(e.getAsJsonObject());
                    }
                }

                int count = context.getSettingsService().saveProviders(providers);

                ApplicationManager.getApplication().invokeLater(() -> {
                    handleGetProviders(); // Refresh UI
                    sendInfoToFrontend("Import successful", "Successfully imported " + count + " configurations.");
                });

            } catch (Exception e) {
                LOG.error("Failed to save imported providers", e);
                sendErrorToFrontend("Save failed", e.getMessage());
            }
        });
    }

    /**
     * Send info notification to frontend
     */
    private void sendInfoToFrontend(String title, String message) {
        callJavaScript("backend_notification", "info", escapeJs(title), escapeJs(message));
    }

    /**
     * Send error notification to frontend
     */
    private void sendErrorToFrontend(String title, String message) {
        callJavaScript("backend_notification", "error", escapeJs(title), escapeJs(message));
    }
}
