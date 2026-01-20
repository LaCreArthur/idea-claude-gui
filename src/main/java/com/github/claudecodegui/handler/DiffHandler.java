package com.github.claudecodegui.handler;

import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.diff.DiffContentFactory;
import com.intellij.diff.DiffManager;
import com.intellij.diff.contents.DiffContent;
import com.intellij.diff.requests.SimpleDiffRequest;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileTypes.FileType;
import com.intellij.openapi.fileTypes.FileTypeManager;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public class DiffHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(DiffHandler.class);
    private final Gson gson = new Gson();

    private static final String[] SUPPORTED_TYPES = {
        "refresh_file",
        "show_diff",
        "show_multi_edit_diff"
    };

    public DiffHandler(HandlerContext context) {
        super(context);
    }


