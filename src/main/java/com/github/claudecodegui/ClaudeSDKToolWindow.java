package com.github.claudecodegui;

import com.github.claudecodegui.ui.ClaudeChatWindow;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import com.intellij.ui.content.ContentManager;
import com.intellij.ui.content.ContentManagerEvent;
import com.intellij.ui.content.ContentManagerListener;
import org.jetbrains.annotations.NotNull;

import java.util.Map;
import java.util.concurrent.*;

public class ClaudeSDKToolWindow implements ToolWindowFactory, DumbAware {

    private static final Logger LOG = Logger.getInstance(ClaudeSDKToolWindow.class);
    private static final Map<Project, ClaudeChatWindow> instances = new ConcurrentHashMap<>();
    private static volatile boolean shutdownHookRegistered = false;
    private static final String TAB_NAME_PREFIX = "AI";

    public static ClaudeChatWindow getChatWindow(Project project) {
        return instances.get(project);
    }

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

    public static void unregisterChatWindow(Project project, ClaudeChatWindow window) {
        synchronized (instances) {
            if (instances.get(project) == window) {
                instances.remove(project);
            }
        }
    }

    public static void removeChatWindow(Project project) {
        instances.remove(project);
    }

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
                }
            }
        }

        return TAB_NAME_PREFIX + (maxNumber + 1);
    }

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        registerShutdownHook();

        ClaudeChatWindow chatWindow = new ClaudeChatWindow(project);
        ContentFactory contentFactory = ContentFactory.getInstance();
        Content content = contentFactory.createContent(chatWindow.getContent(), TAB_NAME_PREFIX + "1", false);

        ContentManager contentManager = toolWindow.getContentManager();
        contentManager.addContent(content);

        content.setDisposer(() -> {
            ClaudeChatWindow window = instances.get(project);
            if (window != null) {
                window.dispose();
            }
        });

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

        updateTabCloseableState(contentManager);
    }

    private void updateTabCloseableState(ContentManager contentManager) {
        int tabCount = contentManager.getContentCount();
        boolean closeable = tabCount > 1;

        for (Content tab : contentManager.getContents()) {
            tab.setCloseable(closeable);
        }

        LOG.debug("[TabManager] Updated tab closeable state: count=" + tabCount + ", closeable=" + closeable);
    }

    private static synchronized void registerShutdownHook() {
        if (shutdownHookRegistered) {
            return;
        }
        shutdownHookRegistered = true;

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("[ShutdownHook] IDE is shutting down, cleaning up all agent processes...");

            ExecutorService executor = Executors.newSingleThreadExecutor();
            try {
                Future<?> future = executor.submit(() -> {
                    for (ClaudeChatWindow window : new java.util.ArrayList<>(instances.values())) {
                        try {
                            if (window != null) {
                                window.cleanupAllProcesses();
                            }
                        } catch (Exception e) {
                            LOG.error("[ShutdownHook] Error cleaning up processes: " + e.getMessage());
                        }
                    }
                });

                future.get(3, TimeUnit.SECONDS);
                LOG.info("[ShutdownHook] Agent process cleanup complete");
            } catch (TimeoutException e) {
                LOG.warn("[ShutdownHook] Process cleanup timed out (3 seconds), forcing exit");
            } catch (Exception e) {
                LOG.error("[ShutdownHook] Failed to clean up processes: " + e.getMessage());
            } finally {
                executor.shutdownNow();
            }
        }, "Claude-Process-Cleanup-Hook"));

        LOG.info("[ShutdownHook] JVM Shutdown Hook registered");
    }

    public static void addSelectionFromExternal(Project project, String selectionInfo) {
        ClaudeChatWindow.addSelectionFromExternalInternal(project, selectionInfo);
    }
}
