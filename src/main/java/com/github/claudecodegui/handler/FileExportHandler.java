package com.github.claudecodegui.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;

public class FileExportHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(FileExportHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "save_markdown",
        "save_json"
    };

    private final Gson gson = new Gson();

    public FileExportHandler(HandlerContext context) {
        super(context);
    }


