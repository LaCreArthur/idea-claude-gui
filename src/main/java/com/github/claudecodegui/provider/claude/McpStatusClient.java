package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.util.PlatformUtils;
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
import java.util.concurrent.CompletableFuture;

/**
 * Handles MCP server status retrieval from the Claude CLI.
 * Extracted from ClaudeSDKBridge for better separation of concerns.
 */
public class McpStatusClient {
    private static final Logger LOG = Logger.getInstance(McpStatusClient.class);
    private static final String CHANNEL_SCRIPT = "channel-manager.js";
    private static final String MCP_STATUS_CHANNEL_ID = "__mcp_status__";

    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final BridgeDirectoryResolver directoryResolver;
    private final EnvironmentConfigurator envConfigurator;
    private final ProcessManager processManager;

    public McpStatusClient(
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
     * Get MCP server connection status.
     */
    public CompletableFuture<List<JsonObject>> getMcpServerStatus(String cwd) {
        return CompletableFuture.supplyAsync(() -> {
            Process process = null;
            long startTime = System.currentTimeMillis();
            LOG.info("[McpStatus] Starting getMcpServerStatus, cwd=" + cwd);

            try {
                String node = nodeDetector.findNodeExecutable();

                JsonObject stdinInput = new JsonObject();
                stdinInput.addProperty("cwd", cwd != null ? cwd : "");
                String stdinJson = gson.toJson(stdinInput);

                List<String> command = new ArrayList<>();
                command.add(node);
                File bridgeDir = directoryResolver.findSdkDir();
                command.add(new File(bridgeDir, CHANNEL_SCRIPT).getAbsolutePath());
                command.add("claude");
                command.add("getMcpServerStatus");

                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(bridgeDir);
                pb.redirectErrorStream(true);
                envConfigurator.updateProcessEnvironment(pb, node);
                pb.environment().put("CLAUDE_USE_STDIN", "true");

                process = pb.start();
                processManager.registerProcess(MCP_STATUS_CHANNEL_ID, process);
                final Process finalProcess = process;

                try (java.io.OutputStream stdin = process.getOutputStream()) {
                    stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
                    stdin.flush();
                } catch (Exception e) {
                    LOG.warn("[McpStatus] Failed to write stdin: " + e.getMessage());
                }

                final boolean[] found = {false};
                final String[] mcpStatusJson = {null};
                final StringBuilder output = new StringBuilder();

                Thread readerThread = new Thread(() -> {
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(finalProcess.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while (!found[0] && (line = reader.readLine()) != null) {
                            output.append(line).append("\n");

                            if (line.startsWith("[MCP_SERVER_STATUS]")) {
                                mcpStatusJson[0] = line.substring("[MCP_SERVER_STATUS]".length()).trim();
                                found[0] = true;
                                break;
                            }
                        }
                    } catch (Exception e) {
                        LOG.debug("[McpStatus] Reader thread exception: " + e.getMessage());
                    }
                });
                readerThread.start();

                long deadline = System.currentTimeMillis() + 30000;
                while (!found[0] && System.currentTimeMillis() < deadline) {
                    Thread.sleep(100);
                }

                long elapsed = System.currentTimeMillis() - startTime;

                if (process.isAlive()) {
                    PlatformUtils.terminateProcess(process);
                }

                List<JsonObject> servers = new ArrayList<>();

                if (found[0] && mcpStatusJson[0] != null && !mcpStatusJson[0].isEmpty()) {
                    try {
                        JsonArray serversArray = gson.fromJson(mcpStatusJson[0], JsonArray.class);
                        for (var server : serversArray) {
                            servers.add(server.getAsJsonObject());
                        }
                        LOG.info("[McpStatus] Successfully parsed " + servers.size() + " MCP servers in " + elapsed + "ms");
                        return servers;
                    } catch (Exception e) {
                        LOG.warn("[McpStatus] Failed to parse MCP status JSON: " + e.getMessage());
                    }
                }

                // Fallback: use JsonOutputParser for multi-line output handling
                String outputStr = output.toString().trim();
                String jsonStr = JsonOutputParser.extractLastJsonLine(outputStr);
                if (jsonStr != null) {
                    try {
                        JsonObject jsonResult = gson.fromJson(jsonStr, JsonObject.class);
                        if (jsonResult.has("success") && jsonResult.get("success").getAsBoolean()) {
                            if (jsonResult.has("servers")) {
                                JsonArray serversArray = jsonResult.getAsJsonArray("servers");
                                for (var server : serversArray) {
                                    servers.add(server.getAsJsonObject());
                                }
                            }
                        }
                    } catch (Exception e) {
                        LOG.debug("[McpStatus] Fallback JSON parse failed: " + e.getMessage());
                    }
                }

                return servers;

            } catch (Exception e) {
                LOG.error("[McpStatus] Exception: " + e.getMessage());
                return new ArrayList<>();
            } finally {
                if (process != null) {
                    try {
                        if (process.isAlive()) {
                            PlatformUtils.terminateProcess(process);
                        }
                    } finally {
                        processManager.unregisterProcess(MCP_STATUS_CHANNEL_ID, process);
                    }
                }
            }
        });
    }

}
