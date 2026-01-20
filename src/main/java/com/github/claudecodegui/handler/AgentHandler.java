package com.github.claudecodegui.handler;

import com.github.claudecodegui.PluginSettingsService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.List;

/**
 * Agent management message handler.
 */
public class AgentHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(AgentHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "get_agents",
        "add_agent",
        "update_agent",
        "delete_agent",
        "get_selected_agent",
        "set_selected_agent"
    };

    private final PluginSettingsService settingsService;
    private final Gson gson;

    public AgentHandler(HandlerContext context) {
        super(context);
        this.settingsService = new PluginSettingsService();
        this.gson = new Gson();
    }


