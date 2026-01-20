package com.github.claudecodegui.ui;

import com.github.claudecodegui.cache.SlashCommandCache;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.util.JsUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.util.List;
import java.util.function.BiConsumer;

/**
 * Manages slash command cache and frontend synchronization.
 * Extracted from ClaudeChatWindow to improve maintainability.
 */
public class SlashCommandManager {
    private static final Logger LOG = Logger.getInstance(SlashCommandManager.class);

    private final Project project;
    private final ClaudeSDKBridge claudeSDKBridge;
    private final BiConsumer<String, String> jsCallback;

    private SlashCommandCache slashCommandCache;
    private volatile boolean slashCommandsFetched = false;
    private volatile int fetchedSlashCommandsCount = 0;

    /**
     * Creates a SlashCommandManager.
     *
     * @param project         The IntelliJ project
     * @param claudeSDKBridge The Claude SDK bridge for API calls
     * @param jsCallback      Callback to call JavaScript functions: (functionName, escapedArg) -> void
     */
    public SlashCommandManager(
            Project project,
            ClaudeSDKBridge claudeSDKBridge,
            BiConsumer<String, String> jsCallback
    ) {
        this.project = project;
        this.claudeSDKBridge = claudeSDKBridge;
        this.jsCallback = jsCallback;
    }

    /**
     * Initializes the slash command cache with smart caching.
     * Uses memory cache + file watching + periodic refresh.
     *
     * @param cwd The current working directory for slash command discovery
     */
    public void initializeCache(String cwd) {
        String effectiveCwd = cwd != null ? cwd : project.getBasePath();
        LOG.info("Initializing slash command cache, cwd=" + effectiveCwd);

        // Dispose existing cache if any
        if (slashCommandCache != null) {
            LOG.debug("Disposing existing slash command cache");
            slashCommandCache.dispose();
        }

        // Create and initialize cache
        slashCommandCache = new SlashCommandCache(project, claudeSDKBridge, effectiveCwd);

        // Add update listener: notify frontend when cache updates
        slashCommandCache.addUpdateListener(commands -> {
            fetchedSlashCommandsCount = commands.size();
            slashCommandsFetched = true;
            LOG.debug("Slash command cache listener triggered, count=" + commands.size());
            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    Gson gson = new Gson();
                    String commandsJson = gson.toJson(commands);
                    LOG.debug("Calling updateSlashCommands with JSON length=" + commandsJson.length());
                    jsCallback.accept("updateSlashCommands", JsUtils.escapeJs(commandsJson));
                    LOG.info("Slash commands updated: " + commands.size() + " commands");
                } catch (Exception e) {
                    LOG.warn("Failed to send slash commands to frontend: " + e.getMessage(), e);
                }
            });
        });

        // Initialize cache (start loading + file watching + periodic checks)
        LOG.debug("Starting slash command cache initialization");
        slashCommandCache.init();
    }

    /**
     * Sends cached slash commands to frontend.
     * Used when frontend becomes ready and cache already has data.
     */
    public void sendCachedCommands() {
        if (slashCommandCache == null || slashCommandCache.isEmpty()) {
            LOG.debug("sendCachedCommands: cache is empty or null");
            return;
        }

        List<JsonObject> commands = slashCommandCache.getCommands();
        if (commands.isEmpty()) {
            LOG.debug("sendCachedCommands: no commands in cache");
            return;
        }

        ApplicationManager.getApplication().invokeLater(() -> {
            try {
                Gson gson = new Gson();
                String commandsJson = gson.toJson(commands);
                LOG.info("sendCachedCommands: sending " + commands.size() + " cached commands to frontend");
                jsCallback.accept("updateSlashCommands", JsUtils.escapeJs(commandsJson));
            } catch (Exception e) {
                LOG.warn("sendCachedCommands: failed to send: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Checks if cache has data available.
     *
     * @return true if cache has commands
     */
    public boolean hasCachedCommands() {
        return slashCommandCache != null && !slashCommandCache.isEmpty();
    }

    /**
     * Checks if slash commands have been fetched from the API.
     *
     * @return true if commands have been fetched
     */
    public boolean isSlashCommandsFetched() {
        return slashCommandsFetched;
    }

    /**
     * Gets the count of fetched slash commands.
     *
     * @return the number of fetched commands
     */
    public int getFetchedSlashCommandsCount() {
        return fetchedSlashCommandsCount;
    }

    /**
     * Disposes resources held by this manager.
     */
    public void dispose() {
        if (slashCommandCache != null) {
            slashCommandCache.dispose();
            slashCommandCache = null;
        }
    }
}
