package com.github.claudecodegui.permission;

import com.google.gson.JsonObject;
import com.intellij.openapi.project.Project;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

public class PermissionManager {

    public enum PermissionMode {
        DEFAULT,
        ACCEPT_EDITS,
        ALLOW_ALL,
        DENY_ALL
    }

    private PermissionMode mode = PermissionMode.DEFAULT;
    private final Map<String, PermissionRequest> pendingRequests = new ConcurrentHashMap<>();
    private final Map<String, Boolean> toolPermissionMemory = new ConcurrentHashMap<>();
    private final Map<String, Boolean> toolOnlyPermissionMemory = new ConcurrentHashMap<>();
    private Consumer<PermissionRequest> onPermissionRequestedCallback;

    public PermissionRequest createRequest(String channelId, String toolName, Map<String, Object> inputs, JsonObject suggestions, Project project) {
        if (toolOnlyPermissionMemory.containsKey(toolName)) {
            PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
            if (toolOnlyPermissionMemory.get(toolName)) {
                request.accept();
            } else {
                request.reject("Previously denied by user", true);
            }
            return request;
        }

        String memoryKey = toolName + ":" + generateInputHash(inputs);
        if (toolPermissionMemory.containsKey(memoryKey)) {
            PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
            if (toolPermissionMemory.get(memoryKey)) {
                request.accept();
            } else {
                request.reject("Previously denied by user", true);
            }
            return request;
        }

        if (mode == PermissionMode.ACCEPT_EDITS) {
            if (isAutoApprovedInAcceptEditsMode(toolName)) {
                PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
                request.accept();
                return request;
            }
        }
        if (mode == PermissionMode.ALLOW_ALL) {
            PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
            request.accept();
            return request;
        } else if (mode == PermissionMode.DENY_ALL) {
            PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
            request.reject("Denied by global permission mode", true);
            return request;
        }

        PermissionRequest request = new PermissionRequest(channelId, toolName, inputs, suggestions, project);
        pendingRequests.put(channelId, request);

        if (onPermissionRequestedCallback != null) {
            onPermissionRequestedCallback.accept(request);
        }

        return request;
    }

    @Deprecated
    public PermissionRequest createRequest(String channelId, String toolName, Map<String, Object> inputs, JsonObject suggestions) {
        return createRequest(channelId, toolName, inputs, suggestions, null);
    }

    public void handlePermissionDecision(String channelId, boolean allow, boolean rememberDecision, String rejectMessage) {
        PermissionRequest request = pendingRequests.remove(channelId);
        if (request == null || request.isResolved()) {
            return;
        }

        if (rememberDecision) {
            String memoryKey = request.getToolName() + ":" + generateInputHash(request.getInputs());
            toolPermissionMemory.put(memoryKey, allow);
        }

        if (allow) {
            request.accept();
        } else {
            request.reject(rejectMessage != null ? rejectMessage : "Denied by user", true);
        }
    }

    public void handlePermissionDecisionAlways(String channelId, boolean allow) {
        PermissionRequest request = pendingRequests.remove(channelId);
        if (request == null || request.isResolved()) {
            return;
        }

        toolOnlyPermissionMemory.put(request.getToolName(), allow);

        if (allow) {
            request.accept();
        } else {
            request.reject("Denied by user", true);
        }
    }

    public void setOnPermissionRequestedCallback(Consumer<PermissionRequest> callback) {
        this.onPermissionRequestedCallback = callback;
    }

    public void setPermissionMode(PermissionMode mode) {
        this.mode = mode;
    }

    public PermissionMode getPermissionMode() {
        return mode;
    }

    public void clearPermissionMemory() {
        toolPermissionMemory.clear();
    }

    public void clearToolPermissionMemory(String toolName) {
        toolPermissionMemory.entrySet().removeIf(entry -> entry.getKey().startsWith(toolName + ":"));
    }

    private String generateInputHash(Map<String, Object> inputs) {
        if (inputs == null || inputs.isEmpty()) {
            return "empty";
        }
        return String.valueOf(inputs.toString().hashCode());
    }

    private boolean isAutoApprovedInAcceptEditsMode(String toolName) {
        if (toolName == null || toolName.isEmpty()) {
            return false;
        }
        return "Write".equals(toolName)
            || "Edit".equals(toolName)
            || "MultiEdit".equals(toolName)
            || "CreateDirectory".equals(toolName)
            || "MoveFile".equals(toolName)
            || "CopyFile".equals(toolName)
            || "Rename".equals(toolName);
    }

    public Collection<PermissionRequest> getPendingRequests() {
        return new ArrayList<>(pendingRequests.values());
    }

    public void cancelAllPendingRequests() {
        for (PermissionRequest request : pendingRequests.values()) {
            request.reject("All requests cancelled", true);
        }
        pendingRequests.clear();
    }
}
