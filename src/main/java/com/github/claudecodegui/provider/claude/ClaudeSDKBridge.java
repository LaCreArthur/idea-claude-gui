package com.github.claudecodegui.provider.claude;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.intellij.openapi.diagnostic.Logger;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Claude agent bridge — gutted in Phase 2 (bridge deletion).
 *
 * All Node.js/daemon infrastructure has been removed. The Kotlin AgentRuntime
 * (wired in ClaudeSession) is now the sole execution path. This class survives
 * only because HandlerContext, SlashCommandManager, SettingsLoader, and a few
 * other Java files hold a reference to it for non-agent operations
 * (slash commands, history, settings).
 */
public class ClaudeSDKBridge {

    private static final Logger LOG = Logger.getInstance(ClaudeSDKBridge.class);
    private final Gson gson = new Gson();

    public ClaudeSDKBridge() {
        // No-op — all infrastructure removed
    }

    // ============================================================================
    // Channel lifecycle (trivial — Kotlin agent doesn't need channels)
    // ============================================================================

    public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
        JsonObject result = new JsonObject();
        result.addProperty("success", true);
        if (sessionId != null) {
            result.addProperty("sessionId", sessionId);
        }
        result.addProperty("channelId", channelId);
        result.addProperty("message", "claude channel ready (Kotlin agent)");
        return result;
    }

    // ============================================================================
    // Slash commands — read ~/.claude/commands/ directly
    // ============================================================================

    public CompletableFuture<List<JsonObject>> getSlashCommands(String cwd) {
        return CompletableFuture.supplyAsync(() -> {
            List<JsonObject> commands = new ArrayList<>();
            try {
                java.io.File homeDir = new java.io.File(System.getProperty("user.home"));
                java.io.File commandsDir = new java.io.File(homeDir, ".claude/commands");
                if (commandsDir.isDirectory()) {
                    java.io.File[] files = commandsDir.listFiles((dir, name) -> name.endsWith(".md"));
                    if (files != null) {
                        for (java.io.File f : files) {
                            String name = f.getName().replace(".md", "");
                            JsonObject cmd = new JsonObject();
                            cmd.addProperty("name", "/" + name);
                            cmd.addProperty("description", name);
                            commands.add(cmd);
                        }
                    }
                }
                // Also check project-local .claude/commands/
                if (cwd != null && !cwd.isEmpty()) {
                    java.io.File projectCommands = new java.io.File(cwd, ".claude/commands");
                    if (projectCommands.isDirectory()) {
                        java.io.File[] files = projectCommands.listFiles((dir, name) -> name.endsWith(".md"));
                        if (files != null) {
                            for (java.io.File f : files) {
                                String name = f.getName().replace(".md", "");
                                JsonObject cmd = new JsonObject();
                                cmd.addProperty("name", "/" + name);
                                cmd.addProperty("description", name + " (project)");
                                commands.add(cmd);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                LOG.warn("[SlashCommands] Failed to read commands: " + e.getMessage());
            }
            return commands;
        });
    }

    // ============================================================================
    // Session history — delegated to ClaudeHistoryReader (no bridge needed)
    // ============================================================================

    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        try {
            ClaudeHistoryReader reader = new ClaudeHistoryReader();
            String json = reader.getSessionMessagesAsJson(cwd, sessionId);
            if (json == null || json.isEmpty()) return new ArrayList<>();
            com.google.gson.reflect.TypeToken<List<JsonObject>> type =
                new com.google.gson.reflect.TypeToken<List<JsonObject>>() {};
            List<JsonObject> result = gson.fromJson(json, type.getType());
            return result != null ? result : new ArrayList<>();
        } catch (Exception e) {
            LOG.warn("[Bridge] Failed to load session messages: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    // ============================================================================
    // MCP status — stub (future: implement via Kotlin)
    // ============================================================================

    public CompletableFuture<List<JsonObject>> getMcpServerStatus(String cwd) {
        return CompletableFuture.completedFuture(new ArrayList<>());
    }

    // ============================================================================
    // Rewind — stub (future: implement via Kotlin)
    // ============================================================================

    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId, String cwd) {
        JsonObject stub = new JsonObject();
        stub.addProperty("success", false);
        stub.addProperty("error", "Rewind not yet implemented in Kotlin agent");
        return CompletableFuture.completedFuture(stub);
    }

    public CompletableFuture<JsonObject> rewindFiles(String sessionId, String userMessageId) {
        return rewindFiles(sessionId, userMessageId, null);
    }

    // ============================================================================
    // Interrupt — no-op (Kotlin agent uses CoroutineScope cancellation)
    // ============================================================================

    public void interruptChannel(String channelId) {
        LOG.info("[Bridge] interruptChannel called but Kotlin agent uses scope cancellation — no-op");
    }

    // ============================================================================
    // Process cleanup — no-op (no processes to manage)
    // ============================================================================

    public void cleanupAllProcesses() {
        // No Node.js processes to clean up
    }

    public int getActiveProcessCount() {
        return 0;
    }

    public void shutdownDaemon() {
        // No daemon to shut down
    }

    // ============================================================================
    // Permission/AskUser callback interfaces (still used by ClaudeSession bridge path)
    // ============================================================================

    public interface PermissionCallback {
        CompletableFuture<JsonObject> onPermissionRequest(String requestId, String toolName, JsonObject toolInput);
    }

    public interface AskUserQuestionCallback {
        CompletableFuture<JsonObject> onAskUserQuestion(String requestId, JsonArray questions);
    }

    // ============================================================================
    // sendMessageWithBridge — legacy bridge path, now throws
    // ============================================================================

    public CompletableFuture<SDKResult> sendMessageWithBridge(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            List<ClaudeSession.Attachment> attachments,
            String permissionMode,
            String model,
            JsonObject openedFiles,
            String agentPrompt,
            Boolean streaming,
            int maxThinkingTokens,
            PermissionCallback permissionCallback,
            AskUserQuestionCallback askUserCallback,
            MessageCallback callback
    ) {
        // Bridge path removed — Kotlin agent is the sole execution path
        SDKResult errorResult = new SDKResult();
        errorResult.success = false;
        errorResult.error = "Node.js bridge has been removed. Use Kotlin agent runtime.";
        callback.onError(errorResult.error);
        return CompletableFuture.completedFuture(errorResult);
    }
}
