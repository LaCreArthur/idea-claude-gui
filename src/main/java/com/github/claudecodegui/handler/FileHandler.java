package com.github.claudecodegui.handler;

import com.github.claudecodegui.model.FileSortItem;
import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.impl.EditorHistoryManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class FileHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(FileHandler.class);

    private static final String[] SUPPORTED_TYPES = {"list_files", "get_commands", "open_file", "open_browser"};

    // File listing limits
    private static final int MAX_RECENT_FILES = 50;
    private static final int MAX_SEARCH_RESULTS = 200;
    private static final int MAX_SEARCH_DEPTH = 15;
    private static final int MAX_DIRECTORY_CHILDREN = 100;

    public FileHandler(HandlerContext context) {
        super(context);
    }


