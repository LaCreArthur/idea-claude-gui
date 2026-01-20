package com.github.claudecodegui.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.util.List;
import java.util.Map;

public class McpServerHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(McpServerHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "get_mcp_servers",
        "get_mcp_server_status",
        "add_mcp_server",
        "update_mcp_server",
        "delete_mcp_server",
        "toggle_mcp_server",
        "validate_mcp_server"
    };

    public McpServerHandler(HandlerContext context) {
        super(context);
    }


