package com.github.claudecodegui.handler;

import com.github.claudecodegui.ClaudeSDKToolWindow;
import com.github.claudecodegui.ui.ClaudeChatWindow;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import com.intellij.ui.content.ContentManager;


/**
 * Tab management handler
 * Handles creating new chat tabs in the tool window
 */
public class TabHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(TabHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "create_new_tab"
    };

    public TabHandler(HandlerContext context) {
        super(context);
    }


