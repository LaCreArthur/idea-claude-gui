package com.github.claudecodegui;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.cache.SlashCommandCache;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.github.claudecodegui.handler.*;
import com.github.claudecodegui.permission.PermissionRequest;
import com.github.claudecodegui.permission.PermissionService;
import com.github.claudecodegui.startup.BridgePreloader;
import com.github.claudecodegui.ui.ErrorPanelBuilder;
import com.github.claudecodegui.util.FontConfigService;
import com.github.claudecodegui.util.HtmlLoader;
import com.github.claudecodegui.util.JBCefBrowserFactory;
import com.github.claudecodegui.util.JsUtils;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.editor.event.SelectionEvent;
import com.intellij.openapi.editor.event.SelectionListener;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerEvent;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.openapi.vfs.VirtualFileManager;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import com.intellij.ui.content.ContentManager;
import com.intellij.ui.content.ContentManagerEvent;
import com.intellij.ui.content.ContentManagerListener;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefBrowserBase;
import com.intellij.ui.jcef.JBCefJSQuery;
import com.intellij.util.Alarm;
import com.intellij.util.concurrency.AppExecutorUtil;
import com.intellij.util.messages.MessageBusConnection;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefLoadHandlerAdapter;
import org.jetbrains.annotations.NotNull;

import javax.swing.*;
import java.awt.*;
import java.awt.datatransfer.Clipboard;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.dnd.DnDConstants;
import java.awt.dnd.DropTarget;
import java.awt.dnd.DropTargetAdapter;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import com.github.claudecodegui.ui.ClaudeChatWindow;

/**
 * Claude SDK 聊天工具窗口
 * 实现 DumbAware 接口允许在索引构建期间使用此工具窗口
 */
public class ClaudeSDKToolWindow implements ToolWindowFactory, DumbAware {

    private static final Logger LOG = Logger.getInstance(ClaudeSDKToolWindow.class);
    private static final Map<Project, ClaudeChatWindow> instances = new ConcurrentHashMap<>();
    private static volatile boolean shutdownHookRegistered = false;
    private static final String TAB_NAME_PREFIX = "AI";

    /**
     * 获取指定项目的聊天窗口实例.
     *
     * @param project 项目
     * @return 聊天窗口实例，如果不存在返回 null
     */
    public static ClaudeChatWindow getChatWindow(Project project) {
        return instances.get(project);
    }

    /**
     * Register a chat window instance for a project.
     * If a window already exists for the project, the old one will be disposed first.
     *
     * @param project the project
     * @param window the chat window to register
     */
    public static void registerChatWindow(Project project, ClaudeChatWindow window) {
        synchronized (instances) {
            ClaudeChatWindow oldInstance = instances.get(project);
            if (oldInstance != null && oldInstance != window) {
                LOG.warn("Project " + project.getName() + " already has a window instance, replacing");
                oldInstance.dispose();
            }
            instances.put(project, window);
        }
    }

    /**
     * Unregister a chat window instance for a project.
     * Only removes if the current registered window matches the provided one.
     *
     * @param project the project
     * @param window the chat window to unregister
     */
    public static void unregisterChatWindow(Project project, ClaudeChatWindow window) {
        synchronized (instances) {
            if (instances.get(project) == window) {
                instances.remove(project);
            }
        }
    }

    /**
     * Remove a chat window from instances map (unconditional).
     * Used when window needs cleanup regardless of which instance is registered.
     *
     * @param project the project
     */
    public static void removeChatWindow(Project project) {
        instances.remove(project);
    }

    /**
     * Generate the next available tab name in the format "AIN".
     * Finds the next available number by checking existing tab names.
     *
     * @param toolWindow the tool window to check existing tabs
     * @return the next available tab name (e.g., "AI1", "AI2", etc.)
     */
    public static String getNextTabName(ToolWindow toolWindow) {
        if (toolWindow == null) {
            return TAB_NAME_PREFIX + "1";
        }

        ContentManager contentManager = toolWindow.getContentManager();
        int maxNumber = 0;

        // Find the highest existing AIN number
        for (Content content : contentManager.getContents()) {
            String displayName = content.getDisplayName();
            if (displayName != null && displayName.startsWith(TAB_NAME_PREFIX)) {
                try {
                    int number = Integer.parseInt(displayName.substring(TAB_NAME_PREFIX.length()));
                    if (number > maxNumber) {
                        maxNumber = number;
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore non-numeric suffixes
                }
            }
        }

        return TAB_NAME_PREFIX + (maxNumber + 1);
    }

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        // 注册 JVM Shutdown Hook（只注册一次）
        registerShutdownHook();

        ClaudeChatWindow chatWindow = new ClaudeChatWindow(project);
        ContentFactory contentFactory = ContentFactory.getInstance();
        // Set the initial tab name to "AI1"
        Content content = contentFactory.createContent(chatWindow.getContent(), TAB_NAME_PREFIX + "1", false);

        ContentManager contentManager = toolWindow.getContentManager();
        contentManager.addContent(content);

        content.setDisposer(() -> {
            ClaudeChatWindow window = instances.get(project);
            if (window != null) {
                window.dispose();
            }
        });

        // Add listener to manage tab closeable state based on tab count
        // When there's only one tab, disable the close button to prevent closing the last tab
        contentManager.addContentManagerListener(new ContentManagerListener() {
            @Override
            public void contentAdded(@NotNull ContentManagerEvent event) {
                updateTabCloseableState(contentManager);
            }

            @Override
            public void contentRemoved(@NotNull ContentManagerEvent event) {
                updateTabCloseableState(contentManager);
            }
        });

        // Initialize closeable state for the first tab
        updateTabCloseableState(contentManager);
    }

    /**
     * Update the closeable state of all tabs based on the tab count.
     * If there's only one tab, disable the close button; otherwise enable it.
     */
    private void updateTabCloseableState(ContentManager contentManager) {
        int tabCount = contentManager.getContentCount();
        boolean closeable = tabCount > 1;

        for (Content tab : contentManager.getContents()) {
            tab.setCloseable(closeable);
        }

        LOG.debug("[TabManager] Updated tab closeable state: count=" + tabCount + ", closeable=" + closeable);
    }

    /**
     * 注册 JVM Shutdown Hook，确保在 IDEA 关闭时清理所有 Node.js 进程
     * 这是最后的保底机制，即使 dispose() 未被正常调用也能清理进程
     */
    private static synchronized void registerShutdownHook() {
        if (shutdownHookRegistered) {
            return;
        }
        shutdownHookRegistered = true;

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("[ShutdownHook] IDEA 正在关闭，清理所有 Node.js 进程...");

            ExecutorService executor = Executors.newSingleThreadExecutor();
            try {
                Future<?> future = executor.submit(() -> {
                    // 复制实例列表，避免并发修改
                    for (ClaudeChatWindow window : new java.util.ArrayList<>(instances.values())) {
                        try {
                            if (window != null) {
                                window.cleanupAllProcesses();
                            }
                        } catch (Exception e) {
                            // Shutdown hook 中不要抛出异常
                            LOG.error("[ShutdownHook] 清理进程时出错: " + e.getMessage());
                        }
                    }
                });

                // 最多等待3秒
                future.get(3, TimeUnit.SECONDS);
                LOG.info("[ShutdownHook] Node.js 进程清理完成");
            } catch (TimeoutException e) {
                LOG.warn("[ShutdownHook] 清理进程超时(3秒)，强制退出");
            } catch (Exception e) {
                LOG.error("[ShutdownHook] 清理进程失败: " + e.getMessage());
            } finally {
                executor.shutdownNow();
            }
        }, "Claude-Process-Cleanup-Hook"));

        LOG.info("[ShutdownHook] JVM Shutdown Hook 已注册");
    }

    public static void addSelectionFromExternal(Project project, String selectionInfo) {
        ClaudeChatWindow.addSelectionFromExternalInternal(project, selectionInfo);
    }
}
