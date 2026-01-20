package com.github.claudecodegui.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.CompletableFuture;

public class RewindHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(RewindHandler.class);
    private static final Gson gson = new Gson();

    private static final String[] SUPPORTED_TYPES = {
        "rewind_files"
    };

    public RewindHandler(HandlerContext context) {
        super(context);
    }


