package com.github.claudecodegui.handler;

import com.github.claudecodegui.SkillService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.util.concurrency.AppExecutorUtil;

import javax.swing.*;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SkillHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SkillHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "get_all_skills",
        "import_skill",
        "delete_skill",
        "open_skill",
        "toggle_skill"
    };

    private final JPanel mainPanel;

    public SkillHandler(HandlerContext context, JPanel mainPanel) {
        super(context);
        this.mainPanel = mainPanel;
    }


