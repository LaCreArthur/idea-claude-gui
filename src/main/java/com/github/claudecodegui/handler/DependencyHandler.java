package com.github.claudecodegui.handler;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.dependency.DependencyManager;
import com.github.claudecodegui.dependency.InstallResult;
import com.github.claudecodegui.dependency.SdkDefinition;
import com.github.claudecodegui.dependency.UpdateInfo;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.CompletableFuture;

public class DependencyHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(DependencyHandler.class);
    private static final String NODE_PATH_PROPERTY_KEY = "claude.code.node.path";

    private static final String[] SUPPORTED_TYPES = {
        "get_dependency_status",
        "install_dependency",
        "uninstall_dependency",
        "check_dependency_updates",
        "check_node_environment"
    };

    private final DependencyManager dependencyManager;
    private final Gson gson;

    public DependencyHandler(HandlerContext context) {
        super(context);
        NodeDetector nodeDetector = new NodeDetector();
        String configuredNodePath = getConfiguredNodePath();
        if (configuredNodePath != null && !configuredNodePath.isEmpty()) {
            String version = nodeDetector.verifyNodePath(configuredNodePath);
            if (version != null) {
                nodeDetector.setNodeExecutable(configuredNodePath);
                LOG.info("[DependencyHandler] Using configured Node.js path: " + configuredNodePath + " (" + version + ")");
            } else {
                LOG.warn("[DependencyHandler] Configured Node.js path is invalid: " + configuredNodePath);
            }
        }
        this.dependencyManager = new DependencyManager(nodeDetector);
        this.gson = new Gson();
    }

    private String getConfiguredNodePath() {
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String savedPath = props.getValue(NODE_PATH_PROPERTY_KEY);
            if (savedPath != null && !savedPath.trim().isEmpty()) {
                return savedPath.trim();
            }
        } catch (Exception e) {
            LOG.warn("[DependencyHandler] Failed to get configured Node.js path: " + e.getMessage());
        }
        return null;
    }


