package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.ProcessManager;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

/**
 * Persistent daemon connection to bridge.js.
 * Keeps a single Node process alive across queries, eliminating SDK load time.
 */
public class DaemonConnection {

    private static final Logger LOG = Logger.getInstance(DaemonConnection.class);
    private static final long ABORT_TIMEOUT_MS = 5_000;
    private static final String DAEMON_CHANNEL_ID = "__daemon__";

    private final Gson gson = new Gson();
    private final List<String> command;
    private final File workingDir;
    private final EnvironmentConfigurator envConfigurator;
    private final ProcessManager processManager;
    private final String nodeExecutable;

    private volatile Process process;
    private volatile BufferedWriter stdinWriter;
    private volatile Thread readerThread;
    private volatile boolean alive = false;
    private volatile boolean shuttingDown = false;

    private final CompletableFuture<Void> readyFuture = new CompletableFuture<>();

    // Active query tracking — only one query at a time (serial dispatch).
    // All access must be synchronized on `this`.
    private String activeQueryId;
    private DaemonQueryCallback activeCallback;

    public interface DaemonQueryCallback {
        void onMessage(String line);
        void onDone(String sessionId);
        void onError(String message);
    }

    public DaemonConnection(
            List<String> command,
            File workingDir,
            EnvironmentConfigurator envConfigurator,
            ProcessManager processManager,
            String nodeExecutable
    ) {
        this.command = command;
        this.workingDir = workingDir;
        this.envConfigurator = envConfigurator;
        this.processManager = processManager;
        this.nodeExecutable = nodeExecutable;
    }

    /**
     * Start the daemon process. Blocks until the 'ready' message is received or timeout.
     */
    public void start() throws Exception {
        if (alive && process != null && process.isAlive()) {
            return;
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(workingDir);
        Map<String, String> env = pb.environment();
        envConfigurator.updateProcessEnvironment(pb, nodeExecutable);

        File tempDir = processManager.prepareClaudeTempDir();
        if (tempDir != null) {
            envConfigurator.configureTempDir(env, tempDir);
        }

        process = pb.start();
        alive = true;
        processManager.registerProcess(DAEMON_CHANNEL_ID, process);
        LOG.info("[Daemon] Process started, PID: " + process.pid());

        stdinWriter = new BufferedWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));

        startReaderThread();

        try {
            readyFuture.get(60, TimeUnit.SECONDS);
            LOG.info("[Daemon] Ready signal received");
        } catch (TimeoutException e) {
            shutdown();
            throw new Exception("Daemon failed to become ready within 60s");
        }
    }

    /**
     * Send a query to the daemon. Rejects if a query is already in-flight.
     */
    public synchronized void sendQuery(JsonObject command, String queryId, DaemonQueryCallback callback) throws IOException {
        if (!isAlive()) {
            throw new IOException("Daemon is not alive");
        }

        if (activeQueryId != null) {
            throw new IOException("Daemon busy — query " + activeQueryId + " still in-flight");
        }

        this.activeQueryId = queryId;
        this.activeCallback = callback;

        command.addProperty("type", "query");
        command.addProperty("queryId", queryId);

        String json = gson.toJson(command);
        stdinWriter.write(json);
        stdinWriter.newLine();
        stdinWriter.flush();
        LOG.info("[Daemon] Query sent: queryId=" + queryId);
    }

    /**
     * Send a permission/ask_user_question response back to the daemon.
     */
    public synchronized void sendResponse(JsonObject response) throws IOException {
        if (!isAlive()) {
            throw new IOException("Daemon is not alive");
        }

        String json = gson.toJson(response);
        stdinWriter.write(json);
        stdinWriter.newLine();
        stdinWriter.flush();
    }

    /**
     * Abort the currently active query. If the query doesn't finish within
     * ABORT_TIMEOUT_MS, force-completes the callback with an error so the
     * UI never hangs.
     */
    public synchronized void abort(String queryId) {
        if (!isAlive()) return;

        try {
            JsonObject abortMsg = new JsonObject();
            abortMsg.addProperty("type", "abort");
            abortMsg.addProperty("queryId", queryId);

            stdinWriter.write(gson.toJson(abortMsg));
            stdinWriter.newLine();
            stdinWriter.flush();
            LOG.info("[Daemon] Abort sent for queryId=" + queryId);
        } catch (IOException e) {
            LOG.warn("[Daemon] Failed to send abort: " + e.getMessage());
        }

        // Schedule a force-complete if the query doesn't finish in time
        final DaemonQueryCallback cb = activeCallback;
        final String qid = activeQueryId;
        if (cb != null && qid != null && qid.equals(queryId)) {
            CompletableFuture.runAsync(() -> {
                try {
                    Thread.sleep(ABORT_TIMEOUT_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                synchronized (DaemonConnection.this) {
                    if (qid.equals(activeQueryId) && activeCallback == cb) {
                        LOG.warn("[Daemon] Abort timeout for queryId=" + qid + ", force-completing callback");
                        activeQueryId = null;
                        activeCallback = null;
                        cb.onError("Query aborted (force timeout)");
                    }
                }
            });
        }
    }

    public Process getProcess() {
        return process;
    }

    /**
     * Graceful shutdown.
     */
    public void shutdown() {
        if (shuttingDown) return;
        shuttingDown = true;
        alive = false;

        LOG.info("[Daemon] Shutting down...");

        // Send shutdown command
        if (stdinWriter != null && process != null && process.isAlive()) {
            try {
                JsonObject shutdownMsg = new JsonObject();
                shutdownMsg.addProperty("type", "shutdown");
                stdinWriter.write(gson.toJson(shutdownMsg));
                stdinWriter.newLine();
                stdinWriter.flush();
            } catch (IOException e) {
                LOG.debug("[Daemon] Failed to send shutdown: " + e.getMessage());
            }
        }

        // Wait for process to exit gracefully
        if (process != null && process.isAlive()) {
            try {
                boolean exited = process.waitFor(3, TimeUnit.SECONDS);
                if (!exited) {
                    LOG.info("[Daemon] Force killing after 3s grace period");
                    process.destroyForcibly();
                    process.waitFor(2, TimeUnit.SECONDS);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
            }
        }

        processManager.unregisterProcess(DAEMON_CHANNEL_ID, process);

        if (readerThread != null) {
            readerThread.interrupt();
            readerThread = null;
        }

        LOG.info("[Daemon] Shutdown complete");
    }

    public boolean isAlive() {
        return alive && !shuttingDown && process != null && process.isAlive();
    }

    // ========================================================================
    // Internal
    // ========================================================================

    private void startReaderThread() {
        readerThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    handleLine(line);
                }
            } catch (IOException e) {
                if (!shuttingDown) {
                    LOG.warn("[Daemon] Reader error: " + e.getMessage());
                }
            } finally {
                if (!shuttingDown) {
                    alive = false;
                    LOG.warn("[Daemon] Process stdout closed unexpectedly");
                    handleUnexpectedDeath();
                }
            }
        }, "daemon-reader");
        readerThread.setDaemon(true);
        readerThread.start();

        Thread stderrThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    LOG.debug("[Daemon stderr] " + line);
                }
            } catch (IOException e) {
                // Expected on shutdown
            }
        }, "daemon-stderr");
        stderrThread.setDaemon(true);
        stderrThread.start();
    }

    private void handleLine(String line) {
        JsonObject msg;
        try {
            msg = gson.fromJson(line, JsonObject.class);
        } catch (Exception e) {
            LOG.debug("[Daemon] Non-JSON output: " + line);
            return;
        }

        String type = msg.has("type") ? msg.get("type").getAsString() : "";

        switch (type) {
            case "ready":
                if (!readyFuture.isDone()) {
                    readyFuture.complete(null);
                }
                break;

            case "pong":
                // No-op — heartbeat removed, but bridge.js still responds to pings
                break;

            case "query_done": {
                String queryId = msg.has("queryId") ? msg.get("queryId").getAsString() : "";
                String sessionId = msg.has("sessionId") ? msg.get("sessionId").getAsString() : "";
                LOG.info("[Daemon] query_done received: queryId=" + queryId + ", sessionId=" + sessionId);
                // Synchronized to prevent race with abort()/handleUnexpectedDeath()
                synchronized (this) {
                    DaemonQueryCallback cb = activeCallback;
                    if (cb != null && queryId.equals(activeQueryId)) {
                        activeQueryId = null;
                        activeCallback = null;
                        cb.onDone(sessionId);
                    } else {
                        LOG.warn("[Daemon] query_done for unknown/mismatched query: " + queryId
                                + " (active=" + activeQueryId + ")");
                    }
                }
                break;
            }

            case "query_error": {
                String queryId = msg.has("queryId") ? msg.get("queryId").getAsString() : "";
                String message = msg.has("message") ? msg.get("message").getAsString() : "Unknown error";
                LOG.warn("[Daemon] query_error received: queryId=" + queryId + ", message=" + message);
                synchronized (this) {
                    DaemonQueryCallback cb = activeCallback;
                    if (cb != null && queryId.equals(activeQueryId)) {
                        activeQueryId = null;
                        activeCallback = null;
                        cb.onError(message);
                    } else {
                        LOG.warn("[Daemon] query_error for unknown/mismatched query: " + queryId);
                    }
                }
                break;
            }

            default:
                // All other messages go to the active query's callback
                DaemonQueryCallback cb;
                synchronized (this) {
                    cb = activeCallback;
                }
                if (cb != null) {
                    cb.onMessage(line);
                }
                break;
        }
    }

    private void handleUnexpectedDeath() {
        synchronized (this) {
            DaemonQueryCallback cb = activeCallback;
            if (cb != null) {
                activeQueryId = null;
                activeCallback = null;
                cb.onError("Daemon process died unexpectedly");
            }
        }
    }
}
