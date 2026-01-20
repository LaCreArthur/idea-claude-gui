package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Handles session message retrieval from the Claude CLI.
 * Extracted from ClaudeSDKBridge for better separation of concerns.
 */
public class SessionOperations {
    private static final Logger LOG = Logger.getInstance(SessionOperations.class);
    private static final String CHANNEL_SCRIPT = "bridge.js";

    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final BridgeDirectoryResolver directoryResolver;
    private final EnvironmentConfigurator envConfigurator;

    public SessionOperations(
            Gson gson,
            NodeDetector nodeDetector,
            BridgeDirectoryResolver directoryResolver,
            EnvironmentConfigurator envConfigurator
    ) {
        this.gson = gson;
        this.nodeDetector = nodeDetector;
        this.directoryResolver = directoryResolver;
        this.envConfigurator = envConfigurator;
    }

    /**
     * Get session history messages.
     *
     * @param sessionId The session ID to retrieve messages for
     * @param cwd       Working directory for the session
     * @return List of message JSON objects
     * @throws RuntimeException if retrieval fails
     */
    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        try {
            String node = nodeDetector.findNodeExecutable();

            List<String> command = new ArrayList<>();
            command.add(node);
            command.add(CHANNEL_SCRIPT);
            command.add("claude");
            command.add("getSession");
            command.add(sessionId);
            command.add(cwd != null ? cwd : "");

            ProcessBuilder pb = new ProcessBuilder(command);
            File workDir = directoryResolver.findSdkDir();
            pb.directory(workDir);
            pb.redirectErrorStream(true);
            envConfigurator.updateProcessEnvironment(pb, node);

            Process process = pb.start();

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            process.waitFor();

            String outputStr = output.toString().trim();
            LOG.info("[getSessionMessages] Raw output length: " + outputStr.length());
            LOG.info("[getSessionMessages] Raw output (first 300 chars): " +
                     (outputStr.length() > 300 ? outputStr.substring(0, 300) + "..." : outputStr));

            // Find the last complete JSON object in the output
            // This handles cases where Node.js outputs multiple lines (logs, warnings)
            // before the actual JSON result
            String jsonStr = JsonOutputParser.extractLastJsonLine(outputStr);
            if (jsonStr != null) {
                LOG.info("[getSessionMessages] Extracted JSON: " + (jsonStr.length() > 500 ? jsonStr.substring(0, 500) + "..." : jsonStr));
                JsonObject jsonResult = gson.fromJson(jsonStr, JsonObject.class);
                LOG.info("[getSessionMessages] JSON parsed successfully, success=" +
                         (jsonResult.has("success") ? jsonResult.get("success").getAsBoolean() : "null"));

                if (jsonResult.has("success") && jsonResult.get("success").getAsBoolean()) {
                    List<JsonObject> messages = new ArrayList<>();
                    if (jsonResult.has("messages")) {
                        JsonArray messagesArray = jsonResult.getAsJsonArray("messages");
                        for (var msg : messagesArray) {
                            messages.add(msg.getAsJsonObject());
                        }
                    }
                    return messages;
                } else {
                    String errorMsg = (jsonResult.has("error") && !jsonResult.get("error").isJsonNull())
                            ? jsonResult.get("error").getAsString()
                            : "Unknown error";
                    throw new RuntimeException("Get session failed: " + errorMsg);
                }
            } else {
                LOG.error("[getSessionMessages] Failed to extract JSON from output");
                throw new RuntimeException("Failed to extract JSON from Node.js output");
            }

        } catch (Exception e) {
            throw new RuntimeException("Failed to get session messages: " + e.getMessage(), e);
        }
    }

}
