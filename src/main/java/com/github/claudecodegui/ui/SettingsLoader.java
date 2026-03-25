package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

/**
 * Handles loading and saving of plugin settings from/to persistent storage.
 * Extracted from ClaudeChatWindow to reduce file size and improve maintainability.
 *
 * Node.js path management removed in Phase 2 — Kotlin agent runtime doesn't need Node.js.
 */
public class SettingsLoader {
    private static final Logger LOG = Logger.getInstance(SettingsLoader.class);

    public static final String PERMISSION_MODE_PROPERTY_KEY = "claude.code.permission.mode";

    private final ClaudeSDKBridge claudeSDKBridge;
    private final Project project;

    public SettingsLoader(ClaudeSDKBridge claudeSDKBridge, Project project) {
        this.claudeSDKBridge = claudeSDKBridge;
        this.project = project;
    }

    /**
     * Load permission mode from persistent settings and apply to session.
     */
    public void loadPermissionModeFromSettings(ClaudeSession session) {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String savedMode = props.getValue(PERMISSION_MODE_PROPERTY_KEY);
            if (savedMode != null && !savedMode.trim().isEmpty()) {
                String mode = savedMode.trim();
                if (session != null) {
                    session.setPermissionMode(mode);
                    LOG.info("Loaded permission mode from settings: " + mode);
                    com.github.claudecodegui.notifications.ClaudeNotifier.setMode(project, mode);
                }
            }
        } catch (Exception e) {
            LOG.warn("Failed to load permission mode: " + e.getMessage());
        }
    }

    /**
     * Get saved permission mode from settings without applying.
     */
    public String getSavedPermissionMode() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String savedMode = props.getValue(PERMISSION_MODE_PROPERTY_KEY);
            return (savedMode != null && !savedMode.trim().isEmpty()) ? savedMode.trim() : null;
        } catch (Exception e) {
            LOG.warn("Failed to get saved permission mode: " + e.getMessage());
            return null;
        }
    }
}
