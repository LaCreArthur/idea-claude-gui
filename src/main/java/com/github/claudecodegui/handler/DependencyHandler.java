package com.github.claudecodegui.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/**
 * DependencyHandler — gutted in Phase 2 (bridge deletion).
 *
 * npm dependency management is no longer needed since the Node.js bridge
 * has been replaced by the Kotlin agent runtime. All message types now
 * return a "not available" response to the frontend.
 */
public class DependencyHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(DependencyHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "get_dependency_status",
        "install_dependency",
        "uninstall_dependency",
        "check_dependency_updates",
        "check_node_environment"
    };

    private final Gson gson = new Gson();

    public DependencyHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "get_dependency_status":
                handleGetStatus();
                return true;
            case "install_dependency":
            case "uninstall_dependency":
            case "check_dependency_updates":
                // No-op — npm deps no longer needed
                return true;
            case "check_node_environment":
                handleCheckNodeEnvironment();
                return true;
            default:
                return false;
        }
    }

    private void handleGetStatus() {
        // Report claude-sdk as installed — Kotlin agent runtime is the native implementation
        JsonObject result = new JsonObject();
        JsonObject claudeSdk = new JsonObject();
        claudeSdk.addProperty("status", "installed");
        claudeSdk.addProperty("installed", true);
        claudeSdk.addProperty("version", "kotlin-native");
        result.add("claude-sdk", claudeSdk);
        ApplicationManager.getApplication().invokeLater(() -> {
            callJavaScript("window.updateDependencyStatus", escapeJs(gson.toJson(result)));
        });
    }

    private void handleCheckNodeEnvironment() {
        // Node.js is no longer required — always report as not needed
        JsonObject result = new JsonObject();
        result.addProperty("available", false);
        result.addProperty("message", "Node.js no longer required — Kotlin agent runtime is active");
        ApplicationManager.getApplication().invokeLater(() -> {
            callJavaScript("window.nodeEnvironmentStatus", escapeJs(gson.toJson(result)));
        });
    }
}
