package com.github.claudecodegui.handler;

import com.github.claudecodegui.provider.claude.ClaudeHistoryReader;
import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.model.NodeDetectionResult;
import com.github.claudecodegui.util.FontConfigService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class SettingsHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SettingsHandler.class);

    private static final String NODE_PATH_PROPERTY_KEY = "claude.code.node.path";
    private static final String PERMISSION_MODE_PROPERTY_KEY = "claude.code.permission.mode";
    private static final String SEND_SHORTCUT_PROPERTY_KEY = "claude.code.send.shortcut";

    private static final String[] SUPPORTED_TYPES = {
        "get_mode",
        "set_mode",
        "set_model",
        "set_provider",
        "get_node_path",
        "set_node_path",
        "get_usage_statistics",
        "get_working_directory",
        "set_working_directory",
        "get_editor_font_config",
        "get_streaming_enabled",
        "set_streaming_enabled",
        "get_send_shortcut",
        "set_send_shortcut",
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

    private static final Map<String, Integer> MODEL_CONTEXT_LIMITS = new HashMap<>();
    static {
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-4-5", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-5-20251101", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-haiku-4-5", 200_000);
    }

    private final ProviderOperationsHandler providerOps;

    public SettingsHandler(HandlerContext context) {
        super(context);
        this.providerOps = new ProviderOperationsHandler(context, new ProviderOperationsHandler.JavaScriptCaller() {

