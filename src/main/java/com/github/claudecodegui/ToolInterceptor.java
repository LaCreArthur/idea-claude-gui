package com.github.claudecodegui;

import com.google.gson.*;
import com.github.claudecodegui.permission.PermissionDialog;
import com.github.claudecodegui.permission.PermissionRequest;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import javax.swing.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class ToolInterceptor {

    private static final Logger LOG = Logger.getInstance(ToolInterceptor.class);
    private final Project project;
    private final Set<String> controlledTools;

    public ToolInterceptor(Project project) {
        this.project = project;

        this.controlledTools = new HashSet<>(Arrays.asList(
            "Write",
            "Edit",
            "Delete",
            "Bash",
            "ExecuteCommand",
            "CreateDirectory",
            "MoveFile",
            "CopyFile"
        ));
    }

    public boolean needsPermission(String message) {
        String lowerMessage = message.toLowerCase();
        return lowerMessage.contains("create") ||
               lowerMessage.contains("write") ||
               lowerMessage.contains("file") ||
               lowerMessage.contains("execute") ||
               lowerMessage.contains("run") ||
               lowerMessage.contains("delete") ||
               lowerMessage.contains("edit");
    }

    public String preprocessMessage(String message) {
        if (!needsPermission(message)) {
            return "default";
        }

        AtomicBoolean userApproved = new AtomicBoolean(false);
        CountDownLatch latch = new CountDownLatch(1);

        ApplicationManager.getApplication().invokeLater(() -> {
            int result = JOptionPane.showConfirmDialog(
                null,
                "Claude needs to perform the following action:\n\n" +
                message + "\n\n" +
                "This may involve file writes or system command execution.\n" +
                "Allow execution?",
                "Permission Request",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.QUESTION_MESSAGE
            );

            userApproved.set(result == JOptionPane.YES_OPTION);
            latch.countDown();
        });

        try {
            boolean responded = latch.await(30, TimeUnit.SECONDS);
            if (!responded) {
                LOG.warn("Permission request timeout, automatically denied");
                return null; // Timeout treated as denial
            }
        } catch (InterruptedException e) {
            LOG.error("Error occurred", e);
            return null;
        }

        if (userApproved.get()) {
            return "bypassPermissions";
        } else {
            return null;
        }
    }

    public CompletableFuture<Boolean> showDetailedPermissionDialog(String toolName, Map<String, Object> inputs) {
        CompletableFuture<Boolean> future = new CompletableFuture<>();

        ApplicationManager.getApplication().invokeLater(() -> {
            PermissionRequest request = new PermissionRequest(
                UUID.randomUUID().toString(),
                toolName,
                inputs,
                null,
                this.project
            );

            PermissionDialog dialog = new PermissionDialog(this.project, request);
            dialog.setDecisionCallback(decision -> {
                future.complete(decision.allow);
            });
            dialog.show();
        });

        return future;
    }

    public List<ToolCall> parseToolCalls(String sdkResponse) {
        List<ToolCall> toolCalls = new ArrayList<>();

        try {
            JsonObject response = JsonParser.parseString(sdkResponse).getAsJsonObject();

            if (response.has("message")) {
                JsonObject message = response.getAsJsonObject("message");
                if (message.has("content")) {
                    JsonArray content = message.getAsJsonArray("content");
                    for (JsonElement element : content) {
                        if (element.isJsonObject()) {
                            JsonObject contentItem = element.getAsJsonObject();
                            if (contentItem.has("type") &&
                                "tool_use".equals(contentItem.get("type").getAsString())) {

                                String toolName = contentItem.get("name").getAsString();
                                JsonObject inputs = contentItem.getAsJsonObject("input");

                                ToolCall call = new ToolCall();
                                call.toolName = toolName;
                                call.inputs = new HashMap<>();

                                for (Map.Entry<String, JsonElement> entry : inputs.entrySet()) {
                                    call.inputs.put(entry.getKey(), entry.getValue().toString());
                                }

                                toolCalls.add(call);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
        }

        return toolCalls;
    }

    public static class ToolCall {
        public String toolName;
        public Map<String, Object> inputs;
    }
}
