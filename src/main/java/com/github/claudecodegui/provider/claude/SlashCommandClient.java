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
 * Handles slash command retrieval from the Claude CLI.
 * Extracted from ClaudeSDKBridge for better separation of concerns.
 */
public class SlashCommandClient {
    private static final Logger LOG = Logger.getInstance(SlashCommandClient.class);
    private static final String CHANNEL_SCRIPT = "bridge.js";
    private static final String SLASH_COMMANDS_CHANNEL_ID = "__slash_commands__";

    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final BridgeDirectoryResolver directoryResolver;
    private final EnvironmentConfigurator envConfigurator;
    private final ProcessManager processManager;

    public SlashCommandClient(
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
     * Get slash commands list.
     */
    public CompletableFuture<List<JsonObject>> getSlashCommands(String cwd) {
        return CompletableFuture.supplyAsync(() -> {
            Process process = null;
            long startTime = System.currentTimeMillis();
            LOG.info("[SlashCommands] Starting getSlashCommands, cwd=" + cwd);

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
                command.add("getSlashCommands");

                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(bridgeDir);
                pb.redirectErrorStream(true);
                envConfigurator.updateProcessEnvironment(pb, node);
                pb.environment().put("CLAUDE_USE_STDIN", "true");

                process = pb.start();
                processManager.registerProcess(SLASH_COMMANDS_CHANNEL_ID, process);
                final Process finalProcess = process;

                try (java.io.OutputStream stdin = process.getOutputStream()) {
                    stdin.write(stdinJson.getBytes(StandardCharsets.UTF_8));
                    stdin.flush();
                } catch (Exception e) {
                    LOG.warn("[SlashCommands] Failed to write stdin: " + e.getMessage());
                }

                final boolean[] found = {false};
                final String[] slashCommandsJson = {null};
                final StringBuilder output = new StringBuilder();

                Thread readerThread = new Thread(() -> {
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(finalProcess.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while (!found[0] && (line = reader.readLine()) != null) {
                            output.append(line).append("\n");

                            if (line.startsWith("[SLASH_COMMANDS]")) {
                                slashCommandsJson[0] = line.substring("[SLASH_COMMANDS]".length()).trim();
                                found[0] = true;
                                break;
                            }
                        }
                    } catch (Exception e) {
                        LOG.debug("[SlashCommands] Reader thread exception: " + e.getMessage());
                    }
                });
                readerThread.start();

                long deadline = System.currentTimeMillis() + 20000;
                while (!found[0] && System.currentTimeMillis() < deadline) {
                    Thread.sleep(100);
                }

                long elapsed = System.currentTimeMillis() - startTime;

                if (process.isAlive()) {
                    PlatformUtils.terminateProcess(process);
                }

                List<JsonObject> commands = new ArrayList<>();

                if (found[0] && slashCommandsJson[0] != null && !slashCommandsJson[0].isEmpty()) {
                    try {
                        JsonArray commandsArray = gson.fromJson(slashCommandsJson[0], JsonArray.class);
                        for (var cmd : commandsArray) {
                            commands.add(cmd.getAsJsonObject());
                        }
                        LOG.info("[SlashCommands] Successfully parsed " + commands.size() + " commands in " + elapsed + "ms");
                        return commands;
                    } catch (Exception e) {
                        LOG.warn("[SlashCommands] Failed to parse commands JSON: " + e.getMessage());
                    }
                }

                // Fallback: use JsonOutputParser for multi-line output handling
                String outputStr = output.toString().trim();
                String jsonStr = JsonOutputParser.extractLastJsonLine(outputStr);
                if (jsonStr != null) {
                    try {
                        JsonObject jsonResult = gson.fromJson(jsonStr, JsonObject.class);
                        if (jsonResult.has("success") && jsonResult.get("success").getAsBoolean()) {
                            if (jsonResult.has("commands")) {
                                JsonArray commandsArray = jsonResult.getAsJsonArray("commands");
                                for (var cmd : commandsArray) {
                                    commands.add(cmd.getAsJsonObject());
                                }
                            }
                        }
                    } catch (Exception e) {
                        LOG.debug("[SlashCommands] Fallback JSON parse failed: " + e.getMessage());
                    }
                }

                return commands;

            } catch (Exception e) {
                LOG.error("[SlashCommands] Exception: " + e.getMessage());
                return new ArrayList<>();
            } finally {
                if (process != null) {
                    try {
                        if (process.isAlive()) {
                            PlatformUtils.terminateProcess(process);
                        }
                    } finally {
                        processManager.unregisterProcess(SLASH_COMMANDS_CHANNEL_ID, process);
                    }
                }
            }
        });
    }

}
