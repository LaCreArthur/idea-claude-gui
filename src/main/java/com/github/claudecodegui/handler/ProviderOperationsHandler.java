package com.github.claudecodegui.handler;

import com.github.claudecodegui.model.DeleteResult;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Handles provider CRUD operations and configuration management.
 * Extracted from SettingsHandler to reduce file size.
 */
public class ProviderOperationsHandler {

    private static final Logger LOG = Logger.getInstance(ProviderOperationsHandler.class);

    private final HandlerContext context;
    private final JavaScriptCaller jsCaller;

    /**
     * Callback interface for JavaScript calls.
     */
    public interface JavaScriptCaller {
        void callJavaScript(String function, String... args);
        String escapeJs(String value);
    }

    public ProviderOperationsHandler(HandlerContext context, JavaScriptCaller jsCaller) {
        this.context = context;
        this.jsCaller = jsCaller;
    }

    /**
     * Get thinking enabled setting from Claude settings.
     */
    public void handleGetThinkingEnabled() {
        try {
            Boolean enabled = context.getSettingsService().getAlwaysThinkingEnabledFromClaudeSettings();
            boolean value = enabled != null ? enabled : true;

            JsonObject payload = new JsonObject();
            payload.addProperty("enabled", value);
            payload.addProperty("explicit", enabled != null);

            Gson gson = new Gson();
            String json = gson.toJson(payload);

            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.updateThinkingEnabled", jsCaller.escapeJs(json));
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to get thinking enabled: " + e.getMessage(), e);
        }
    }

    /**
     * Set thinking enabled setting in Claude settings.
     */
    public void handleSetThinkingEnabled(String content) {
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
                jsCaller.callJavaScript("window.updateThinkingEnabled", jsCaller.escapeJs(json));
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to set thinking enabled: " + e.getMessage(), e);
        }
    }

    /**
     * Get auth status (proactive check on startup).
     */
    public void handleGetAuthStatus() {
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject config = context.getSettingsService().getCurrentClaudeConfig();
                String authType = config.has("authType") ? config.get("authType").getAsString() : "none";
                boolean authenticated = !"none".equals(authType);

                JsonObject result = new JsonObject();
                result.addProperty("authenticated", authenticated);
                result.addProperty("authType", authType);

                String json = new Gson().toJson(result);
                ApplicationManager.getApplication().invokeLater(() -> {
                    jsCaller.callJavaScript("window.updateAuthStatus", jsCaller.escapeJs(json));
                });
            } catch (Exception e) {
                LOG.error("[ProviderOperationsHandler] Failed to get auth status: " + e.getMessage(), e);
                JsonObject result = new JsonObject();
                result.addProperty("authenticated", false);
                result.addProperty("authType", "none");
                ApplicationManager.getApplication().invokeLater(() -> {
                    jsCaller.callJavaScript("window.updateAuthStatus", jsCaller.escapeJs(new Gson().toJson(result)));
                });
            }
        });
    }

    /**
     * Get all providers.
     */
    public void handleGetProviders() {
        try {
            List<JsonObject> providers = context.getSettingsService().getClaudeProviders();
            Gson gson = new Gson();
            String providersJson = gson.toJson(providers);

            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.updateProviders", jsCaller.escapeJs(providersJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to get providers: " + e.getMessage(), e);
        }
    }

    /**
     * Get current Claude CLI configuration (~/.claude/settings.json).
     */
    public void handleGetCurrentClaudeConfig() {
        try {
            JsonObject config = context.getSettingsService().getCurrentClaudeConfig();
            Gson gson = new Gson();
            String configJson = gson.toJson(config);

            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.updateCurrentClaudeConfig", jsCaller.escapeJs(configJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to get current claude config: " + e.getMessage(), e);
        }
    }

    /**
     * Add a new provider.
     */
    public void handleAddProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject provider = gson.fromJson(content, JsonObject.class);
            context.getSettingsService().addClaudeProvider(provider);

            ApplicationManager.getApplication().invokeLater(() -> {
                handleGetProviders(); // Refresh list
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to add provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError", jsCaller.escapeJs("Failed to add provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Update an existing provider.
     */
    public void handleUpdateProvider(String content) {
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
            LOG.error("[ProviderOperationsHandler] Failed to update provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError", jsCaller.escapeJs("Failed to update provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Delete a provider.
     */
    public void handleDeleteProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject data = gson.fromJson(content, JsonObject.class);

            if (!data.has("id")) {
                LOG.error("[ProviderOperationsHandler] ERROR: Missing 'id' field in delete request");
                ApplicationManager.getApplication().invokeLater(() -> {
                    jsCaller.callJavaScript("window.showError", jsCaller.escapeJs("Delete failed: Missing provider ID"));
                });
                return;
            }

            String id = data.get("id").getAsString();
            LOG.info("[ProviderOperationsHandler] Deleting provider with ID: " + id);

            DeleteResult result = context.getSettingsService().deleteClaudeProvider(id);

            if (result.isSuccess()) {
                LOG.info("[ProviderOperationsHandler] Delete successful, refreshing provider list");
                ApplicationManager.getApplication().invokeLater(() -> {
                    handleGetProviders(); // Refresh list
                });
            } else {
                String errorMsg = result.getUserFriendlyMessage();
                LOG.warn("[ProviderOperationsHandler] Delete provider failed: " + errorMsg);
                ApplicationManager.getApplication().invokeLater(() -> {
                    jsCaller.callJavaScript("window.showError", jsCaller.escapeJs(errorMsg));
                });
            }
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Exception in handleDeleteProvider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError", jsCaller.escapeJs("Failed to delete provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Switch to a different provider.
     */
    public void handleSwitchProvider(String content) {
        try {
            Gson gson = new Gson();
            JsonObject data = gson.fromJson(content, JsonObject.class);
            String id = data.get("id").getAsString();

            if ("__local_settings_json__".equals(id)) {
                handleSwitchToLocalSettings(gson, id);
                return;
            }

            context.getSettingsService().switchClaudeProvider(id);
            context.getSettingsService().applyActiveProviderToClaudeSettings();

            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showSwitchSuccess", jsCaller.escapeJs("Provider switched successfully\n\nAutomatically synced to ~/.claude/settings.json. Next query will use the new configuration."));
                handleGetProviders();
                handleGetCurrentClaudeConfig();
                handleGetActiveProvider();
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to switch provider: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError", jsCaller.escapeJs("Failed to switch provider: " + e.getMessage()));
            });
        }
    }

    /**
     * Handle switching to local settings.json.
     */
    private void handleSwitchToLocalSettings(Gson gson, String id) {
        // Validate settings.json exists
        Path settingsPath = Paths.get(System.getProperty("user.home"), ".claude", "settings.json");
        if (!Files.exists(settingsPath)) {
            LOG.warn("[ProviderOperationsHandler] Local settings.json does not exist at: " + settingsPath);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError",
                    jsCaller.escapeJs("Local provider settings.json not found"));
            });
            return;
        }

        // Validate JSON format
        try {
            String settingsContent = Files.readString(settingsPath);
            gson.fromJson(settingsContent, JsonObject.class);
        } catch (JsonSyntaxException e) {
            LOG.error("[ProviderOperationsHandler] Invalid JSON in settings.json: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError",
                    jsCaller.escapeJs("Invalid JSON in local settings.json: " + e.getMessage()));
            });
            return;
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to read settings.json: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError",
                    jsCaller.escapeJs("Failed to read local settings.json: " + e.getMessage()));
            });
            return;
        }

        JsonObject config;
        try {
            config = context.getSettingsService().readConfig();
        } catch (java.io.IOException e) {
            LOG.error("[ProviderOperationsHandler] Failed to read config: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError",
                    jsCaller.escapeJs("Failed to read config: " + e.getMessage()));
            });
            return;
        }
        if (!config.has("claude")) {
            JsonObject claude = new JsonObject();
            claude.add("providers", new JsonObject());
            claude.addProperty("current", "");
            config.add("claude", claude);
        }
        config.getAsJsonObject("claude").addProperty("current", id);
        try {
            context.getSettingsService().writeConfig(config);
        } catch (java.io.IOException e) {
            LOG.error("[ProviderOperationsHandler] Failed to write config: " + e.getMessage(), e);
            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.showError",
                    jsCaller.escapeJs("Failed to write config: " + e.getMessage()));
            });
            return;
        }

        LOG.info("[ProviderOperationsHandler] Switched to LOCAL settings.json provider");

        ApplicationManager.getApplication().invokeLater(() -> {
            jsCaller.callJavaScript("window.showSwitchSuccess",
                jsCaller.escapeJs("Successfully switched to local settings"));
            handleGetProviders();
            handleGetCurrentClaudeConfig();
            handleGetActiveProvider();
        });
    }

    /**
     * Get currently active provider.
     */
    public void handleGetActiveProvider() {
        try {
            JsonObject provider = context.getSettingsService().getActiveClaudeProvider();
            Gson gson = new Gson();
            String providerJson = gson.toJson(provider);

            ApplicationManager.getApplication().invokeLater(() -> {
                jsCaller.callJavaScript("window.updateActiveProvider", jsCaller.escapeJs(providerJson));
            });
        } catch (Exception e) {
            LOG.error("[ProviderOperationsHandler] Failed to get active provider: " + e.getMessage(), e);
        }
    }

    /**
     * Save imported providers.
     */
    public void handleSaveImportedProviders(String content) {
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
     * Send info notification to frontend.
     */
    public void sendInfoToFrontend(String title, String message) {
        jsCaller.callJavaScript("backend_notification", "info", jsCaller.escapeJs(title), jsCaller.escapeJs(message));
    }

    /**
     * Send error notification to frontend.
     */
    public void sendErrorToFrontend(String title, String message) {
        jsCaller.callJavaScript("backend_notification", "error", jsCaller.escapeJs(title), jsCaller.escapeJs(message));
    }
}
