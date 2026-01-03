package com.github.claudecodegui.bridge;

import com.intellij.openapi.diagnostic.Logger;
import com.github.claudecodegui.util.PlatformUtils;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Process Manager.
 * Responsible for managing Claude SDK related child processes.
 */
public class ProcessManager {

    private static final Logger LOG = Logger.getInstance(ProcessManager.class);
    private static final String CLAUDE_TEMP_DIR_NAME = "claude-agent-tmp";

    private final Map<String, Process> activeChannelProcesses = new ConcurrentHashMap<>();
    private final Set<String> interruptedChannels = ConcurrentHashMap.newKeySet();

    /**
     * Register an active process.
     */
    public void registerProcess(String channelId, Process process) {
        if (channelId != null && process != null) {
            activeChannelProcesses.put(channelId, process);
            interruptedChannels.remove(channelId);
        }
    }

    /**
     * Unregister an active process.
     */
    public void unregisterProcess(String channelId, Process process) {
        if (channelId != null) {
            activeChannelProcesses.remove(channelId, process);
        }
    }

    /**
     * Get an active process.
     */
    public Process getProcess(String channelId) {
        return activeChannelProcesses.get(channelId);
    }

    /**
     * Check if channel was interrupted.
     */
    public boolean wasInterrupted(String channelId) {
        return channelId != null && interruptedChannels.remove(channelId);
    }

    /**
     * Interrupt a channel.
     * Uses platform-aware process termination method to ensure proper termination
     * of child process trees on Windows.
     */
    public void interruptChannel(String channelId) {
        if (channelId == null) {
            LOG.info("[Interrupt] ChannelId is null, nothing to interrupt");
            return;
        }

        Process process = activeChannelProcesses.get(channelId);
        if (process == null) {
            LOG.info("[Interrupt] No active process found for channel: " + channelId);
            return;
        }

        LOG.info("[Interrupt] Attempting to interrupt channel: " + channelId);
        interruptedChannels.add(channelId);

        // Use platform-aware process termination method
        // Windows: uses taskkill /F /T to terminate process tree
        // Unix: uses standard destroy/destroyForcibly
        PlatformUtils.terminateProcess(process);

        // Wait for process to fully terminate
        try {
            if (process.isAlive()) {
                boolean terminated = process.waitFor(3, TimeUnit.SECONDS);
                if (!terminated) {
                    LOG.info("[Interrupt] Process still alive, force killing channel: " + channelId);
                    process.destroyForcibly();
                    process.waitFor(2, TimeUnit.SECONDS);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            activeChannelProcesses.remove(channelId, process);
            // Verify process is actually terminated
            if (process.isAlive()) {
                LOG.warn("[Interrupt] Warning: Process may still be alive for channel: " + channelId);
            } else {
                LOG.info("[Interrupt] Successfully terminated channel: " + channelId);
            }
        }
    }

    /**
     * Clean up all active child processes.
     * Should be called when plugin is unloaded or IDEA is closing.
     */
    public void cleanupAllProcesses() {
        LOG.info("[ProcessManager] Cleaning up all active processes...");
        int count = 0;

        for (Map.Entry<String, Process> entry : activeChannelProcesses.entrySet()) {
            String channelId = entry.getKey();
            Process process = entry.getValue();

            if (process != null && process.isAlive()) {
                LOG.info("[ProcessManager] Terminating process for channel: " + channelId);
                PlatformUtils.terminateProcess(process);
                count++;
            }
        }

        activeChannelProcesses.clear();
        interruptedChannels.clear();

        LOG.info("[ProcessManager] Cleanup complete. Terminated " + count + " processes.");
    }

    /**
     * Get the count of currently active processes.
     */
    public int getActiveProcessCount() {
        int count = 0;
        for (Process process : activeChannelProcesses.values()) {
            if (process != null && process.isAlive()) {
                count++;
            }
        }
        return count;
    }

    /**
     * Wait for process termination.
     */
    public void waitForProcessTermination(Process process) {
        if (process == null) {
            return;
        }
        if (process.isAlive()) {
            try {
                process.waitFor(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Prepare Claude temporary directory.
     */
    public File prepareClaudeTempDir() {
        String baseTemp = System.getProperty("java.io.tmpdir");
        if (baseTemp == null || baseTemp.isEmpty()) {
            return null;
        }

        Path tempPath = Paths.get(baseTemp, CLAUDE_TEMP_DIR_NAME);
        try {
            Files.createDirectories(tempPath);
            return tempPath.toFile();
        } catch (IOException e) {
            LOG.error("[ProcessManager] Failed to prepare temp dir: " + tempPath + ", reason: " + e.getMessage());
            return null;
        }
    }

    /**
     * Snapshot Claude cwd files.
     */
    public Set<String> snapshotClaudeCwdFiles(File tempDir) {
        if (tempDir == null || !tempDir.exists()) {
            return Collections.emptySet();
        }
        File[] existing = tempDir.listFiles((dir, name) ->
            name.startsWith("claude-") && name.endsWith("-cwd"));
        if (existing == null || existing.length == 0) {
            return Collections.emptySet();
        }
        Set<String> snapshot = new HashSet<>();
        for (File file : existing) {
            snapshot.add(file.getName());
        }
        return snapshot;
    }

    /**
     * Clean up Claude temporary files.
     */
    public void cleanupClaudeTempFiles(File tempDir, Set<String> preserved) {
        if (tempDir == null || !tempDir.exists()) {
            return;
        }
        File[] leftovers = tempDir.listFiles((dir, name) ->
            name.startsWith("claude-") && name.endsWith("-cwd"));
        if (leftovers == null || leftovers.length == 0) {
            return;
        }
        for (File file : leftovers) {
            if (preserved != null && preserved.contains(file.getName())) {
                continue;
            }
            // Use retry mechanism for deletion, handles Windows file locking issues
            if (!PlatformUtils.deleteWithRetry(file, 3)) {
                try {
                    Files.deleteIfExists(file.toPath());
                } catch (IOException e) {
                    LOG.error("[ProcessManager] Failed to delete temp cwd file: " + file.getAbsolutePath());
                }
            }
        }
    }
}
