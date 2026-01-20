package com.github.claudecodegui.cache;

import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.*;
import com.intellij.openapi.vfs.newvfs.BulkFileListener;
import com.intellij.openapi.vfs.newvfs.events.VFileEvent;
import com.intellij.util.Alarm;
import com.intellij.util.messages.MessageBusConnection;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class SlashCommandCache {
    private static final Logger LOG = Logger.getInstance(SlashCommandCache.class);
    private final Project project;
    private final ClaudeSDKBridge sdkBridge;
    private final String cwd;

    private volatile List<JsonObject> cachedCommands;
    private volatile long lastLoadTime;
    private volatile long lastLoadAttemptTime;
    private volatile boolean isLoading;

    private static final long CACHE_TTL = 10 * 60 * 1000;
    private static final long MIN_REFRESH_INTERVAL = 500;
    private static final long LOAD_TIMEOUT_SECONDS = 25;

    private MessageBusConnection messageBusConnection;
    private Timer periodicCheckTimer;
    private final List<Consumer<List<JsonObject>>> updateListeners;
    private final Alarm refreshAlarm;

    public SlashCommandCache(Project project, ClaudeSDKBridge sdkBridge, String cwd) {
        this.project = project;
        this.sdkBridge = sdkBridge;
        this.cwd = cwd;
        this.cachedCommands = new ArrayList<>();
        this.lastLoadTime = 0;
        this.lastLoadAttemptTime = 0;
        this.isLoading = false;
        this.updateListeners = new CopyOnWriteArrayList<>();
        this.refreshAlarm = new Alarm(Alarm.ThreadToUse.POOLED_THREAD, project);
    }

    public void init() {
        LOG.info("Initializing cache system");

        loadCommands();

        setupFileWatcher();
    }

    public List<JsonObject> getCommands() {
        return new ArrayList<>(cachedCommands);
    }

    public boolean isEmpty() {
        return cachedCommands.isEmpty();
    }

    public boolean isLoading() {
        return isLoading;
    }

    public void addUpdateListener(Consumer<List<JsonObject>> listener) {
        updateListeners.add(listener);
    }

    private void loadCommands() {
        long now = System.currentTimeMillis();

        if (now - lastLoadAttemptTime < MIN_REFRESH_INTERVAL) {
            LOG.debug("Skipping load (too soon after last attempt)");
            return;
        }

        if (isLoading) {
            LOG.debug("Already loading, skipping");
            return;
        }

        lastLoadAttemptTime = now;
        isLoading = true;
        long startTime = System.currentTimeMillis();
        LOG.info("Loading slash commands from SDK");

        sdkBridge.getSlashCommands(cwd)
                .orTimeout(LOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .thenAccept(commands -> {
                    long duration = System.currentTimeMillis() - startTime;
                    if (commands != null && !commands.isEmpty()) {
                        List<JsonObject> commandList = new ArrayList<>(commands);
                        addEssentialCommands(commandList);
                        cachedCommands = commandList;
                        lastLoadTime = System.currentTimeMillis();
                        LOG.info("Loaded " + commands.size() + " commands (+" + (commandList.size() - commands.size()) + " essential) in " + duration + "ms");

                        notifyListeners();
                    } else {
                        LOG.info("No commands received (took " + duration + "ms)");
                    }
                    isLoading = false;
                }).exceptionally(ex -> {
                    long duration = System.currentTimeMillis() - startTime;
                    isLoading = false;

                    if (ex.getCause() instanceof java.util.concurrent.TimeoutException) {
                        LOG.warn("Load commands timeout after " + LOAD_TIMEOUT_SECONDS + " seconds (took " + duration + "ms)");
                    } else {
                        LOG.warn("Failed to load commands (took " + duration + "ms): " + ex.getMessage(), ex);
                    }
                    return null;
                });
    }

    private void setupFileWatcher() {
        messageBusConnection = ApplicationManager.getApplication().getMessageBus().connect();

        messageBusConnection.subscribe(VirtualFileManager.VFS_CHANGES, new BulkFileListener() {
            @Override
            public void after(List<? extends VFileEvent> events) {
                for (VFileEvent event : events) {
                    VirtualFile file = event.getFile();
                    if (file != null && isCommandFile(file)) {
                        LOG.info("Command file changed: " + file.getPath());
                        refreshAlarm.cancelAllRequests();
                        refreshAlarm.addRequest(SlashCommandCache.this::loadCommands, 500);
                        break;
                    }
                }
            }
        });

        LOG.info("File watcher setup complete (using MessageBus)");
    }

    private boolean isCommandFile(VirtualFile file) {
        if (file == null) return false;

        String path = file.getPath();
        return path.contains(".claude/commands/") || path.contains(".claude\\commands\\");
    }

    private void schedulePeriodicCheck() {
        periodicCheckTimer = new Timer("SlashCommandCache-PeriodicCheck", true);
        periodicCheckTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                if (now - lastLoadTime > CACHE_TTL) {
                    LOG.info("Periodic check: refreshing cache");
                    loadCommands();
                }
            }
        }, CACHE_TTL, CACHE_TTL);
        LOG.info("Periodic check scheduled (every 10 minutes)");
    }

    private void addEssentialCommands(List<JsonObject> commands) {
        java.util.Set<String> existingNames = new java.util.HashSet<>();
        for (JsonObject cmd : commands) {
            if (cmd.has("name")) {
                existingNames.add(cmd.get("name").getAsString().toLowerCase());
            }
        }

        addCommandIfMissing(commands, existingNames, "resume", "Resume a previous conversation");
        addCommandIfMissing(commands, existingNames, "clear", "Clear conversation history");
    }

    private void addCommandIfMissing(List<JsonObject> commands, java.util.Set<String> existingNames,
                                     String name, String description) {
        if (!existingNames.contains(name.toLowerCase()) && !existingNames.contains("/" + name.toLowerCase())) {
            JsonObject cmd = new JsonObject();
            cmd.addProperty("name", name);
            cmd.addProperty("description", description);
            commands.add(cmd);
            LOG.info("Added missing essential command: /" + name);
        }
    }

    private void notifyListeners() {
        List<JsonObject> commands = getCommands();
        for (Consumer<List<JsonObject>> listener : updateListeners) {
            try {
                listener.accept(commands);
            } catch (Exception e) {
                LOG.warn("Error notifying listener: " + e.getMessage(), e);
            }
        }
    }

    public void dispose() {
        LOG.info("Disposing cache system");

        if (messageBusConnection != null) {
            messageBusConnection.disconnect();
        }

        refreshAlarm.cancelAllRequests();
        refreshAlarm.dispose();

        updateListeners.clear();
    }
}
