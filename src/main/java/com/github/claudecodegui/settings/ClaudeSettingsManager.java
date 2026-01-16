package com.github.claudecodegui.settings;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonArray;
import com.intellij.openapi.diagnostic.Logger;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class ClaudeSettingsManager {
    private static final Logger LOG = Logger.getInstance(ClaudeSettingsManager.class);

    private final Gson gson;
    private final ConfigPathManager pathManager;

    public ClaudeSettingsManager(Gson gson, ConfigPathManager pathManager) {
        this.gson = gson;
        this.pathManager = pathManager;
    }

    public JsonObject createDefaultClaudeSettings() {
        JsonObject settings = new JsonObject();
        settings.add("env", new JsonObject());
        return settings;
    }

    public JsonObject readClaudeSettings() throws IOException {
        Path settingsPath = pathManager.getClaudeSettingsPath();
        File settingsFile = settingsPath.toFile();

        if (!settingsFile.exists()) {
            return createDefaultClaudeSettings();
        }

        try (FileReader reader = new FileReader(settingsFile)) {
            return JsonParser.parseReader(reader).getAsJsonObject();
        } catch (Exception e) {
            LOG.warn("[ClaudeSettingsManager] Failed to read ~/.claude/settings.json: " + e.getMessage());
            return createDefaultClaudeSettings();
        }
    }

    public void writeClaudeSettings(JsonObject settings) throws IOException {
        Path settingsPath = pathManager.getClaudeSettingsPath();
        if (!Files.exists(settingsPath.getParent())) {
            Files.createDirectories(settingsPath.getParent());
        }

        if (!settings.has("env") || settings.get("env").isJsonNull()) {
            settings.add("env", new JsonObject());
        }
        JsonObject env = settings.getAsJsonObject("env");
        env.addProperty("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");

        try (FileWriter writer = new FileWriter(settingsPath.toFile())) {
            gson.toJson(settings, writer);
            LOG.info("[ClaudeSettingsManager] Synced settings to: " + settingsPath);
        }
    }

    public void syncMcpToClaudeSettings() throws IOException {
        try {
            String homeDir = System.getProperty("user.home");

            Path claudeJsonPath = Paths.get(homeDir, ".claude.json");
            File claudeJsonFile = claudeJsonPath.toFile();

            if (!claudeJsonFile.exists()) {
                LOG.info("[ClaudeSettingsManager] ~/.claude.json not found, skipping MCP sync");
                return;
            }

            JsonObject claudeJson;
            try (FileReader reader = new FileReader(claudeJsonFile)) {
                claudeJson = JsonParser.parseReader(reader).getAsJsonObject();
            } catch (Exception e) {
                LOG.error("[ClaudeSettingsManager] Failed to parse ~/.claude.json: " + e.getMessage(), e);
                LOG.error("[ClaudeSettingsManager] This may indicate a corrupted JSON file. Please check ~/.claude.json");

                File backup = new File(claudeJsonFile.getParent(), ".claude.json.backup");
                if (backup.exists()) {
                    LOG.info("[ClaudeSettingsManager] Found backup file, you may need to restore it manually");
                }
                return;
            }

            JsonObject settings = readClaudeSettings();

            if (claudeJson.has("mcpServers")) {
                settings.add("mcpServers", claudeJson.get("mcpServers"));
                LOG.info("[ClaudeSettingsManager] Synced mcpServers to settings.json");
            }

            if (claudeJson.has("disabledMcpServers")) {
                settings.add("disabledMcpServers", claudeJson.get("disabledMcpServers"));
                JsonArray disabledServers = claudeJson.getAsJsonArray("disabledMcpServers");
                LOG.info("[ClaudeSettingsManager] Synced " + disabledServers.size()
                    + " disabled MCP servers to settings.json");
            }

            writeClaudeSettings(settings);

            LOG.info("[ClaudeSettingsManager] Successfully synced MCP configuration to ~/.claude/settings.json");
        } catch (Exception e) {
            LOG.error("[ClaudeSettingsManager] Failed to sync MCP to Claude settings: " + e.getMessage(), e);
            throw new IOException("Failed to sync MCP settings", e);
        }
    }

    public boolean hasCliSessionAuth() {
        try {
            Path credentialsPath = Paths.get(System.getProperty("user.home"), ".claude", ".credentials.json");
            if (!Files.exists(credentialsPath)) {
                return false;
            }
            String content = Files.readString(credentialsPath);
            JsonObject credentials = JsonParser.parseString(content).getAsJsonObject();
            if (credentials.has("claudeAiOauth")) {
                JsonObject oauth = credentials.getAsJsonObject("claudeAiOauth");
                if (oauth.has("accessToken")) {
                    String token = oauth.get("accessToken").getAsString();
                    return token != null && !token.isEmpty();
                }
            }
            return false;
        } catch (Exception e) {
            LOG.warn("[ClaudeSettingsManager] Failed to check CLI session auth: " + e.getMessage());
            return false;
        }
    }

    public JsonObject getCurrentClaudeConfig() throws IOException {
        JsonObject claudeSettings = readClaudeSettings();
        JsonObject result = new JsonObject();

        boolean hasCliSession = hasCliSessionAuth();
        result.addProperty("hasCliSession", hasCliSession);

        if (claudeSettings.has("env")) {
            JsonObject env = claudeSettings.getAsJsonObject("env");

            String apiKey = "";
            String authType = "none";

            if (env.has("ANTHROPIC_AUTH_TOKEN") && !env.get("ANTHROPIC_AUTH_TOKEN").getAsString().isEmpty()) {
                apiKey = env.get("ANTHROPIC_AUTH_TOKEN").getAsString();
                authType = "auth_token";
            } else if (env.has("ANTHROPIC_API_KEY") && !env.get("ANTHROPIC_API_KEY").getAsString().isEmpty()) {
                apiKey = env.get("ANTHROPIC_API_KEY").getAsString();
                authType = "api_key";
            } else if (hasCliSession) {
                authType = "cli_session";
            }

            String baseUrl = env.has("ANTHROPIC_BASE_URL") ? env.get("ANTHROPIC_BASE_URL").getAsString() : "";

            result.addProperty("apiKey", apiKey);
            result.addProperty("authType", authType);
            result.addProperty("baseUrl", baseUrl);
        } else {
            result.addProperty("apiKey", "");
            result.addProperty("authType", hasCliSession ? "cli_session" : "none");
            result.addProperty("baseUrl", "");
        }

        if (claudeSettings.has("codemossProviderId")) {
            String providerId = claudeSettings.get("codemossProviderId").getAsString();
            result.addProperty("providerId", providerId);
        }

        return result;
    }

    public Boolean getAlwaysThinkingEnabled() throws IOException {
        JsonObject claudeSettings = readClaudeSettings();
        if (!claudeSettings.has("alwaysThinkingEnabled") || claudeSettings.get("alwaysThinkingEnabled").isJsonNull()) {
            return null;
        }
        try {
            return claudeSettings.get("alwaysThinkingEnabled").getAsBoolean();
        } catch (Exception e) {
            return null;
        }
    }

    public void setAlwaysThinkingEnabled(boolean enabled) throws IOException {
        JsonObject claudeSettings = readClaudeSettings();
        claudeSettings.addProperty("alwaysThinkingEnabled", enabled);
        writeClaudeSettings(claudeSettings);
    }

    public void applyProviderToClaudeSettings(JsonObject provider) throws IOException {
        if (provider == null) {
            throw new IllegalArgumentException("Provider cannot be null");
        }

        if (!provider.has("settingsConfig") || provider.get("settingsConfig").isJsonNull()) {
            throw new IllegalArgumentException("Provider is missing settingsConfig");
        }

        JsonObject settingsConfig = provider.getAsJsonObject("settingsConfig");
        JsonObject oldClaudeSettings = readClaudeSettings();

        JsonObject claudeSettings = new JsonObject();

        for (String key : settingsConfig.keySet()) {
            if (!settingsConfig.get(key).isJsonNull()) {
                claudeSettings.add(key, settingsConfig.get(key));
            }
        }

        if (oldClaudeSettings.has("mcpServers")) {
            claudeSettings.add("mcpServers", oldClaudeSettings.get("mcpServers"));
        }
        if (oldClaudeSettings.has("disabledMcpServers")) {
            claudeSettings.add("disabledMcpServers", oldClaudeSettings.get("disabledMcpServers"));
        }
        if (oldClaudeSettings.has("plugins")) {
            claudeSettings.add("plugins", oldClaudeSettings.get("plugins"));
        }

        if (provider.has("id") && !provider.get("id").isJsonNull()) {
            claudeSettings.addProperty("codemossProviderId", provider.get("id").getAsString());
        }

        writeClaudeSettings(claudeSettings);
    }

    public void syncSkillsToClaudeSettings(JsonArray plugins) throws IOException {
        JsonObject claudeSettings = readClaudeSettings();
        claudeSettings.add("plugins", plugins);
        writeClaudeSettings(claudeSettings);
    }
}
