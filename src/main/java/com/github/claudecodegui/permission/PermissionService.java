package com.github.claudecodegui.permission;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import javax.swing.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * 权限服务 - 处理Node.js的权限请求
 */
public class PermissionService {

    private static final Logger LOG = Logger.getInstance(PermissionService.class);

    private static PermissionService instance;
    private final Project project;
    private final Path permissionDir;
    private final Gson gson = new Gson();
    private WatchService watchService;
    private Thread watchThread;
    private boolean running = false;

    // 记忆用户选择（工具+参数级别）
    private final Map<String, Integer> permissionMemory = new ConcurrentHashMap<>();
    // 工具级别权限记忆（仅工具名 -> 是否总是允许）
    private final Map<String, Boolean> toolOnlyPermissionMemory = new ConcurrentHashMap<>();
    private volatile PermissionDecisionListener decisionListener;

    // Multi-project support: dialog showers registered per project
    private final Map<Project, PermissionDialogShower> dialogShowers = new ConcurrentHashMap<>();

    // AskUserQuestion dialog showers per project
    private final Map<Project, AskUserQuestionDialogShower> askUserQuestionDialogShowers = new ConcurrentHashMap<>();

    // 调试日志辅助方法
    private void debugLog(String tag, String message) {
        LOG.debug(String.format("[%s] %s", tag, message));
    }

    private void debugLog(String tag, String message, Object data) {
        LOG.debug(String.format("[%s] %s | Data: %s", tag, message, this.gson.toJson(data)));
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

    private PermissionService(Project project) {
        this.project = project;
        // 使用临时目录进行通信
        this.permissionDir = Paths.get(System.getProperty("java.io.tmpdir"), "claude-permission");
        debugLog("INIT", "Permission dir: " + permissionDir);
        debugLog("INIT", "java.io.tmpdir: " + System.getProperty("java.io.tmpdir"));
        try {
            Files.createDirectories(permissionDir);
            debugLog("INIT", "Permission directory created/verified: " + permissionDir);
        } catch (IOException e) {
            debugLog("INIT_ERROR", "Failed to create permission dir: " + e.getMessage());
            LOG.error("Error occurred", e);
        }
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
     * 注册权限对话框显示器（用于显示前端弹窗）
     * 支持多项目：每个项目注册自己的显示器
     *
     * @param project 项目
     * @param shower 权限对话框显示器
     */
    public void registerDialogShower(Project project, PermissionDialogShower shower) {
        if (project != null && shower != null) {
            dialogShowers.put(project, shower);
            debugLog("CONFIG", "Dialog shower registered for project: " + project.getName() +
                ", total registered: " + dialogShowers.size());
        }
    }

    /**
     * 注销权限对话框显示器
     * 在项目关闭时调用，防止内存泄漏
     *
     * @param project 项目
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
     * 根据文件路径匹配项目
     * 从 inputs 中提取文件路径，然后找到对应的项目
     *
     * @param inputs 权限请求的输入参数
     * @return 匹配的项目对应的 DialogShower，如果匹配不到则返回第一个注册的
     */
    private PermissionDialogShower findDialogShowerByInputs(JsonObject inputs) {
        if (dialogShowers.isEmpty()) {
            debugLog("MATCH_PROJECT", "No dialog showers registered");
            return null;
        }

        // 只有一个项目时，直接返回
        if (dialogShowers.size() == 1) {
            Map.Entry<Project, PermissionDialogShower> entry = dialogShowers.entrySet().iterator().next();
            debugLog("MATCH_PROJECT", "Single project registered: " + entry.getKey().getName());
            return entry.getValue();
        }

        // 从 inputs 中提取文件路径
        String filePath = extractFilePathFromInputs(inputs);
        if (filePath == null || filePath.isEmpty()) {
            debugLog("MATCH_PROJECT", "No file path found in inputs, using first registered project");
            return dialogShowers.values().iterator().next();
        }

        // 规范化文件路径（统一使用 Unix 风格的 / 分隔符）
        String normalizedFilePath = normalizePath(filePath);
        debugLog("MATCH_PROJECT", "Extracted file path: " + filePath +
            (filePath.equals(normalizedFilePath) ? "" : " (normalized: " + normalizedFilePath + ")"));

        // 遍历所有项目，找到路径匹配的项目（选择最长匹配）
        Project bestMatch = null;
        int longestMatchLength = 0;

        for (Map.Entry<Project, PermissionDialogShower> entry : dialogShowers.entrySet()) {
            Project project = entry.getKey();
            String projectPath = project.getBasePath();

            if (projectPath != null) {
                // 规范化项目路径
                String normalizedProjectPath = normalizePath(projectPath);

                // 使用新的路径匹配方法（检查路径分隔符）
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

        // 匹配失败，使用第一个注册的项目
        Map.Entry<Project, PermissionDialogShower> firstEntry = dialogShowers.entrySet().iterator().next();
        debugLog("MATCH_PROJECT", "No matching project found, using first: " + firstEntry.getKey().getName());
        return firstEntry.getValue();
    }

    /**
     * 从 inputs 中提取文件路径
     * 支持多种字段：file_path、path、command 中的路径等
     */
    private String extractFilePathFromInputs(JsonObject inputs) {
        if (inputs == null) {
            return null;
        }

        // 优先检查 file_path 字段（最常见）
        if (inputs.has("file_path") && !inputs.get("file_path").isJsonNull()) {
            return inputs.get("file_path").getAsString();
        }

        // 检查 path 字段
        if (inputs.has("path") && !inputs.get("path").isJsonNull()) {
            return inputs.get("path").getAsString();
        }

        // 检查 notebook_path 字段（Jupyter notebooks）
        if (inputs.has("notebook_path") && !inputs.get("notebook_path").isJsonNull()) {
            return inputs.get("notebook_path").getAsString();
        }

        // 从 command 字段中提取路径（尝试找到绝对路径）
        if (inputs.has("command") && !inputs.get("command").isJsonNull()) {
            String command = inputs.get("command").getAsString();
            // 简单的路径提取：查找以 / 开头的路径（Unix）或包含 :\ 的路径（Windows）
            String[] parts = command.split("\\s+");
            for (String part : parts) {
                if (part.startsWith("/") || (part.length() > 2 && part.charAt(1) == ':')) {
                    // 去除可能的引号
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
     * 规范化文件路径
     * 统一路径分隔符为 Unix 风格 (/)，确保跨平台兼容性
     *
     * @param path 原始路径
     * @return 规范化后的路径，如果输入为 null 则返回 null
     */
    private String normalizePath(String path) {
        if (path == null) {
            return null;
        }
        // 将 Windows 风格的反斜杠替换为正斜杠
        return path.replace('\\', '/');
    }

    /**
     * 检查文件路径是否属于项目路径
     * 确保匹配的是完整的路径前缀，而不是字符串前缀
     *
     * 例如：
     * - /home/user/my-app/file.txt 属于 /home/user/my-app ✓
     * - /home/user/my-app-v2/file.txt 不属于 /home/user/my-app ✓
     *
     * @param filePath 文件路径（已规范化）
     * @param projectPath 项目路径（已规范化）
     * @return true 如果文件属于该项目
     */
    private boolean isFileInProject(String filePath, String projectPath) {
        if (filePath == null || projectPath == null) {
            return false;
        }

        // 完全相等的情况
        if (filePath.equals(projectPath)) {
            return true;
        }

        // 确保 projectPath 以分隔符结尾，避免前缀匹配错误
        // 例如：/home/user/my-app/ 而不是 /home/user/my-app
        String normalizedProjectPath = projectPath.endsWith("/")
            ? projectPath
            : projectPath + "/";

        // 检查文件路径是否以 "项目路径/" 开头
        return filePath.startsWith(normalizedProjectPath);
    }

    /**
     * 启动权限服务
     */
    public void start() {
        if (running) {
            debugLog("START", "Already running, skipping start");
            return;
        }

        running = true;

        watchThread = new Thread(this::watchLoop, "PermissionWatcher");
        watchThread.setDaemon(true);
        watchThread.start();

        debugLog("START", "Started polling on: " + permissionDir);
    }

    /**
     * 监控文件变化
     * 改为轮询模式，以提高在 macOS /tmp 目录下的可靠性
     */
    private void watchLoop() {
        debugLog("WATCH_LOOP", "Starting polling loop on: " + permissionDir);
        int pollCount = 0;
        while (running) {
            try {
                pollCount++;
                File dir = permissionDir.toFile();
                if (!dir.exists()) {
                    dir.mkdirs();
                }

                // Scan for permission request files
                File[] permissionFiles = dir.listFiles((d, name) -> name.startsWith("request-") && name.endsWith(".json"));

                // Scan for ask-user-question request files
                File[] askUserQuestionFiles = dir.listFiles((d, name) ->
                    name.startsWith("ask-user-question-") && name.endsWith(".json") && !name.contains("-response"));

                // Log status periodically (every ~50 seconds)
                if (pollCount % 100 == 0) {
                    int permFileCount = permissionFiles != null ? permissionFiles.length : 0;
                    int askFileCount = askUserQuestionFiles != null ? askUserQuestionFiles.length : 0;
                    debugLog("POLL_STATUS", String.format("Poll #%d, found %d permission + %d ask-user-question files",
                        pollCount, permFileCount, askFileCount));
                }

                // Handle permission requests
                if (permissionFiles != null && permissionFiles.length > 0) {
                    for (File file : permissionFiles) {
                        if (file.exists()) {
                            debugLog("REQUEST_FOUND", "Found request file: " + file.getName());
                            handlePermissionRequest(file.toPath());
                        }
                    }
                }

                // Handle ask-user-question requests
                if (askUserQuestionFiles != null && askUserQuestionFiles.length > 0) {
                    for (File file : askUserQuestionFiles) {
                        if (file.exists()) {
                            debugLog("ASK_USER_QUESTION_FOUND", "Found ask-user-question file: " + file.getName());
                            handleAskUserQuestionRequest(file.toPath());
                        }
                    }
                }

                // 轮询间隔 500ms
                Thread.sleep(500);
            } catch (Exception e) {
                debugLog("POLL_ERROR", "Error in poll loop: " + e.getMessage());
                LOG.error("Error occurred", e);
                try {
                    Thread.sleep(1000); // 出错后稍作等待
                } catch (InterruptedException ex) {
                    break;
                }
            }
        }
        debugLog("WATCH_LOOP", "Polling loop ended");
    }

    // 记录正在处理的请求文件，避免重复处理
    private final Set<String> processingRequests = ConcurrentHashMap.newKeySet();

    /**
     * 处理权限请求
     */
    private void handlePermissionRequest(Path requestFile) {
        String fileName = requestFile.getFileName().toString();
        long startTime = System.currentTimeMillis();
        debugLog("HANDLE_REQUEST", "Processing request file: " + fileName);

        // 检查是否正在处理该请求
        if (!processingRequests.add(fileName)) {
            debugLog("SKIP_DUPLICATE", "Request already being processed, skipping: " + fileName);
            return;
        }

        try {
            Thread.sleep(100); // 等待文件写入完成

            String content = Files.readString(requestFile);
            debugLog("FILE_READ", "Read request content: " + content.substring(0, Math.min(200, content.length())) + "...");

            JsonObject request = gson.fromJson(content, JsonObject.class);

            String requestId = request.get("requestId").getAsString();
            String toolName = request.get("toolName").getAsString();
            JsonObject inputs = request.get("inputs").getAsJsonObject();

            debugLog("REQUEST_PARSED", String.format("requestId=%s, toolName=%s", requestId, toolName));

            // 首先检查工具级别的权限记忆（总是允许）
            if (toolOnlyPermissionMemory.containsKey(toolName)) {
                boolean allow = toolOnlyPermissionMemory.get(toolName);
                debugLog("MEMORY_HIT", "Using tool-level memory for " + toolName + " -> " + (allow ? "ALLOW" : "DENY"));
                writeResponse(requestId, allow);
                notifyDecision(toolName, inputs, allow ? PermissionResponse.ALLOW_ALWAYS : PermissionResponse.DENY);
                Files.deleteIfExists(requestFile);
                processingRequests.remove(fileName);
                return;
            }

            // 生成内存键（工具+参数）
            String memoryKey = toolName + ":" + inputs.toString().hashCode();
            debugLog("MEMORY_KEY", "Generated memory key: " + memoryKey);

            // 检查是否有记忆的选择（工具+参数级别）
            if (permissionMemory.containsKey(memoryKey)) {
                int memorized = permissionMemory.get(memoryKey);
                PermissionResponse rememberedResponse = PermissionResponse.fromValue(memorized);
                boolean allow = rememberedResponse != PermissionResponse.DENY;
                debugLog("PARAM_MEMORY_HIT", "Using param-level memory: " + memoryKey + " -> " + (allow ? "ALLOW" : "DENY"));
                writeResponse(requestId, allow);
                notifyDecision(toolName, inputs, rememberedResponse);
                Files.deleteIfExists(requestFile);
                processingRequests.remove(fileName);
                return;
            }

            // 根据文件路径匹配项目，找到对应的前端弹窗显示器
            PermissionDialogShower matchedDialogShower = findDialogShowerByInputs(inputs);

            // 如果有前端弹窗显示器，使用异步方式
            if (matchedDialogShower != null) {
                debugLog("DIALOG_SHOWER", "Using frontend dialog for: " + toolName);

                // 立即删除请求文件，避免重复处理
                try {
                    Files.deleteIfExists(requestFile);
                    debugLog("FILE_DELETE", "Deleted request file: " + fileName);
                } catch (Exception e) {
                    debugLog("FILE_DELETE_ERROR", "Failed to delete request file: " + e.getMessage());
                }

                final String memKey = memoryKey;
                final String tool = toolName;
                final long dialogStartTime = System.currentTimeMillis();

                // 异步调用前端弹窗
                debugLog("DIALOG_SHOW", "Calling dialogShower.showPermissionDialog for: " + toolName);
                CompletableFuture<Integer> future = matchedDialogShower.showPermissionDialog(toolName, inputs);

                // 异步处理结果
                future.thenAccept(response -> {
                    long dialogElapsed = System.currentTimeMillis() - dialogStartTime;
                    debugLog("DIALOG_RESPONSE", String.format("Got response %d after %dms for %s", response, dialogElapsed, tool));
                    try {
                        PermissionResponse decision = PermissionResponse.fromValue(response);
                        if (decision == null) {
                            debugLog("RESPONSE_NULL", "Response value " + response + " mapped to null, defaulting to DENY");
                            decision = PermissionResponse.DENY;
                        }

                        boolean allow;
                        switch (decision) {
                            case ALLOW:
                                allow = true;
                                debugLog("DECISION", "ALLOW (single) for " + tool);
                                break;
                            case ALLOW_ALWAYS:
                                allow = true;
                                // 保存到工具级别权限记忆（按工具类型，不是按参数）
                                toolOnlyPermissionMemory.put(tool, true);
                                debugLog("DECISION", "ALLOW_ALWAYS for " + tool + ", saved to memory");
                                break;
                            case DENY:
                            default:
                                allow = false;
                                debugLog("DECISION", "DENY for " + tool);
                                break;
                        }

                        notifyDecision(toolName, inputs, decision);
                        debugLog("WRITE_RESPONSE", String.format("Writing response for %s: allow=%s", requestId, allow));
                        writeResponse(requestId, allow);

                        debugLog("DIALOG_COMPLETE", "Frontend dialog processing complete: allow=" + allow);
                    } catch (Exception e) {
                        debugLog("DIALOG_ERROR", "Error processing dialog result: " + e.getMessage());
                        LOG.error("Error occurred", e);
                    } finally {
                        processingRequests.remove(fileName);
                    }
                }).exceptionally(ex -> {
                    debugLog("DIALOG_EXCEPTION", "Frontend dialog exception: " + ex.getMessage());
                    try {
                        writeResponse(requestId, false);
                    } catch (Exception e) {
                        LOG.error("Error occurred", e);
                    }
                    notifyDecision(toolName, inputs, PermissionResponse.DENY);
                    processingRequests.remove(fileName);
                    return null;
                });

                // 异步处理，直接返回，不阻塞
                return;
            }

            // 降级方案：使用系统弹窗（同步阻塞）
            debugLog("FALLBACK_DIALOG", "Using system dialog (JOptionPane) for: " + toolName);
            CompletableFuture<Integer> future = new CompletableFuture<>();
            ApplicationManager.getApplication().invokeLater(() -> {
                int response = showSystemPermissionDialog(toolName, inputs);
                future.complete(response);
            });

            debugLog("DIALOG_WAIT", "Waiting for system dialog response (timeout: 30s)");
            int response = future.get(30, TimeUnit.SECONDS);
            debugLog("DIALOG_RESPONSE", "Got system dialog response: " + response);

            PermissionResponse decision = PermissionResponse.fromValue(response);
            if (decision == null) {
                debugLog("RESPONSE_NULL", "Response mapped to null, defaulting to DENY");
                decision = PermissionResponse.DENY;
            }

            boolean allow;
            switch (decision) {
                case ALLOW:
                    allow = true;
                    break;
                case ALLOW_ALWAYS:
                    allow = true;
                    permissionMemory.put(memoryKey, PermissionResponse.ALLOW_ALWAYS.value);
                    debugLog("MEMORY_SAVE", "Saved param-level memory: " + memoryKey);
                    break;
                case DENY:
                default:
                    allow = false;
                    break;
            }

            notifyDecision(toolName, inputs, decision);

            // 写入响应
            debugLog("WRITE_RESPONSE", String.format("Writing response for %s: allow=%s", requestId, allow));
            writeResponse(requestId, allow);

            // 删除请求文件
            Files.delete(requestFile);
            debugLog("FILE_DELETE", "Deleted request file after processing: " + fileName);

            long elapsed = System.currentTimeMillis() - startTime;
            debugLog("REQUEST_COMPLETE", String.format("Request %s completed in %dms", requestId, elapsed));

        } catch (Exception e) {
            debugLog("HANDLE_ERROR", "Error handling request: " + e.getMessage());
            LOG.error("Error occurred", e);
        } finally {
            processingRequests.remove(fileName);
        }
    }

    /**
     * 显示系统权限对话框（JOptionPane）- 降级方案
     */
    private int showSystemPermissionDialog(String toolName, JsonObject inputs) {
        // 构建消息内容
        StringBuilder message = new StringBuilder();
        message.append("Claude requests to perform the following action:\n\n");
        message.append("Tool: ").append(toolName).append("\n");

        // Show important parameters
        if (inputs.has("file_path")) {
            message.append("File: ").append(inputs.get("file_path").getAsString()).append("\n");
        }
        if (inputs.has("command")) {
            message.append("Command: ").append(inputs.get("command").getAsString()).append("\n");
        }

        message.append("\nAllow execution?");

        // Create options
        Object[] options = {
            "Allow",
            "Deny"
        };

        // Show dialog
        int result = JOptionPane.showOptionDialog(
            null,
            message.toString(),
            "Permission Request - " + toolName,
            JOptionPane.DEFAULT_OPTION,
            JOptionPane.QUESTION_MESSAGE,
            null,
            options,
            options[0]
        );

        if (result == 0) {
            return PermissionResponse.ALLOW.getValue();
        }
        return PermissionResponse.DENY.getValue();
    }

    // Set to track ask-user-question requests being processed
    private final Set<String> processingAskUserQuestionRequests = ConcurrentHashMap.newKeySet();

    /**
     * Handle ask-user-question request
     */
    private void handleAskUserQuestionRequest(Path requestFile) {
        String fileName = requestFile.getFileName().toString();
        debugLog("HANDLE_ASK_USER_QUESTION", "Processing request file: " + fileName);

        // Prevent duplicate processing
        if (!processingAskUserQuestionRequests.add(fileName)) {
            debugLog("SKIP_DUPLICATE", "Ask-user-question request already being processed: " + fileName);
            return;
        }

        try {
            Thread.sleep(100); // Wait for file write to complete

            String content = Files.readString(requestFile);
            debugLog("FILE_READ", "Read ask-user-question content: " + content.substring(0, Math.min(200, content.length())) + "...");

            JsonObject request = gson.fromJson(content, JsonObject.class);
            String requestId = request.get("requestId").getAsString();
            JsonObject questions = request.getAsJsonArray("questions") != null
                ? request : new JsonObject();

            // Get dialog shower
            AskUserQuestionDialogShower dialogShower = getAskUserQuestionDialogShower();
            if (dialogShower == null) {
                debugLog("NO_DIALOG_SHOWER", "No AskUserQuestion dialog shower registered, cancelling");
                writeAskUserQuestionResponse(requestId, null, true);
                Files.deleteIfExists(requestFile);
                processingAskUserQuestionRequests.remove(fileName);
                return;
            }

            // Delete request file immediately to prevent duplicate processing
            try {
                Files.deleteIfExists(requestFile);
                debugLog("FILE_DELETE", "Deleted ask-user-question request file: " + fileName);
            } catch (Exception e) {
                debugLog("FILE_DELETE_ERROR", "Failed to delete request file: " + e.getMessage());
            }

            // Show dialog asynchronously
            debugLog("DIALOG_SHOW", "Calling showAskUserQuestionDialog for requestId: " + requestId);
            CompletableFuture<JsonObject> future = dialogShower.showAskUserQuestionDialog(requestId, request);

            future.thenAccept(answers -> {
                try {
                    if (answers != null) {
                        debugLog("DIALOG_RESPONSE", "Got answers for requestId: " + requestId);
                        writeAskUserQuestionResponse(requestId, answers, false);
                    } else {
                        debugLog("DIALOG_CANCELLED", "User cancelled for requestId: " + requestId);
                        writeAskUserQuestionResponse(requestId, null, true);
                    }
                } catch (Exception e) {
                    debugLog("DIALOG_ERROR", "Error writing response: " + e.getMessage());
                    LOG.error("Error occurred", e);
                } finally {
                    processingAskUserQuestionRequests.remove(fileName);
                }
            }).exceptionally(ex -> {
                debugLog("DIALOG_EXCEPTION", "Dialog exception: " + ex.getMessage());
                try {
                    writeAskUserQuestionResponse(requestId, null, true);
                } catch (Exception e) {
                    LOG.error("Error occurred", e);
                }
                processingAskUserQuestionRequests.remove(fileName);
                return null;
            });

        } catch (Exception e) {
            debugLog("HANDLE_ERROR", "Error handling ask-user-question request: " + e.getMessage());
            LOG.error("Error occurred", e);
            processingAskUserQuestionRequests.remove(fileName);
        }
    }

    /**
     * Write ask-user-question response file
     */
    private void writeAskUserQuestionResponse(String requestId, JsonObject answers, boolean cancelled) {
        debugLog("WRITE_ASK_USER_QUESTION_RESPONSE", String.format(
            "Writing response for requestId=%s, cancelled=%s", requestId, cancelled));
        try {
            JsonObject response = new JsonObject();
            response.addProperty("cancelled", cancelled);
            if (answers != null && !cancelled) {
                response.add("answers", answers);
            }

            Path responseFile = permissionDir.resolve("ask-user-question-response-" + requestId + ".json");
            String responseContent = gson.toJson(response);
            debugLog("RESPONSE_CONTENT", "Response JSON: " + responseContent);

            Files.writeString(responseFile, responseContent);

            if (Files.exists(responseFile)) {
                debugLog("WRITE_SUCCESS", "Ask-user-question response file written successfully");
            }
        } catch (IOException e) {
            debugLog("WRITE_ERROR", "Failed to write ask-user-question response file: " + e.getMessage());
            LOG.error("Error occurred", e);
        }
    }

    /**
     * Write permission response file
     */
    private void writeResponse(String requestId, boolean allow) {
        debugLog("WRITE_RESPONSE_START", String.format("Writing response for requestId=%s, allow=%s", requestId, allow));
        try {
            JsonObject response = new JsonObject();
            response.addProperty("allow", allow);

            Path responseFile = permissionDir.resolve("response-" + requestId + ".json");
            String responseContent = gson.toJson(response);
            debugLog("RESPONSE_CONTENT", "Response JSON: " + responseContent);
            debugLog("RESPONSE_FILE", "Target file: " + responseFile);

            Files.writeString(responseFile, responseContent);

            // 验证文件是否写入成功
            if (Files.exists(responseFile)) {
                long fileSize = Files.size(responseFile);
                debugLog("WRITE_SUCCESS", String.format("Response file written successfully, size=%d bytes", fileSize));
            } else {
                debugLog("WRITE_VERIFY_FAIL", "Response file does NOT exist after write!");
            }
        } catch (IOException e) {
            debugLog("WRITE_ERROR", "Failed to write response file: " + e.getMessage());
            LOG.error("Error occurred", e);
        }
    }

    /**
     * 停止权限服务
     */
    public void stop() {
        running = false;
        if (watchThread != null) {
            try {
                watchThread.join(1000);
            } catch (InterruptedException e) {
                LOG.error("Error occurred", e);
            }
        }
        if (watchService != null) {
            try {
                watchService.close();
            } catch (IOException e) {
                LOG.error("Error occurred", e);
            }
        }
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