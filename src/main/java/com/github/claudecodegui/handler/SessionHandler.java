package com.github.claudecodegui.handler;

import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.notifications.ClaudeNotifier;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import javax.swing.*;
import java.io.File;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SessionHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SessionHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "send_message",
        "send_message_with_attachments",
        "interrupt_session",
        "restart_session"
    };

    public SessionHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "send_message":
                handleSendMessage(content);
                return true;
            case "send_message_with_attachments":
                handleSendMessageWithAttachments(content);
                return true;
            case "interrupt_session":
                handleInterruptSession();
                return true;
            case "restart_session":
                handleRestartSession();
                return true;
            default:
                return false;
        }
    }

    private void handleSendMessage(String content) {
        String nodeVersion = context.getClaudeSDKBridge().getCachedNodeVersion();
        if (nodeVersion == null) {
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("addErrorMessage", escapeJs("No valid Node.js version detected. Please configure in Settings or reopen the tool window."));
            });
            return;
        }
        if (!NodeDetector.isVersionSupported(nodeVersion)) {
            int minVersion = NodeDetector.MIN_NODE_MAJOR_VERSION;
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("addErrorMessage", escapeJs(
                    "Node.js version too low (" + nodeVersion + "). Plugin requires v" + minVersion + " or higher. Please configure the correct Node.js path in Settings."));
            });
            return;
        }

        String prompt;
        String agentPrompt = null;
        try {
            Gson gson = new Gson();
            JsonObject payload = gson.fromJson(content, JsonObject.class);
            prompt = payload != null && payload.has("text") && !payload.get("text").isJsonNull()
                ? payload.get("text").getAsString()
                : content;

            if (payload != null && payload.has("agent") && !payload.get("agent").isJsonNull()) {
                JsonObject agent = payload.getAsJsonObject("agent");
                if (agent.has("prompt") && !agent.get("prompt").isJsonNull()) {
                    agentPrompt = agent.get("prompt").getAsString();
                    String agentName = agent.has("name") ? agent.get("name").getAsString() : "Unknown";
                    LOG.info("[SessionHandler] Using agent from message: " + agentName);
                }
            }
        } catch (Exception e) {
            LOG.debug("[SessionHandler] Message is plain text, not JSON: " + e.getMessage());
            prompt = content;
        }

        final String finalPrompt = prompt;
        final String finalAgentPrompt = agentPrompt;

        CompletableFuture.runAsync(() -> {
            String currentWorkingDir = determineWorkingDirectory();
            String previousCwd = context.getSession().getCwd();

            if (!currentWorkingDir.equals(previousCwd)) {
                context.getSession().setCwd(currentWorkingDir);
                LOG.info("[SessionHandler] Updated working directory: " + currentWorkingDir);
            }

            var project = context.getProject();
            if (project != null) {
                ClaudeNotifier.setWaiting(project);
            }

            context.getSession().send(finalPrompt, finalAgentPrompt)
                .thenRun(() -> {
                    if (project != null) {
                        ClaudeNotifier.showSuccess(project, "Task completed");
                    }
                })
                .exceptionally(ex -> {
                    LOG.error("Failed to send message", ex);
                    if (project != null) {
                        ClaudeNotifier.showError(project, "Task failed: " + ex.getMessage());
                    }
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("addErrorMessage", escapeJs("Send failed: " + ex.getMessage()));
                    });
                    return null;
                });
        });
    }

    private void handleSendMessageWithAttachments(String content) {
        try {
            Gson gson = new Gson();
            JsonObject payload = gson.fromJson(content, JsonObject.class);
            String text = payload != null && payload.has("text") && !payload.get("text").isJsonNull()
                ? payload.get("text").getAsString()
                : "";

            java.util.List<ClaudeSession.Attachment> atts = new java.util.ArrayList<>();
            if (payload != null && payload.has("attachments") && payload.get("attachments").isJsonArray()) {
                JsonArray arr = payload.getAsJsonArray("attachments");
                for (int i = 0; i < arr.size(); i++) {
                    JsonObject a = arr.get(i).getAsJsonObject();
                    String fileName = a.has("fileName") && !a.get("fileName").isJsonNull()
                        ? a.get("fileName").getAsString()
                        : ("attachment-" + System.currentTimeMillis());
                    String mediaType = a.has("mediaType") && !a.get("mediaType").isJsonNull()
                        ? a.get("mediaType").getAsString()
                        : "application/octet-stream";
                    String data = a.has("data") && !a.get("data").isJsonNull()
                        ? a.get("data").getAsString()
                        : "";
                    atts.add(new ClaudeSession.Attachment(fileName, mediaType, data));
                }
            }

            String agentPrompt = null;
            if (payload != null && payload.has("agent") && !payload.get("agent").isJsonNull()) {
                JsonObject agent = payload.getAsJsonObject("agent");
                if (agent.has("prompt") && !agent.get("prompt").isJsonNull()) {
                    agentPrompt = agent.get("prompt").getAsString();
                    String agentName = agent.has("name") ? agent.get("name").getAsString() : "Unknown";
                    LOG.info("[SessionHandler] Using agent from attachment message: " + agentName);
                }
            }

            sendMessageWithAttachments(text, atts, agentPrompt);
        } catch (Exception e) {
            LOG.error("[SessionHandler] Failed to parse attachments: " + e.getMessage(), e);
            handleSendMessage(content);
        }
    }

    private void sendMessageWithAttachments(String prompt, List<ClaudeSession.Attachment> attachments, String agentPrompt) {
        String nodeVersion = context.getClaudeSDKBridge().getCachedNodeVersion();
        if (nodeVersion == null) {
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("addErrorMessage", escapeJs("No valid Node.js version detected. Please configure in Settings or reopen the tool window."));
            });
            return;
        }
        if (!NodeDetector.isVersionSupported(nodeVersion)) {
            int minVersion = NodeDetector.MIN_NODE_MAJOR_VERSION;
            ApplicationManager.getApplication().invokeLater(() -> {
                callJavaScript("addErrorMessage", escapeJs(
                    "Node.js version too low (" + nodeVersion + "). Plugin requires v" + minVersion + " or higher. Please configure the correct Node.js path in Settings."));
            });
            return;
        }

        final String finalAgentPrompt = agentPrompt;

        CompletableFuture.runAsync(() -> {
            String currentWorkingDir = determineWorkingDirectory();
            String previousCwd = context.getSession().getCwd();
            if (!currentWorkingDir.equals(previousCwd)) {
                context.getSession().setCwd(currentWorkingDir);
                LOG.info("[SessionHandler] Updated working directory: " + currentWorkingDir);
            }

            var project = context.getProject();
            if (project != null) {
                ClaudeNotifier.setWaiting(project);
            }

            context.getSession().send(prompt, attachments, finalAgentPrompt)
                .thenRun(() -> {
                    if (project != null) {
                        ClaudeNotifier.showSuccess(project, "Task completed");
                    }
                })
                .exceptionally(ex -> {
                    LOG.error("Failed to send message with attachments", ex);
                    if (project != null) {
                        ClaudeNotifier.showError(project, "Task failed: " + ex.getMessage());
                    }
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("addErrorMessage", escapeJs("Send failed: " + ex.getMessage()));
                    });
                    return null;
                });
        });
    }

    private void handleInterruptSession() {
        context.getSession().interrupt().thenRun(() -> {
            ApplicationManager.getApplication().invokeLater(() -> {});
        });
    }

    private void handleRestartSession() {
        context.getSession().restart().thenRun(() -> {
            ApplicationManager.getApplication().invokeLater(() -> {});
        });
    }

    private String determineWorkingDirectory() {
        String projectPath = context.getProject().getBasePath();
        if (projectPath == null || !new File(projectPath).exists()) {
            String userHome = System.getProperty("user.home");
            LOG.warn("[SessionHandler] Using user home directory as fallback: " + userHome);
            return userHome;
        }

        try {
            com.github.claudecodegui.PluginSettingsService settingsService =
                new com.github.claudecodegui.PluginSettingsService();
            String customWorkingDir = settingsService.getCustomWorkingDirectory(projectPath);
            if (customWorkingDir != null && !customWorkingDir.isEmpty()) {
                File workingDirFile = new File(customWorkingDir);
                if (!workingDirFile.isAbsolute()) {
                    workingDirFile = new File(projectPath, customWorkingDir);
                }
                if (workingDirFile.exists() && workingDirFile.isDirectory()) {
                    String resolvedPath = workingDirFile.getAbsolutePath();
                    LOG.info("[SessionHandler] Using custom working directory: " + resolvedPath);
                    return resolvedPath;
                } else {
                    LOG.warn("[SessionHandler] Custom working directory does not exist: " + workingDirFile.getAbsolutePath() + ", falling back to project root");
                }
            }
        } catch (Exception e) {
            LOG.warn("[SessionHandler] Failed to read custom working directory: " + e.getMessage());
        }
        return projectPath;
    }
}
