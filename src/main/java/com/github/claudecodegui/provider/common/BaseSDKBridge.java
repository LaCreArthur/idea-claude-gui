package com.github.claudecodegui.provider.common;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.startup.BridgePreloader;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

public abstract class BaseSDKBridge {

    protected static final String CHANNEL_SCRIPT = "bridge.js";

    protected final Logger LOG;
    protected final Gson gson = new Gson();
    protected final NodeDetector nodeDetector = new NodeDetector();
    protected final ProcessManager processManager = new ProcessManager();
    protected final EnvironmentConfigurator envConfigurator = new EnvironmentConfigurator();

    protected BridgeDirectoryResolver getDirectoryResolver() {
        return BridgePreloader.getSharedResolver();
    }

    protected BaseSDKBridge(Class<?> loggerClass) {
        this.LOG = Logger.getInstance(loggerClass);
    }

    protected abstract String getProviderName();

    protected abstract void configureProviderEnv(Map<String, String> env, String stdinJson);

    protected abstract void processOutputLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent,
            boolean[] hadSendError,
            String[] lastNodeError
    );

    public void cleanupAllProcesses() {
        processManager.cleanupAllProcesses();
    }

    public int getActiveProcessCount() {
        return processManager.getActiveProcessCount();
    }

    public void interruptChannel(String channelId) {
        processManager.interruptChannel(channelId);
    }

    public void setNodeExecutable(String path) {
        nodeDetector.setNodeExecutable(path);
    }

    public String getNodeExecutable() {
        return nodeDetector.getNodeExecutable();
    }

    public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
        JsonObject result = new JsonObject();
        result.addProperty("success", true);
        if (sessionId != null) {
            result.addProperty("sessionId", sessionId);
        }
        result.addProperty("channelId", channelId);
        result.addProperty("message", getProviderName() + " channel ready (auto-launch on first send)");
        return result;
    }

    public boolean checkEnvironment() {
        try {
            String node = nodeDetector.findNodeExecutable();
            ProcessBuilder pb = new ProcessBuilder(node, "--version");
            envConfigurator.updateProcessEnvironment(pb, node);
            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String version = reader.readLine();
                LOG.debug("Node.js version: " + version);
            }

            int exitCode = process.waitFor();
            if (exitCode != 0) {
                return false;
            }

            File bridgeDir = getDirectoryResolver().findSdkDir();
            if (bridgeDir == null) {
                LOG.info("Bridge directory not ready yet (extraction in progress)");
                return false;
            }

            File scriptFile = new File(bridgeDir, CHANNEL_SCRIPT);
            if (!scriptFile.exists()) {
                LOG.error("bridge.js not found at: " + scriptFile.getAbsolutePath());
                return false;
            }

            LOG.info("Environment check passed for " + getProviderName());
            return true;
        } catch (Exception e) {
            LOG.error("Environment check failed: " + e.getMessage());
            return false;
        }
    }

    protected CompletableFuture<SDKResult> executeStreamingCommand(
            String channelId,
            List<String> command,
            String stdinJson,
            String cwd,
            MessageCallback callback
    ) {
        return CompletableFuture.supplyAsync(() -> {
            SDKResult result = new SDKResult();
            StringBuilder assistantContent = new StringBuilder();
            final boolean[] hadSendError = {false};
            final String[] lastNodeError = {null};

            try {
                File bridgeDir = getDirectoryResolver().findSdkDir();
                if (bridgeDir == null) {
                    result.success = false;
                    result.error = "Bridge directory not ready yet (extraction in progress)";
                    callback.onError(result.error);
                    return result;
                }

                File processTempDir = processManager.prepareClaudeTempDir();
                Set<String> existingTempMarkers = processManager.snapshotClaudeCwdFiles(processTempDir);

                ProcessBuilder pb = new ProcessBuilder(command);

                if (cwd != null && !cwd.isEmpty() && !"undefined".equals(cwd) && !"null".equals(cwd)) {
                    File userWorkDir = new File(cwd);
                    if (userWorkDir.exists() && userWorkDir.isDirectory()) {
                        pb.directory(userWorkDir);
                    } else {
                        pb.directory(bridgeDir);
                    }
                } else {
                    pb.directory(bridgeDir);
                }

                Map<String, String> env = pb.environment();
                envConfigurator.configureTempDir(env, processTempDir);
                configureProviderEnv(env, stdinJson);

                pb.redirectErrorStream(true);
                String node = nodeDetector.findNodeExecutable();
                envConfigurator.updateProcessEnvironment(pb, node);

                LOG.info("[" + getProviderName() + "] Command: " + String.join(" ", command));

                Process process = null;
                try {
                    process = pb.start();
                    processManager.registerProcess(channelId, process);

                    try (java.io.OutputStream stdin = process.getOutputStream()) {
                        stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
                        stdin.flush();
                    } catch (Exception e) {
                        LOG.warn("Failed to write stdin: " + e.getMessage());
                    }

                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {

                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (line.startsWith("[UNCAUGHT_ERROR]")
                                    || line.startsWith("[UNHANDLED_REJECTION]")
                                    || line.startsWith("[COMMAND_ERROR]")
                                    || line.startsWith("[STARTUP_ERROR]")
                                    || line.startsWith("[ERROR]")) {
                                LOG.warn("[Node.js ERROR] " + line);
                                lastNodeError[0] = line;
                            }

                            processOutputLine(line, callback, result, assistantContent, hadSendError, lastNodeError);
                        }
                    }

                    process.waitFor();

                    int exitCode = process.exitValue();
                    boolean wasInterrupted = processManager.wasInterrupted(channelId);

                    result.finalResult = assistantContent.toString();
                    result.messageCount = result.messages.size();

                    if (wasInterrupted) {
                        result.success = false;
                        result.error = "User interrupted";
                        callback.onComplete(result);
                    } else if (!hadSendError[0]) {
                        result.success = exitCode == 0;
                        if (result.success) {
                            callback.onComplete(result);
                        } else {
                            String errorMsg = getProviderName() + " process exited with code: " + exitCode;
                            if (lastNodeError[0] != null && !lastNodeError[0].isEmpty()) {
                                errorMsg = errorMsg + "\n\nDetails: " + lastNodeError[0];
                            }
                            result.error = errorMsg;
                            callback.onError(errorMsg);
                        }
                    } else {
                        if (exitCode != 0 && result.error != null) {
                            callback.onError(result.error);
                        }
                    }

                    return result;
                } finally {
                    processManager.unregisterProcess(channelId, process);
                    processManager.waitForProcessTermination(process);
                    processManager.cleanupClaudeTempFiles(processTempDir, existingTempMarkers);
                }

            } catch (Exception e) {
                result.success = false;
                result.error = e.getMessage();
                callback.onError(e.getMessage());
                return result;
            }
        }).exceptionally(ex -> {
            SDKResult errorResult = new SDKResult();
            errorResult.success = false;
            errorResult.error = ex.getCause() != null ? ex.getCause().getMessage() : ex.getMessage();
            callback.onError(errorResult.error);
            return errorResult;
        });
    }
}
