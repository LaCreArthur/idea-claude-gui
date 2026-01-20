package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Handles file rewind operations for the Claude SDK.
 * Extracted from ClaudeSDKBridge for better separation of concerns.
 */
public class RewindOperations {
    private static final Logger LOG = Logger.getInstance(RewindOperations.class);
    private static final String CHANNEL_SCRIPT = "bridge.js";

    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final BridgeDirectoryResolver directoryResolver;
    private final EnvironmentConfigurator envConfigurator;
    private final ProcessManager processManager;

    public RewindOperations(
            Gson gson,
            NodeDetector nodeDetector,
            BridgeDirectoryResolver directoryResolver,
            EnvironmentConfigurator envConfigurator,
            ProcessManager processManager
    ) {
        this.gson = gson;
        this.nodeDetector = nodeDetector;
        this.directoryResolver = directoryResolver;
        this.envConfigurator = envConfigurator;
        this.processManager = processManager;
    }

    /**
     * Rewind files to a specific user message state.
     * Uses the SDK's rewindFiles() API to restore files to their state at a given message.
     *
     * @param sessionId The session ID
     * @param userMessageId The user message UUID to rewind to
     * @param cwd Working directory for the session
     * @return CompletableFuture with the result
     */
    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId, String cwd) {
        return CompletableFuture.supplyAsync(() -> {
            JsonObject response = new JsonObject();

            try {
                String node = nodeDetector.findNodeExecutable();
                File workDir = directoryResolver.findSdkDir();

                LOG.info("[Rewind] Starting rewind operation");
                LOG.info("[Rewind] Session ID: " + sessionId);
                LOG.info("[Rewind] Target message ID: " + userMessageId);

                // Build stdin input
                JsonObject stdinInput = new JsonObject();
                stdinInput.addProperty("sessionId", sessionId);
                stdinInput.addProperty("userMessageId", userMessageId);
                stdinInput.addProperty("cwd", cwd != null ? cwd : "");
                String stdinJson = gson.toJson(stdinInput);

                // Build command: node bridge.js claude rewindFiles
                List<String> command = new ArrayList<>();
                command.add(node);
                command.add(new File(workDir, CHANNEL_SCRIPT).getAbsolutePath());
                command.add("claude");
                command.add("rewindFiles");

                ProcessBuilder pb = new ProcessBuilder(command);

                if (cwd != null && !cwd.isEmpty() && !"undefined".equals(cwd) && !"null".equals(cwd)) {
                    File userWorkDir = new File(cwd);
                    if (userWorkDir.exists() && userWorkDir.isDirectory()) {
                        pb.directory(userWorkDir);
                    } else {
                        pb.directory(workDir);
                    }
                } else {
                    pb.directory(workDir);
                }
                pb.redirectErrorStream(true);

                Map<String, String> env = pb.environment();
                envConfigurator.configureProjectPath(env, cwd);
                File processTempDir = processManager.prepareClaudeTempDir();
                envConfigurator.configureTempDir(env, processTempDir);
                env.put("CLAUDE_USE_STDIN", "true");
                envConfigurator.updateProcessEnvironment(pb, node);

                Process process = pb.start();
                LOG.info("[Rewind] Process started, PID: " + process.pid());

                // Write to stdin
                try (java.io.OutputStream stdin = process.getOutputStream()) {
                    stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
                    stdin.flush();
                }

                CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> {
                    StringBuilder output = new StringBuilder();
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            LOG.info("[Rewind] Output: " + line);
                            output.append(line).append("\n");
                        }
                    } catch (Exception ignored) {
                    }
                    return output.toString();
                });

                boolean finished = process.waitFor(60, TimeUnit.SECONDS);
                int exitCode;
                if (!finished) {
                    PlatformUtils.terminateProcess(process);
                    exitCode = -1;
                } else {
                    exitCode = process.exitValue();
                }
                LOG.info("[Rewind] Process exited with code: " + exitCode);

                // Parse result: use JsonOutputParser for multi-line output handling
                String outputStr;
                try {
                    outputStr = outputFuture.get(5, TimeUnit.SECONDS).trim();
                } catch (Exception e) {
                    outputStr = "";
                }
                String jsonStr = JsonOutputParser.extractLastJsonLine(outputStr);
                if (jsonStr != null) {
                    try {
                        JsonObject result = gson.fromJson(jsonStr, JsonObject.class);
                        return result;
                    } catch (Exception e) {
                        LOG.warn("[Rewind] Failed to parse JSON: " + e.getMessage());
                    }
                }

                // Default response
                response.addProperty("success", exitCode == 0);
                if (exitCode != 0) {
                    if (!finished) {
                        response.addProperty("error", "Rewind process timeout");
                    } else {
                        response.addProperty("error", "Process exited with code: " + exitCode);
                    }
                }
                return response;

            } catch (Exception e) {
                LOG.error("[Rewind] Exception: " + e.getMessage(), e);
                response.addProperty("success", false);
                response.addProperty("error", e.getMessage());
                return response;
            }
        });
    }

    /**
     * Rewind files to a specific user message state (without cwd).
     *
     * @param sessionId The session ID
     * @param userMessageId The user message UUID to rewind to
     * @return CompletableFuture with the result
     */
    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId) {
        return rewindFiles(sessionId, userMessageId, null);
    }

}
