package com.github.claudecodegui.settings;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import com.intellij.openapi.diagnostic.Logger;

public class ConfigPathManager {
    private static final Logger LOG = Logger.getInstance(ConfigPathManager.class);

    private static final String CONFIG_DIR_NAME = ".claude-gui";
    private static final String CONFIG_FILE_NAME = "config.json";
    private static final String BACKUP_FILE_NAME = "config.json.bak";
    private static final String AGENT_FILE_NAME = "agent.json";
    private static final String CLAUDE_DIR_NAME = ".claude";
    private static final String CLAUDE_SETTINGS_FILE_NAME = "settings.json";

    public String getConfigPath() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME).toString();
    }

    public String getBackupPath() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, CONFIG_DIR_NAME, BACKUP_FILE_NAME).toString();
    }

    public Path getConfigDir() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, CONFIG_DIR_NAME);
    }

    public Path getConfigFilePath() {
        return getConfigDir().resolve(CONFIG_FILE_NAME);
    }

    public Path getAgentFilePath() {
        return getConfigDir().resolve(AGENT_FILE_NAME);
    }

    public Path getClaudeSettingsPath() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, CLAUDE_DIR_NAME, CLAUDE_SETTINGS_FILE_NAME);
    }

    public void ensureConfigDirectory() throws IOException {
        Path configDir = getConfigDir();
        if (!Files.exists(configDir)) {
            Files.createDirectories(configDir);
            LOG.info("[ConfigPathManager] Created config directory: " + configDir);
        }
    }
}
