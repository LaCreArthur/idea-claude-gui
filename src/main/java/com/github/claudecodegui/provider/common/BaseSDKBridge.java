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
}
