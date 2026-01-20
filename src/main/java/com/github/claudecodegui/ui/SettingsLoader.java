package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

/**
 * Handles loading and saving of plugin settings from/to persistent storage.
 * Extracted from ClaudeChatWindow to reduce file size and improve maintainability.
 */
public class SettingsLoader {
    private static final Logger LOG = Logger.getInstance(SettingsLoader.class);

    public static final String NODE_PATH_PROPERTY_KEY = "claude.code.node.path";
    public static final String PERMISSION_MODE_PROPERTY_KEY = "claude.code.permission.mode";

    private final ClaudeSDKBridge claudeSDKBridge;
    private final Project project;

    public SettingsLoader(ClaudeSDKBridge claudeSDKBridge, Project project) {
        this.claudeSDKBridge = claudeSDKBridge;
        this.project = project;
    }

    /**
     * Load Node.js path from persistent settings.
     * If no saved path exists, auto-detects and caches the Node.js installation.
     */
    public void loadNodePathFromSettings() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String savedNodePath = props.getValue(NODE_PATH_PROPERTY_KEY);

            if (savedNodePath != null && !savedNodePath.trim().isEmpty()) {
                // Use saved path
                String path = savedNodePath.trim();
                claudeSDKBridge.setNodeExecutable(path);
                // Verify and cache Node.js version
                claudeSDKBridge.verifyAndCacheNodePath(path);
                LOG.info("Using manually configured Node.js path: " + path);
            } else {
                // First install or no configured path - auto-detect and cache
                LOG.info("No saved Node.js path found, attempting auto-detection...");
                com.github.claudecodegui.model.NodeDetectionResult detected =
                    claudeSDKBridge.detectNodeWithDetails();

                if (detected != null && detected.isFound() && detected.getNodePath() != null) {
                    String detectedPath = detected.getNodePath();
                    String detectedVersion = detected.getNodeVersion();

                    // Save detected path
                    props.setValue(NODE_PATH_PROPERTY_KEY, detectedPath);

                    claudeSDKBridge.setNodeExecutable(detectedPath);

                    // Verify and cache version info
                    claudeSDKBridge.verifyAndCacheNodePath(detectedPath);

                    LOG.info("Auto-detected Node.js: " + detectedPath + " (" + detectedVersion + ")");
                } else {
                    LOG.warn("Failed to auto-detect Node.js path. Error: " +
                        (detected != null ? detected.getErrorMessage() : "Unknown error"));
                }
            }
        } catch (Exception e) {
            LOG.error("Failed to load Node.js path: " + e.getMessage(), e);
        }
    }

    /**
     * Load permission mode from persistent settings and apply to session.
     *
     * @param session The session to apply the permission mode to
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
                    // Update status bar
                    com.github.claudecodegui.notifications.ClaudeNotifier.setMode(project, mode);
                }
            }
        } catch (Exception e) {
            LOG.warn("Failed to load permission mode: " + e.getMessage());
        }
    }

    /**
     * Save permission mode to persistent settings.
     *
     * @param mode The permission mode to save
     */
    public void savePermissionModeToSettings(String mode) {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            props.setValue(PERMISSION_MODE_PROPERTY_KEY, mode);
            LOG.info("Saved permission mode to settings: " + mode);
        } catch (Exception e) {
            LOG.warn("Failed to save permission mode: " + e.getMessage());
        }
    }

    /**
     * Get saved permission mode from settings without applying.
     *
     * @return The saved permission mode, or null if not set
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

    /**
     * Clear the saved Node.js path.
     */
    public void clearNodePath() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            props.unsetValue(NODE_PATH_PROPERTY_KEY);
            claudeSDKBridge.setNodeExecutable(null);
            LOG.info("Cleared manual Node.js path");
        } catch (Exception e) {
            LOG.warn("Failed to clear Node.js path: " + e.getMessage());
        }
    }

    /**
     * Save a manual Node.js path.
     *
     * @param manualPath The path to save
     */
    public void saveNodePath(String manualPath) {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            props.setValue(NODE_PATH_PROPERTY_KEY, manualPath);
            claudeSDKBridge.setNodeExecutable(manualPath);
            claudeSDKBridge.verifyAndCacheNodePath(manualPath);
            LOG.info("Saved manual Node.js path: " + manualPath);
        } catch (Exception e) {
            LOG.warn("Failed to save Node.js path: " + e.getMessage());
        }
    }
}
