package com.github.claudecodegui.permission;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.util.*;
import java.util.concurrent.*;

/**
 * Permission service - handles permission requests via direct API (stdin/stdout protocol).
 * File-based IPC has been removed in favor of the new stdin/stdout bridge protocol.
 */
public class PermissionService {

    private static final Logger LOG = Logger.getInstance(PermissionService.class);

    private static PermissionService instance;
    private final Project project;

    // Permission memory (tool+params level)
    private final Map<String, Integer> permissionMemory = new ConcurrentHashMap<>();
    // Tool-level permission memory (tool name -> always allow)
    private final Map<String, Boolean> toolOnlyPermissionMemory = new ConcurrentHashMap<>();
    private volatile PermissionDecisionListener decisionListener;

    // Multi-project support: dialog showers registered per project
    private final Map<Project, PermissionDialogShower> dialogShowers = new ConcurrentHashMap<>();

    // AskUserQuestion dialog showers per project
    private final Map<Project, AskUserQuestionDialogShower> askUserQuestionDialogShowers = new ConcurrentHashMap<>();

    // PlanApproval dialog showers per project
    private final Map<Project, PlanApprovalDialogShower> planApprovalDialogShowers = new ConcurrentHashMap<>();

    private void debugLog(String tag, String message) {
        LOG.debug(String.format("[%s] %s", tag, message));
    }

    public enum PermissionResponse {
        ALLOW(1, "Allow"),
        ALLOW_ALWAYS(2, "Allow and don't ask again"),
        DENY(3, "Deny");

        private final int value;
        private final String description;

        PermissionResponse(int value, String description) {
            this.value = value;
            this.description = description;
        }

        public int getValue() {
            return value;
        }

        public String getDescription() {
            return description;
        }

        public static PermissionResponse fromValue(int value) {
            for (PermissionResponse response : values()) {
                if (response.value == value) {
                    return response;
                }
            }
            return null;
        }

        public boolean isAllow() {
            return this == ALLOW || this == ALLOW_ALWAYS;
        }
    }

    public static class PermissionDecision {
        private final String toolName;
        private final JsonObject inputs;
        private final PermissionResponse response;

        public PermissionDecision(String toolName, JsonObject inputs, PermissionResponse response) {
            this.toolName = toolName;
            this.inputs = inputs;
            this.response = response;
        }

        public String getToolName() {
            return toolName;
        }

        public JsonObject getInputs() {
            return inputs;
        }

        public PermissionResponse getResponse() {
            return response;
        }

        public boolean isAllowed() {
            return response != null && response.isAllow();
        }
    }

    public interface PermissionDecisionListener {
        void onDecision(PermissionDecision decision);
    }

    /**
     * Permission dialog shower interface - for showing frontend dialogs
     */
    public interface PermissionDialogShower {
        /**
         * Show permission dialog and return user decision
         * @param toolName Tool name
         * @param inputs Input parameters
         * @return CompletableFuture<Integer> returning PermissionResponse value
         */
        CompletableFuture<Integer> showPermissionDialog(String toolName, JsonObject inputs);
    }

    /**
     * AskUserQuestion dialog shower interface - for showing question dialogs
     */
    public interface AskUserQuestionDialogShower {
        /**
         * Show ask-user-question dialog and return user answers
         * @param requestId Request ID for correlation
         * @param questionsData Questions data from the tool
         * @return CompletableFuture<JsonObject> returning answers object or null if cancelled
         */
        CompletableFuture<JsonObject> showAskUserQuestionDialog(String requestId, JsonObject questionsData);
    }

    /**
     * PlanApproval dialog shower interface - for showing plan approval dialogs
     */
    public interface PlanApprovalDialogShower {
        /**
         * Show plan approval dialog and return user decision
         * @param requestId Request ID for correlation
         * @param planData Plan data containing the plan text
         * @return CompletableFuture<JsonObject> returning { approved: boolean, newMode: string } or null if cancelled
         */
        CompletableFuture<JsonObject> showPlanApprovalDialog(String requestId, JsonObject planData);
    }

    private PermissionService(Project project) {
        this.project = project;
    }

    public static synchronized PermissionService getInstance(Project project) {
        if (instance == null) {
            instance = new PermissionService(project);
        }
        return instance;
    }

    public void setDecisionListener(PermissionDecisionListener listener) {
        this.decisionListener = listener;
        debugLog("CONFIG", "Decision listener set: " + (listener != null));
    }

    /**
     * Register permission dialog shower for a project
     * @param project Project
     * @param shower Permission dialog shower
     */
    public void registerDialogShower(Project project, PermissionDialogShower shower) {
        if (project != null && shower != null) {
            dialogShowers.put(project, shower);
            debugLog("CONFIG", "Dialog shower registered for project: " + project.getName() +
                ", total registered: " + dialogShowers.size());
        }
    }

    /**
     * Unregister permission dialog shower for a project
     * @param project Project
     */
    public void unregisterDialogShower(Project project) {
        if (project != null) {
            PermissionDialogShower removed = dialogShowers.remove(project);
            debugLog("CONFIG", "Dialog shower unregistered for project: " + project.getName() +
                ", was registered: " + (removed != null) + ", remaining: " + dialogShowers.size());
        }
    }

    /**
     * Set permission dialog shower (for showing frontend dialogs)
     * @deprecated Use {@link #registerDialogShower(Project, PermissionDialogShower)} instead
     */
    @Deprecated
    public void setDialogShower(PermissionDialogShower shower) {
        // Legacy compatibility: register with default project
        if (shower != null && this.project != null) {
            dialogShowers.put(this.project, shower);
        }
        debugLog("CONFIG", "Dialog shower set (legacy): " + (shower != null));
    }

    /**
     * Register AskUserQuestion dialog shower for a project
     * @param project Project
     * @param shower AskUserQuestion dialog shower
     */
    public void registerAskUserQuestionDialogShower(Project project, AskUserQuestionDialogShower shower) {
        if (project != null && shower != null) {
            askUserQuestionDialogShowers.put(project, shower);
            debugLog("CONFIG", "AskUserQuestion dialog shower registered for project: " + project.getName());
        }
    }

    /**
     * Unregister AskUserQuestion dialog shower for a project
     * @param project Project
     */
    public void unregisterAskUserQuestionDialogShower(Project project) {
        if (project != null) {
            askUserQuestionDialogShowers.remove(project);
            debugLog("CONFIG", "AskUserQuestion dialog shower unregistered for project: " + project.getName());
        }
    }

    /**
     * Get an AskUserQuestion dialog shower (uses first available if multiple)
     */
    private AskUserQuestionDialogShower getAskUserQuestionDialogShower() {
        if (askUserQuestionDialogShowers.isEmpty()) {
            return null;
        }
        return askUserQuestionDialogShowers.values().iterator().next();
    }

    /**
     * Register PlanApproval dialog shower for a project
     * @param project Project
     * @param shower PlanApproval dialog shower
     */
    public void registerPlanApprovalDialogShower(Project project, PlanApprovalDialogShower shower) {
        if (project != null && shower != null) {
            planApprovalDialogShowers.put(project, shower);
            debugLog("CONFIG", "PlanApproval dialog shower registered for project: " + project.getName());
        }
    }

    /**
     * Unregister PlanApproval dialog shower for a project
     * @param project Project
     */
    public void unregisterPlanApprovalDialogShower(Project project) {
        if (project != null) {
            planApprovalDialogShowers.remove(project);
            debugLog("CONFIG", "PlanApproval dialog shower unregistered for project: " + project.getName());
        }
    }

    /**
     * Get a PlanApproval dialog shower (uses first available if multiple)
     */
    private PlanApprovalDialogShower getPlanApprovalDialogShower() {
        if (planApprovalDialogShowers.isEmpty()) {
            return null;
        }
        return planApprovalDialogShowers.values().iterator().next();
    }

    /**
     * Find dialog shower by matching project based on file paths in inputs
     * @param inputs Permission request input parameters
     * @return Matched dialog shower, or first registered if no match
     */
    private PermissionDialogShower findDialogShowerByInputs(JsonObject inputs) {
        if (dialogShowers.isEmpty()) {
            debugLog("MATCH_PROJECT", "No dialog showers registered");
            return null;
        }

        // Single project: return directly
        if (dialogShowers.size() == 1) {
            Map.Entry<Project, PermissionDialogShower> entry = dialogShowers.entrySet().iterator().next();
            debugLog("MATCH_PROJECT", "Single project registered: " + entry.getKey().getName());
            return entry.getValue();
        }

        // Extract file path from inputs
        String filePath = extractFilePathFromInputs(inputs);
        if (filePath == null || filePath.isEmpty()) {
            debugLog("MATCH_PROJECT", "No file path found in inputs, using first registered project");
            return dialogShowers.values().iterator().next();
        }

        // Normalize file path (use Unix-style / separator)
        String normalizedFilePath = normalizePath(filePath);
        debugLog("MATCH_PROJECT", "Extracted file path: " + filePath +
            (filePath.equals(normalizedFilePath) ? "" : " (normalized: " + normalizedFilePath + ")"));

        // Find best matching project (longest path match)
        Project bestMatch = null;
        int longestMatchLength = 0;

        for (Map.Entry<Project, PermissionDialogShower> entry : dialogShowers.entrySet()) {
            Project project = entry.getKey();
            String projectPath = project.getBasePath();

            if (projectPath != null) {
                String normalizedProjectPath = normalizePath(projectPath);

                if (isFileInProject(normalizedFilePath, normalizedProjectPath)) {
                    if (normalizedProjectPath.length() > longestMatchLength) {
                        longestMatchLength = normalizedProjectPath.length();
                        bestMatch = project;
                        debugLog("MATCH_PROJECT", "Found potential match: " + project.getName() +
                            " (path: " + projectPath + ", length: " + normalizedProjectPath.length() + ")");
                    }
                }
            }
        }

        if (bestMatch != null) {
            debugLog("MATCH_PROJECT", "Matched project: " + bestMatch.getName() + " (path: " + bestMatch.getBasePath() + ")");
            return dialogShowers.get(bestMatch);
        }

        // No match found, use first registered
        Map.Entry<Project, PermissionDialogShower> firstEntry = dialogShowers.entrySet().iterator().next();
        debugLog("MATCH_PROJECT", "No matching project found, using first: " + firstEntry.getKey().getName());
        return firstEntry.getValue();
    }

    /**
     * Extract file path from inputs.
     * Supports multiple fields: file_path, path, command paths, etc.
     */
    private String extractFilePathFromInputs(JsonObject inputs) {
        if (inputs == null) {
            return null;
        }

        // Check file_path field (most common)
        if (inputs.has("file_path") && !inputs.get("file_path").isJsonNull()) {
            return inputs.get("file_path").getAsString();
        }

        // Check path field
        if (inputs.has("path") && !inputs.get("path").isJsonNull()) {
            return inputs.get("path").getAsString();
        }

        // Check notebook_path field (Jupyter notebooks)
        if (inputs.has("notebook_path") && !inputs.get("notebook_path").isJsonNull()) {
            return inputs.get("notebook_path").getAsString();
        }

        // Extract path from command field
        if (inputs.has("command") && !inputs.get("command").isJsonNull()) {
            String command = inputs.get("command").getAsString();
            String[] parts = command.split("\\s+");
            for (String part : parts) {
                if (part.startsWith("/") || (part.length() > 2 && part.charAt(1) == ':')) {
                    part = part.replace("\"", "").replace("'", "");
                    if (part.length() > 1) {
                        return part;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Normalize file path to Unix-style (/) for cross-platform compatibility
     */
    private String normalizePath(String path) {
        if (path == null) {
            return null;
        }
        return path.replace('\\', '/');
    }

    /**
     * Check if file path belongs to project path.
     * Ensures complete path prefix match, not just string prefix.
     */
    private boolean isFileInProject(String filePath, String projectPath) {
        if (filePath == null || projectPath == null) {
            return false;
        }

        if (filePath.equals(projectPath)) {
            return true;
        }

        String normalizedProjectPath = projectPath.endsWith("/")
            ? projectPath
            : projectPath + "/";

        return filePath.startsWith(normalizedProjectPath);
    }

    // ============================================================================
    // Direct permission request API (for stdin/stdout bridge protocol)
    // ============================================================================

    /**
     * Request permission directly (no file-based IPC).
     * Used by the new bridge.js stdin/stdout protocol.
     *
     * @param toolName Tool name requesting permission
     * @param inputs   Tool input parameters
     * @return CompletableFuture resolving to JsonObject with { allow: boolean, message?: string }
     */
    public CompletableFuture<JsonObject> requestPermissionDirect(String toolName, JsonObject inputs) {
        debugLog("DIRECT_REQUEST", "Permission request for: " + toolName);

        // Check tool-level permission memory (always allow)
        if (toolOnlyPermissionMemory.containsKey(toolName)) {
            boolean allow = toolOnlyPermissionMemory.get(toolName);
            debugLog("DIRECT_MEMORY_HIT", "Using tool-level memory for " + toolName + " -> " + (allow ? "ALLOW" : "DENY"));

            JsonObject response = new JsonObject();
            response.addProperty("allow", allow);
            notifyDecision(toolName, inputs, allow ? PermissionResponse.ALLOW_ALWAYS : PermissionResponse.DENY);
            return CompletableFuture.completedFuture(response);
        }

        // Find dialog shower
        PermissionDialogShower matchedDialogShower = findDialogShowerByInputs(inputs);

        if (matchedDialogShower == null) {
            debugLog("DIRECT_NO_SHOWER", "No dialog shower registered, denying by default");
            JsonObject response = new JsonObject();
            response.addProperty("allow", false);
            response.addProperty("message", "No permission dialog available");
            return CompletableFuture.completedFuture(response);
        }

        debugLog("DIRECT_DIALOG", "Showing permission dialog for: " + toolName);

        // Show dialog and wait for response
        return matchedDialogShower.showPermissionDialog(toolName, inputs)
            .thenApply(responseValue -> {
                PermissionResponse decision = PermissionResponse.fromValue(responseValue);
                if (decision == null) {
                    decision = PermissionResponse.DENY;
                }

                boolean allow;
                switch (decision) {
                    case ALLOW:
                        allow = true;
                        break;
                    case ALLOW_ALWAYS:
                        allow = true;
                        toolOnlyPermissionMemory.put(toolName, true);
                        debugLog("DIRECT_ALLOW_ALWAYS", "Saved tool-level memory for: " + toolName);
                        break;
                    case DENY:
                    default:
                        allow = false;
                        break;
                }

                notifyDecision(toolName, inputs, decision);

                JsonObject response = new JsonObject();
                response.addProperty("allow", allow);
                return response;
            })
            .exceptionally(ex -> {
                debugLog("DIRECT_ERROR", "Dialog error: " + ex.getMessage());
                JsonObject response = new JsonObject();
                response.addProperty("allow", false);
                response.addProperty("message", "Dialog error: " + ex.getMessage());
                return response;
            });
    }

    /**
     * Request AskUserQuestion directly (no file-based IPC).
     * Used by the new bridge.js stdin/stdout protocol.
     *
     * @param questions Questions array from the AskUserQuestion tool
     * @return CompletableFuture resolving to JsonObject with { allow: boolean, answers?: object }
     */
    public CompletableFuture<JsonObject> requestAskUserQuestionDirect(JsonArray questions) {
        debugLog("DIRECT_ASK_USER", "AskUserQuestion request");

        AskUserQuestionDialogShower dialogShower = getAskUserQuestionDialogShower();
        if (dialogShower == null) {
            debugLog("DIRECT_NO_ASK_SHOWER", "No AskUserQuestion dialog shower registered");
            JsonObject response = new JsonObject();
            response.addProperty("allow", false);
            response.addProperty("message", "No AskUserQuestion dialog available");
            return CompletableFuture.completedFuture(response);
        }

        // Build request object
        JsonObject request = new JsonObject();
        request.add("questions", questions);

        String requestId = String.valueOf(System.currentTimeMillis());

        return dialogShower.showAskUserQuestionDialog(requestId, request)
            .thenApply(answers -> {
                JsonObject response = new JsonObject();
                if (answers != null) {
                    response.addProperty("allow", true);
                    response.add("answers", answers);
                } else {
                    response.addProperty("allow", false);
                }
                return response;
            })
            .exceptionally(ex -> {
                debugLog("DIRECT_ASK_ERROR", "Dialog error: " + ex.getMessage());
                JsonObject response = new JsonObject();
                response.addProperty("allow", false);
                response.addProperty("message", "Dialog error: " + ex.getMessage());
                return response;
            });
    }

    /**
     * Request PlanApproval directly (no file-based IPC).
     * Used by the new bridge.js stdin/stdout protocol.
     *
     * @param planData Plan data containing the plan text
     * @return CompletableFuture resolving to JsonObject with { approved: boolean, newMode?: string }
     */
    public CompletableFuture<JsonObject> requestPlanApprovalDirect(JsonObject planData) {
        debugLog("DIRECT_PLAN_APPROVAL", "PlanApproval request");

        PlanApprovalDialogShower dialogShower = getPlanApprovalDialogShower();
        if (dialogShower == null) {
            debugLog("DIRECT_NO_PLAN_SHOWER", "No PlanApproval dialog shower registered");
            JsonObject response = new JsonObject();
            response.addProperty("approved", false);
            response.addProperty("newMode", "default");
            return CompletableFuture.completedFuture(response);
        }

        String requestId = String.valueOf(System.currentTimeMillis());

        return dialogShower.showPlanApprovalDialog(requestId, planData)
            .thenApply(result -> {
                JsonObject response = new JsonObject();
                if (result != null && result.has("approved") && result.get("approved").getAsBoolean()) {
                    response.addProperty("approved", true);
                    String newMode = result.has("newMode") ? result.get("newMode").getAsString() : "default";
                    response.addProperty("newMode", newMode);
                } else {
                    response.addProperty("approved", false);
                    response.addProperty("newMode", "default");
                }
                return response;
            })
            .exceptionally(ex -> {
                debugLog("DIRECT_PLAN_ERROR", "Dialog error: " + ex.getMessage());
                JsonObject response = new JsonObject();
                response.addProperty("approved", false);
                response.addProperty("newMode", "default");
                return response;
            });
    }

    private void notifyDecision(String toolName, JsonObject inputs, PermissionResponse response) {
        PermissionDecisionListener listener = this.decisionListener;
        if (listener == null || response == null) {
            return;
        }

        try {
            listener.onDecision(new PermissionDecision(toolName, inputs, response));
        } catch (Exception e) {
            LOG.error("Error occurred", e);
        }
    }
}
