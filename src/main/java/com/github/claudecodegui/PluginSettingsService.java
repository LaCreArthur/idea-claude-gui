package com.github.claudecodegui;

import com.github.claudecodegui.model.DeleteResult;
import com.github.claudecodegui.settings.*;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;

public class PluginSettingsService {

    private static final Logger LOG = Logger.getInstance(PluginSettingsService.class);
    private static final int CONFIG_VERSION = 2;

    private final Gson gson;
    private final ConfigPathManager pathManager;
    private final ClaudeSettingsManager claudeSettingsManager;
    private final WorkingDirectoryManager workingDirectoryManager;
    private final AgentManager agentManager;
    private final SkillManager skillManager;
    private final McpServerManager mcpServerManager;
    private final ProviderManager providerManager;

    public PluginSettingsService() {
        this.gson = new GsonBuilder().setPrettyPrinting().serializeNulls().create();
        this.pathManager = new ConfigPathManager();
        this.claudeSettingsManager = new ClaudeSettingsManager(gson, pathManager);
        this.workingDirectoryManager = new WorkingDirectoryManager(
            (ignored) -> {
                try {
                    return readConfig();
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            (config) -> {
                try {
                    writeConfig(config);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            }
        );
        this.agentManager = new AgentManager(gson, pathManager);
        this.skillManager = new SkillManager(
            (ignored) -> {
                try {
                    return readConfig();
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            (config) -> {
                try {
                    writeConfig(config);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            claudeSettingsManager
        );
        this.mcpServerManager = new McpServerManager(
            gson,
            (ignored) -> {
                try {
                    return readConfig();
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            (config) -> {
                try {
                    writeConfig(config);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            claudeSettingsManager
        );
        this.providerManager = new ProviderManager(
            gson,
            (ignored) -> {
                try {
                    return readConfig();
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            (config) -> {
                try {
                    writeConfig(config);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            },
            pathManager,
            claudeSettingsManager
        );
    }

    public String getConfigPath() {
        return pathManager.getConfigPath();
    }

    public JsonObject readConfig() throws IOException {
        String configPath = getConfigPath();
        File configFile = new File(configPath);

        if (!configFile.exists()) {
            LOG.info("[CodemossSettings] Config file not found, creating default: " + configPath);
            return createDefaultConfig();
        }

        try (FileReader reader = new FileReader(configFile)) {
            JsonObject config = JsonParser.parseReader(reader).getAsJsonObject();
            LOG.info("[CodemossSettings] Successfully read config from: " + configPath);
            return config;
        } catch (Exception e) {
            LOG.warn("[CodemossSettings] Failed to read config: " + e.getMessage());
            return createDefaultConfig();
        }
    }

    public void writeConfig(JsonObject config) throws IOException {
        pathManager.ensureConfigDirectory();
        backupConfig();

        String configPath = getConfigPath();
        try (FileWriter writer = new FileWriter(configPath)) {
            gson.toJson(config, writer);
            LOG.info("[CodemossSettings] Successfully wrote config to: " + configPath);
        } catch (Exception e) {
            LOG.warn("[CodemossSettings] Failed to write config: " + e.getMessage());
            throw e;
        }
    }

    private void backupConfig() {
        try {
            Path configPath = pathManager.getConfigFilePath();
            if (Files.exists(configPath)) {
                Files.copy(configPath, Paths.get(pathManager.getBackupPath()), StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception e) {
            LOG.warn("[CodemossSettings] Failed to backup config: " + e.getMessage());
        }
    }

    private JsonObject createDefaultConfig() {
        JsonObject config = new JsonObject();
        config.addProperty("version", CONFIG_VERSION);
        JsonObject claude = new JsonObject();
        JsonObject providers = new JsonObject();
        claude.addProperty("current", "");
        claude.add("providers", providers);
        config.add("claude", claude);
        return config;
    }

    public JsonObject getCurrentClaudeConfig() throws IOException {
        JsonObject currentConfig = claudeSettingsManager.getCurrentClaudeConfig();
        if (currentConfig.has("providerId")) {
            String providerId = currentConfig.get("providerId").getAsString();
            try {
                JsonObject config = readConfig();
                if (config.has("claude")) {
                    JsonObject claude = config.getAsJsonObject("claude");
                    if (claude.has("providers")) {
                        JsonObject providers = claude.getAsJsonObject("providers");
                        if (providers.has(providerId)) {
                            JsonObject provider = providers.getAsJsonObject(providerId);
                            if (provider.has("name")) {
                                currentConfig.addProperty("providerName", provider.get("name").getAsString());
                            }
                        }
                    }
                }
            } catch (Exception e) {
            }
        }
        return currentConfig;
    }

    public Boolean getAlwaysThinkingEnabledFromClaudeSettings() throws IOException {
        return claudeSettingsManager.getAlwaysThinkingEnabled();
    }

    public void setAlwaysThinkingEnabledInClaudeSettings(boolean enabled) throws IOException {
        claudeSettingsManager.setAlwaysThinkingEnabled(enabled);
    }

    public boolean setAlwaysThinkingEnabledInActiveProvider(boolean enabled) throws IOException {
        return providerManager.setAlwaysThinkingEnabledInActiveProvider(enabled);
    }

    public void applyProviderToClaudeSettings(JsonObject provider) throws IOException {
        claudeSettingsManager.applyProviderToClaudeSettings(provider);
    }

    public void applyActiveProviderToClaudeSettings() throws IOException {
        providerManager.applyActiveProviderToClaudeSettings();
    }

    public String getCustomWorkingDirectory(String projectPath) throws IOException {
        return workingDirectoryManager.getCustomWorkingDirectory(projectPath);
    }

    public void setCustomWorkingDirectory(String projectPath, String customWorkingDir) throws IOException {
        workingDirectoryManager.setCustomWorkingDirectory(projectPath, customWorkingDir);
    }

    public Map<String, String> getAllWorkingDirectories() throws IOException {
        return workingDirectoryManager.getAllWorkingDirectories();
    }

    public boolean getStreamingEnabled(String projectPath) throws IOException {
        JsonObject config = readConfig();
        if (!config.has("streaming")) {
            return false;
        }
        JsonObject streaming = config.getAsJsonObject("streaming");
        if (projectPath != null && streaming.has(projectPath)) {
            return streaming.get(projectPath).getAsBoolean();
        }
        if (streaming.has("default")) {
            return streaming.get("default").getAsBoolean();
        }
        return false;
    }

    public void setStreamingEnabled(String projectPath, boolean enabled) throws IOException {
        JsonObject config = readConfig();
        JsonObject streaming;
        if (config.has("streaming")) {
            streaming = config.getAsJsonObject("streaming");
        } else {
            streaming = new JsonObject();
            config.add("streaming", streaming);
        }
        if (projectPath != null) {
            streaming.addProperty(projectPath, enabled);
        }
        streaming.addProperty("default", enabled);
        writeConfig(config);
        LOG.info("[PluginSettings] Set streaming enabled to " + enabled + " for project: " + projectPath);
    }

    public List<JsonObject> getClaudeProviders() throws IOException {
        return providerManager.getClaudeProviders();
    }

    public JsonObject getActiveClaudeProvider() throws IOException {
        return providerManager.getActiveClaudeProvider();
    }

    public void addClaudeProvider(JsonObject provider) throws IOException {
        providerManager.addClaudeProvider(provider);
    }

    public void saveClaudeProvider(JsonObject provider) throws IOException {
        providerManager.saveClaudeProvider(provider);
    }

    public void updateClaudeProvider(String id, JsonObject updates) throws IOException {
        providerManager.updateClaudeProvider(id, updates);
    }

    public DeleteResult deleteClaudeProvider(String id) {
        return providerManager.deleteClaudeProvider(id);
    }

    @Deprecated
    public void deleteClaudeProviderWithException(String id) throws IOException {
        DeleteResult result = deleteClaudeProvider(id);
        if (!result.isSuccess()) {
            throw new IOException(result.getUserFriendlyMessage());
        }
    }

    public void switchClaudeProvider(String id) throws IOException {
        providerManager.switchClaudeProvider(id);
    }

    public int saveProviders(List<JsonObject> providers) throws IOException {
        return providerManager.saveProviders(providers);
    }

    public boolean isLocalProviderActive() {
        return providerManager.isLocalProviderActive();
    }

    public boolean autoEnableLocalProviderIfAvailable() {
        return providerManager.autoEnableLocalProviderIfAvailable();
    }

    public List<JsonObject> getMcpServers() throws IOException {
        return mcpServerManager.getMcpServers();
    }

    public List<JsonObject> getMcpServersWithProjectPath(String projectPath) throws IOException {
        return mcpServerManager.getMcpServersWithProjectPath(projectPath);
    }

    public void upsertMcpServer(JsonObject server) throws IOException {
        mcpServerManager.upsertMcpServer(server);
    }

    public void upsertMcpServer(JsonObject server, String projectPath) throws IOException {
        mcpServerManager.upsertMcpServer(server, projectPath);
    }

    public boolean deleteMcpServer(String serverId) throws IOException {
        return mcpServerManager.deleteMcpServer(serverId);
    }

    public Map<String, Object> validateMcpServer(JsonObject server) {
        return mcpServerManager.validateMcpServer(server);
    }

    public List<JsonObject> getSkills() throws IOException {
        return skillManager.getSkills();
    }

    public void upsertSkill(JsonObject skill) throws IOException {
        skillManager.upsertSkill(skill);
    }

    public boolean deleteSkill(String id) throws IOException {
        return skillManager.deleteSkill(id);
    }

    public Map<String, Object> validateSkill(JsonObject skill) {
        return skillManager.validateSkill(skill);
    }

    public void syncSkillsToClaudeSettings() throws IOException {
        skillManager.syncSkillsToClaudeSettings();
    }

    public List<JsonObject> getAgents() throws IOException {
        return agentManager.getAgents();
    }

    public void addAgent(JsonObject agent) throws IOException {
        agentManager.addAgent(agent);
    }

    public void updateAgent(String id, JsonObject updates) throws IOException {
        agentManager.updateAgent(id, updates);
    }

    public boolean deleteAgent(String id) throws IOException {
        return agentManager.deleteAgent(id);
    }

    public JsonObject getAgent(String id) throws IOException {
        return agentManager.getAgent(id);
    }

    public String getSelectedAgentId() throws IOException {
        return agentManager.getSelectedAgentId();
    }

    public void setSelectedAgentId(String agentId) throws IOException {
        agentManager.setSelectedAgentId(agentId);
    }
}
