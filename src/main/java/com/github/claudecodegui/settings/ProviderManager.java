package com.github.claudecodegui.settings;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.model.DeleteResult;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

public class ProviderManager {
    private static final Logger LOG = Logger.getInstance(ProviderManager.class);
    private static final String BACKUP_FILE_NAME = "config.json.bak";
    public static final String LOCAL_SETTINGS_PROVIDER_ID = "__local_settings_json__";

    private final Gson gson;
    private final Function<Void, JsonObject> configReader;
    private final java.util.function.Consumer<JsonObject> configWriter;
    private final ConfigPathManager pathManager;
    private final ClaudeSettingsManager claudeSettingsManager;

    public ProviderManager(
            Gson gson,
            Function<Void, JsonObject> configReader,
            java.util.function.Consumer<JsonObject> configWriter,
            ConfigPathManager pathManager,
            ClaudeSettingsManager claudeSettingsManager) {
        this.gson = gson;
        this.configReader = configReader;
        this.configWriter = configWriter;
        this.pathManager = pathManager;
        this.claudeSettingsManager = claudeSettingsManager;
    }

    public List<JsonObject> getClaudeProviders() {
        JsonObject config = configReader.apply(null);
        List<JsonObject> result = new ArrayList<>();

        if (!config.has("claude")) {
            JsonObject claude = new JsonObject();
            claude.add("providers", new JsonObject());
            claude.addProperty("current", "");
            config.add("claude", claude);
        }

        JsonObject claude = config.getAsJsonObject("claude");
        String currentId = claude.has("current") ? claude.get("current").getAsString() : null;

        // Add local provider using the extracted method
        result.add(createLocalProviderObject(LOCAL_SETTINGS_PROVIDER_ID.equals(currentId)));

        if (!claude.has("providers")) {
            return result;
        }

        JsonObject providers = claude.getAsJsonObject("providers");

        for (String key : providers.keySet()) {
            JsonObject provider = providers.getAsJsonObject(key);
            if (!provider.has("id")) {
                provider.addProperty("id", key);
            }
            provider.addProperty("isActive", key.equals(currentId));
            result.add(provider);
        }

        return result;
    }

    public JsonObject getActiveClaudeProvider() {
        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            return null;
        }

        JsonObject claude = config.getAsJsonObject("claude");
        String currentId = claude.has("current") ? claude.get("current").getAsString() : null;

        // Return local provider using the extracted method
        if (LOCAL_SETTINGS_PROVIDER_ID.equals(currentId)) {
            return createLocalProviderObject(true);
        }

        if (!claude.has("providers")) {
            return null;
        }

        JsonObject providers = claude.getAsJsonObject("providers");

        if (providers.has(currentId)) {
            JsonObject provider = providers.getAsJsonObject(currentId);
            if (!provider.has("id")) {
                provider.addProperty("id", currentId);
            }
            provider.addProperty("isActive", true);
            return provider;
        }

        return null;
    }

    public void addClaudeProvider(JsonObject provider) throws IOException {
        if (!provider.has("id")) {
            throw new IllegalArgumentException("Provider must have an id");
        }

        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            JsonObject claude = new JsonObject();
            claude.add("providers", new JsonObject());
            claude.addProperty("current", "");
            config.add("claude", claude);
        }

        JsonObject claude = config.getAsJsonObject("claude");
        JsonObject providers = claude.getAsJsonObject("providers");

        String id = provider.get("id").getAsString();

        if (providers.has(id)) {
            throw new IllegalArgumentException("Provider with id '" + id + "' already exists");
        }

        if (!provider.has("createdAt")) {
            provider.addProperty("createdAt", System.currentTimeMillis());
        }

        providers.add(id, provider);

        configWriter.accept(config);
        LOG.info("[ProviderManager] Added provider: " + id + " (not activated, user needs to manually switch)");
    }

    public void saveClaudeProvider(JsonObject provider) throws IOException {
        if (!provider.has("id")) {
            throw new IllegalArgumentException("Provider must have an id");
        }

        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            JsonObject claude = new JsonObject();
            claude.add("providers", new JsonObject());
            claude.addProperty("current", "");
            config.add("claude", claude);
        }

        JsonObject claude = config.getAsJsonObject("claude");
        JsonObject providers = claude.getAsJsonObject("providers");

        String id = provider.get("id").getAsString();

        if (providers.has(id)) {
            JsonObject existing = providers.getAsJsonObject(id);
            if (existing.has("createdAt") && !provider.has("createdAt")) {
                provider.addProperty("createdAt", existing.get("createdAt").getAsLong());
            }
        } else {
            if (!provider.has("createdAt")) {
                provider.addProperty("createdAt", System.currentTimeMillis());
            }
        }

        providers.add(id, provider);
        configWriter.accept(config);
    }

    public void updateClaudeProvider(String id, JsonObject updates) throws IOException {
        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            throw new IllegalArgumentException("No claude configuration found");
        }

        JsonObject claude = config.getAsJsonObject("claude");
        JsonObject providers = claude.getAsJsonObject("providers");

        if (!providers.has(id)) {
            throw new IllegalArgumentException("Provider with id '" + id + "' not found");
        }

        JsonObject provider = providers.getAsJsonObject(id);

        for (String key : updates.keySet()) {
            if (key.equals("id")) {
                continue;
            }

            if (updates.get(key).isJsonNull()) {
                provider.remove(key);
            } else {
                provider.add(key, updates.get(key));
            }
        }

        configWriter.accept(config);
        LOG.info("[ProviderManager] Updated provider: " + id);
    }

    public DeleteResult deleteClaudeProvider(String id) {
        Path configFilePath = null;
        Path backupFilePath = null;

        try {
            JsonObject config = configReader.apply(null);
            configFilePath = pathManager.getConfigFilePath();
            backupFilePath = pathManager.getConfigDir().resolve(BACKUP_FILE_NAME);

            if (!config.has("claude")) {
                return DeleteResult.failure(
                    DeleteResult.ErrorType.FILE_NOT_FOUND,
                    "No claude configuration found",
                    configFilePath.toString(),
                    "Please add at least one provider configuration first"
                );
            }

            JsonObject claude = config.getAsJsonObject("claude");
            JsonObject providers = claude.getAsJsonObject("providers");

            if (!providers.has(id)) {
                return DeleteResult.failure(
                    DeleteResult.ErrorType.FILE_NOT_FOUND,
                    "Provider with id '" + id + "' not found",
                    null,
                    "Please check if the provider ID is correct"
                );
            }

            try {
                Files.copy(configFilePath, backupFilePath, StandardCopyOption.REPLACE_EXISTING);
                LOG.info("[ProviderManager] Created backup: " + backupFilePath);
            } catch (IOException e) {
                LOG.warn("[ProviderManager] Warning: Failed to create backup: " + e.getMessage());
            }

            providers.remove(id);

            String currentId = claude.has("current") ? claude.get("current").getAsString() : null;
            if (id.equals(currentId)) {
                if (providers.size() > 0) {
                    String firstKey = providers.keySet().iterator().next();
                    claude.addProperty("current", firstKey);
                    LOG.info("[ProviderManager] Switched to provider: " + firstKey);
                } else {
                    claude.addProperty("current", "");
                    LOG.info("[ProviderManager] No remaining providers");
                }
            }

            configWriter.accept(config);
            LOG.info("[ProviderManager] Deleted provider: " + id);

            try {
                Files.deleteIfExists(backupFilePath);
            } catch (IOException e) {
            }

            return DeleteResult.success(id);

        } catch (Exception e) {
            if (backupFilePath != null && configFilePath != null) {
                try {
                    if (Files.exists(backupFilePath)) {
                        Files.copy(backupFilePath, configFilePath, StandardCopyOption.REPLACE_EXISTING);
                        LOG.info("[ProviderManager] Restored from backup after failure");
                    }
                } catch (IOException restoreEx) {
                    LOG.warn("[ProviderManager] Failed to restore backup: " + restoreEx.getMessage());
                }
            }

            return DeleteResult.fromException(e, configFilePath != null ? configFilePath.toString() : null);
        }
    }

    public void switchClaudeProvider(String id) throws IOException {
        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            throw new IllegalArgumentException("No claude configuration found");
        }

        JsonObject claude = config.getAsJsonObject("claude");
        JsonObject providers = claude.getAsJsonObject("providers");

        if (!providers.has(id)) {
            throw new IllegalArgumentException("Provider with id '" + id + "' not found");
        }

        claude.addProperty("current", id);
        configWriter.accept(config);
        LOG.info("[ProviderManager] Switched to provider: " + id);
    }

    public int saveProviders(List<JsonObject> providers) throws IOException {
        int count = 0;
        for (JsonObject provider : providers) {
            try {
                saveClaudeProvider(provider);
                count++;
            } catch (Exception e) {
                LOG.warn("Failed to save provider " + provider.get("id") + ": " + e.getMessage());
            }
        }
        return count;
    }

    public boolean setAlwaysThinkingEnabledInActiveProvider(boolean enabled) throws IOException {
        JsonObject config = configReader.apply(null);
        if (!config.has("claude") || config.get("claude").isJsonNull()) {
            return false;
        }

        JsonObject claude = config.getAsJsonObject("claude");
        if (!claude.has("current") || claude.get("current").isJsonNull()) {
            return false;
        }

        String currentId = claude.get("current").getAsString();
        if (currentId == null || currentId.trim().isEmpty()) {
            return false;
        }

        if (!claude.has("providers") || claude.get("providers").isJsonNull()) {
            return false;
        }

        JsonObject providers = claude.getAsJsonObject("providers");
        if (!providers.has(currentId) || providers.get(currentId).isJsonNull()) {
            return false;
        }

        JsonObject provider = providers.getAsJsonObject(currentId);
        JsonObject settingsConfig;
        if (provider.has("settingsConfig") && provider.get("settingsConfig").isJsonObject()) {
            settingsConfig = provider.getAsJsonObject("settingsConfig");
        } else {
            settingsConfig = new JsonObject();
            provider.add("settingsConfig", settingsConfig);
        }

        settingsConfig.addProperty("alwaysThinkingEnabled", enabled);
        configWriter.accept(config);
        return true;
    }

    public void applyActiveProviderToClaudeSettings() throws IOException {
        JsonObject config = configReader.apply(null);

        if (config.has("claude") &&
            config.getAsJsonObject("claude").has("current") &&
            LOCAL_SETTINGS_PROVIDER_ID.equals(config.getAsJsonObject("claude").get("current").getAsString())) {
            LOG.info("[ProviderManager] Local settings.json provider active, skipping sync to settings.json");
            return;
        }

        JsonObject activeProvider = getActiveClaudeProvider();
        if (activeProvider == null) {
            LOG.info("[ProviderManager] No active provider to sync to .claude/settings.json");
            return;
        }
        claudeSettingsManager.applyProviderToClaudeSettings(activeProvider);
    }

    private String getAiBridgePath() throws IOException {
        com.github.claudecodegui.bridge.BridgeDirectoryResolver resolver =
                com.github.claudecodegui.startup.BridgePreloader.getSharedResolver();

        File aiBridgeDir = resolver.findSdkDir();

        if (aiBridgeDir == null) {
            if (resolver.isExtractionInProgress()) {
                LOG.info("[ProviderManager] ai-bridge extraction in progress, waiting...");
                try {
                    Boolean ready = resolver.getExtractionFuture().get(60, java.util.concurrent.TimeUnit.SECONDS);
                    if (ready != null && ready) {
                        aiBridgeDir = resolver.getSdkDir();
                    }
                } catch (java.util.concurrent.TimeoutException e) {
                    throw new IOException("ai-bridge extraction timed out, please try again later", e);
                } catch (Exception e) {
                    throw new IOException("Error waiting for ai-bridge extraction: " + e.getMessage(), e);
                }
            }
        }

        if (aiBridgeDir == null || !aiBridgeDir.exists()) {
            throw new IOException("Cannot find ai-bridge directory, please check plugin installation");
        }

        LOG.info("[ProviderManager] ai-bridge directory: " + aiBridgeDir.getAbsolutePath());
        return aiBridgeDir.getAbsolutePath();
    }

    private JsonObject extractEnvConfig(JsonObject provider) {
        if (provider == null ||
            !provider.has("settingsConfig") ||
            provider.get("settingsConfig").isJsonNull()) {
            return null;
        }
        JsonObject settingsConfig = provider.getAsJsonObject("settingsConfig");
        if (!settingsConfig.has("env") || settingsConfig.get("env").isJsonNull()) {
            return null;
        }
        return settingsConfig.getAsJsonObject("env");
    }

    /**
     * Create local provider object
     * @param isActive whether this provider is currently active
     * @return JsonObject representing the local provider
     */
    private JsonObject createLocalProviderObject(boolean isActive) {
        JsonObject localProvider = new JsonObject();
        localProvider.addProperty("id", LOCAL_SETTINGS_PROVIDER_ID);
        localProvider.addProperty("name", "Local settings.json");
        localProvider.addProperty("isActive", isActive);
        localProvider.addProperty("isLocalProvider", true);
        return localProvider;
    }

    public boolean isLocalSettingsProvider(String providerId) {
        return LOCAL_SETTINGS_PROVIDER_ID.equals(providerId);
    }

    public boolean isLocalProviderActive() {
        JsonObject config = configReader.apply(null);
        if (!config.has("claude")) {
            return false;
        }
        JsonObject claude = config.getAsJsonObject("claude");
        if (!claude.has("current")) {
            return false;
        }
        return LOCAL_SETTINGS_PROVIDER_ID.equals(claude.get("current").getAsString());
    }

    /**
     * Auto-enable local settings.json provider if:
     * 1. No provider is currently configured/active
     * 2. ~/.claude/settings.json exists and is valid JSON
     *
     * This improves UX by automatically using existing Claude CLI authentication.
     * Users who have run 'claude login' shouldn't need to manually enable the provider.
     *
     * @return true if local provider was auto-enabled, false otherwise
     */
    public boolean autoEnableLocalProviderIfAvailable() {
        try {
            // Check if any provider is already active
            JsonObject activeProvider = getActiveClaudeProvider();
            if (activeProvider != null) {
                LOG.debug("[ProviderManager] Provider already active, skipping auto-enable");
                return false;
            }

            // Check if ~/.claude/settings.json exists
            Path settingsPath = java.nio.file.Paths.get(System.getProperty("user.home"), ".claude", "settings.json");
            if (!Files.exists(settingsPath)) {
                LOG.debug("[ProviderManager] ~/.claude/settings.json not found, skipping auto-enable");
                return false;
            }

            // Validate it's valid JSON
            try {
                String content = Files.readString(settingsPath);
                gson.fromJson(content, JsonObject.class);
            } catch (Exception e) {
                LOG.warn("[ProviderManager] ~/.claude/settings.json exists but is invalid JSON: " + e.getMessage());
                return false;
            }

            // Auto-enable the local provider
            LOG.info("[ProviderManager] Auto-enabling local settings.json provider (found valid ~/.claude/settings.json)");
            switchToLocalProvider();
            return true;

        } catch (Exception e) {
            LOG.warn("[ProviderManager] Failed to auto-enable local provider: " + e.getMessage(), e);
            return false;
        }
    }

    /**
     * Switch to local settings.json provider
     */
    public void switchToLocalProvider() throws IOException {
        JsonObject config = configReader.apply(null);

        if (!config.has("claude")) {
            JsonObject claude = new JsonObject();
            claude.add("providers", new JsonObject());
            config.add("claude", claude);
        }

        JsonObject claude = config.getAsJsonObject("claude");
        claude.addProperty("current", LOCAL_SETTINGS_PROVIDER_ID);

        configWriter.accept(config);
        LOG.info("[ProviderManager] Switched to local settings.json provider");
    }
}
