package com.github.claudecodegui.handler;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.notifications.ClaudeNotifier;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import javax.swing.*;
import java.io.File;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SessionHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SessionHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "send_message",
        "send_message_with_attachments",
        "interrupt_session",
        "restart_session"
    };

    public SessionHandler(HandlerContext context) {
        super(context);
    }


