package com.github.claudecodegui.handler;

import com.github.claudecodegui.model.FileSortItem;
import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.impl.EditorHistoryManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class FileHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(FileHandler.class);

    private static final String[] SUPPORTED_TYPES = {"list_files", "get_commands", "open_file", "open_browser"};

    // File listing limits
    private static final int MAX_RECENT_FILES = 50;
    private static final int MAX_SEARCH_RESULTS = 200;
    private static final int MAX_SEARCH_DEPTH = 15;
    private static final int MAX_DIRECTORY_CHILDREN = 100;

    public FileHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "list_files":
                handleListFiles(content);
                return true;
            case "get_commands":
                handleGetCommands(content);
                return true;
            case "open_file":
                handleOpenFile(content);
                return true;
            case "open_browser":
                handleOpenBrowser(content);
                return true;
            default:
                return false;
        }
    }

    private void handleListFiles(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                FileListRequest request = parseRequest(content);
                String basePath = getEffectiveBasePath();
                FileSet fileSet = new FileSet();
                List<JsonObject> files = new ArrayList<>();

                // Priority 1: Currently open files
                collectOpenFiles(files, fileSet, basePath, request);

                // Priority 2: Recently opened files
                collectRecentFiles(files, fileSet, basePath, request);

                // Priority 3: File system scan
                collectFileSystemFiles(files, fileSet, basePath, request);

                sortFiles(files);
                sendResult(files);
            } catch (Exception e) {
                LOG.error("[FileHandler] Failed to list files: " + e.getMessage(), e);
            }
        });
    }

    private void sendResult(List<JsonObject> files) {
        Gson gson = new Gson();
        JsonObject result = new JsonObject();
        result.add("files", gson.toJsonTree(files));
        String resultJson = gson.toJson(result);

        ApplicationManager.getApplication().invokeLater(() -> {
            callJavaScript("window.onFileListResult", escapeJs(resultJson));
        });
    }

    /**
     * Collect currently open files in the editor
     */
    private void collectOpenFiles(List<JsonObject> files, FileSet fileSet, String basePath, FileListRequest request) {
        ApplicationManager.getApplication().runReadAction(() -> {
            Project project = context.getProject();
            if (project == null || project.isDisposed()) {
                LOG.debug("[FileHandler] Project is null or disposed in collectOpenFiles");
                return;
            }

            try {
                // Double-check project state inside read action
                if (project.isDisposed()) {
                    LOG.debug("[FileHandler] Project disposed during collectOpenFiles");
                    return;
                }

                VirtualFile[] openFiles = FileEditorManager.getInstance(project).getOpenFiles();
                LOG.debug("[FileHandler] Collecting " + openFiles.length + " open files");

                for (VirtualFile vf : openFiles) {
                    addVirtualFile(vf, basePath, files, fileSet, request, 1);
                }
            } catch (Exception e) {
                LOG.warn("[FileHandler] Error collecting open files: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Collect recently opened files from editor history
     */
    private void collectRecentFiles(List<JsonObject> files, FileSet fileSet, String basePath, FileListRequest request) {
        ApplicationManager.getApplication().runReadAction(() -> {
            Project project = context.getProject();
            if (project == null || project.isDisposed()) {
                return;
            }

            try {
                List<VirtualFile> recentFiles = EditorHistoryManager.getInstance(project).getFileList();
                if (recentFiles == null) {
                    return;
                }

                // Reverse iterate to get most recent files first
                int count = 0;
                for (int i = recentFiles.size() - 1; i >= 0; i--) {
                    if (count >= MAX_RECENT_FILES) {
                        break;
                    }
                    VirtualFile vf = recentFiles.get(i);
                    if (vf != null) {
                        addVirtualFile(vf, basePath, files, fileSet, request, 2);
                        count++;
                    }
                }
            } catch (Throwable t) {
                LOG.warn("[FileHandler] Failed to get recent files: " + t.getMessage(), t);
            }
        });
    }

    /**
     * Collect files from file system (disk scan)
     */
    private void collectFileSystemFiles(List<JsonObject> files, FileSet fileSet, String basePath, FileListRequest request) {
        List<JsonObject> diskFiles = new ArrayList<>();

        if (request.hasQuery) {
            File baseDir = new File(basePath);
            collectFilesRecursive(baseDir, basePath, diskFiles, request, 0);
        } else {
            File targetDir = new File(basePath, request.currentPath);
            if (targetDir.exists() && targetDir.isDirectory()) {
                listDirectChildren(targetDir, basePath, diskFiles);
            }
        }

        // Merge disk scan results
        for (JsonObject fileObj : diskFiles) {
            String absPath = fileObj.get("absolutePath").getAsString();
            if (fileSet.tryAdd(absPath)) {
                fileObj.addProperty("priority", 3);
                files.add(fileObj);
            }
        }
    }

    /**
     * Parse file list request from JSON content
     */
    private FileListRequest parseRequest(String content) {
        if (content == null || content.isEmpty()) {
            return new FileListRequest("", "");
        }

        try {
            JsonObject json = new Gson().fromJson(content, JsonObject.class);
            String query = json.has("query") ? json.get("query").getAsString() : "";
            String currentPath = json.has("currentPath") ? json.get("currentPath").getAsString() : "";
            return new FileListRequest(query, currentPath);
        } catch (Exception e) {
            // If not JSON, treat as plain text query
            return new FileListRequest(content.trim(), "");
        }
    }

    /**
     * Get effective base path with proper fallback chain.
     * Returns session cwd > project path > user home > current dir
     */
    private String getEffectiveBasePath() {
        if (context.getSession() != null) {
            String cwd = context.getSession().getCwd();
            if (cwd != null && !cwd.isEmpty()) {
                LOG.debug("[FileHandler] Using session cwd as base path: " + cwd);
                return cwd;
            }
        }

        if (context.getProject() != null) {
            String projectPath = context.getProject().getBasePath();
            if (projectPath != null) {
                LOG.debug("[FileHandler] Using project base path: " + projectPath);
                return projectPath;
            }
        }

        String userHome = System.getProperty("user.home");
        if (userHome != null && !userHome.isEmpty()) {
            LOG.debug("[FileHandler] Using user.home as base path: " + userHome);
            return userHome;
        }

        // Final fallback - should never happen but prevents null
        LOG.warn("[FileHandler] All base path sources failed, using current directory");
        return System.getProperty("user.dir", ".");
    }

    /**
     * Sort files by priority: open files > recent files > disk files
     */
    private void sortFiles(List<JsonObject> files) {
        if (files.isEmpty()) return;

        // Wrap in SortItem for efficient sorting
        List<FileSortItem> items = new ArrayList<>(files.size());
        for (JsonObject json : files) {
            items.add(new FileSortItem(json));
        }

        items.sort((a, b) -> {
            // Priority 1 & 2: maintain original order (stability)
            if (a.priority < 3 && b.priority < 3) {
                return 0;
            }

            // Lower priority number = higher priority
            if (a.priority != b.priority) {
                return a.priority - b.priority;
            }

            // Priority 3+: sort by depth -> parent -> type -> name
            int depthDiff = a.getDepth() - b.getDepth();
            if (depthDiff != 0) return depthDiff;

            int parentDiff = a.getParentPath().compareToIgnoreCase(b.getParentPath());
            if (parentDiff != 0) return parentDiff;

            if (a.isDir != b.isDir) {
                return a.isDir ? -1 : 1;
            }

            return a.name.compareToIgnoreCase(b.name);
        });

        // Write back to original list
        files.clear();
        for (FileSortItem item : items) {
            files.add(item.json);
        }
    }

    /**
     * Handle slash command list request from SDK
     */
    private void handleGetCommands(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                String query = "";
                if (content != null && !content.isEmpty()) {
                    try {
                        Gson gson = new Gson();
                        JsonObject json = gson.fromJson(content, JsonObject.class);
                        if (json.has("query")) {
                            query = json.get("query").getAsString();
                        }
                    } catch (Exception e) {
                        query = content;
                    }
                }

                String cwd = getEffectiveBasePath();
                final String finalQuery = query;

                context.getClaudeSDKBridge().getSlashCommands(cwd).thenAccept(sdkCommands -> {
                    try {
                        Gson gson = new Gson();
                        List<JsonObject> commands = new ArrayList<>();

                        // Convert SDK command format
                        for (JsonObject cmd : sdkCommands) {
                            String name = cmd.has("name") ? cmd.get("name").getAsString() : "";
                            String description = cmd.has("description") ? cmd.get("description").getAsString() : "";

                            // Ensure command starts with /
                            String label = name.startsWith("/") ? name : "/" + name;

                            // Apply query filter
                            if (finalQuery.isEmpty() || label.toLowerCase().contains(finalQuery.toLowerCase()) || description.toLowerCase().contains(finalQuery.toLowerCase())) {
                                JsonObject cmdObj = new JsonObject();
                                cmdObj.addProperty("label", label);
                                cmdObj.addProperty("description", description);
                                commands.add(cmdObj);
                            }
                        }

                        // Always ensure essential commands are included
                        addEssentialCommands(commands, finalQuery);

                        // If SDK returned no commands, use fallback
                        if (commands.isEmpty() && sdkCommands.isEmpty()) {
                            addFallbackCommands(commands, finalQuery);
                        }

                        JsonObject result = new JsonObject();
                        result.add("commands", gson.toJsonTree(commands));
                        String resultJson = gson.toJson(result);

                        ApplicationManager.getApplication().invokeLater(() -> {
                            String js = "if (window.onCommandListResult) { window.onCommandListResult('" + escapeJs(resultJson) + "'); }";
                            context.executeJavaScriptOnEDT(js);
                        });
                    } catch (Exception e) {
                        LOG.error("[FileHandler] Failed to process SDK commands: " + e.getMessage(), e);
                    }
                }).exceptionally(ex -> {
                    LOG.error("[FileHandler] Failed to get commands from SDK: " + ex.getMessage());
                    // On error, use fallback commands
                    try {
                        Gson gson = new Gson();
                        List<JsonObject> commands = new ArrayList<>();
                        addFallbackCommands(commands, finalQuery);

                        JsonObject result = new JsonObject();
                        result.add("commands", gson.toJsonTree(commands));
                        String resultJson = gson.toJson(result);

                        ApplicationManager.getApplication().invokeLater(() -> {
                            String js = "if (window.onCommandListResult) { window.onCommandListResult('" + escapeJs(resultJson) + "'); }";
                            context.executeJavaScriptOnEDT(js);
                        });
                    } catch (Exception e) {
                        LOG.error("[FileHandler] Failed to send fallback commands: " + e.getMessage(), e);
                    }
                    return null;
                });
            } catch (Exception e) {
                LOG.error("[FileHandler] Failed to get commands: " + e.getMessage(), e);
            }
        });
    }

    private void addFallbackCommands(List<JsonObject> commands, String query) {
        addCommand(commands, "/help", "Show help information", query);
        addCommand(commands, "/clear", "Clear chat history", query);
        addCommand(commands, "/resume", "Resume a previous conversation", query);
        addCommand(commands, "/history", "View history", query);
        addCommand(commands, "/model", "Switch model", query);
        addCommand(commands, "/compact", "Compact conversation context", query);
        addCommand(commands, "/init", "Initialize project configuration", query);
        addCommand(commands, "/review", "Code review", query);
    }

    /**
     * Add essential commands that may be missing from SDK response.
     * These are core Claude Code commands that should always be available.
     */
    private void addEssentialCommands(List<JsonObject> commands, String query) {
        // Collect existing command labels for deduplication
        java.util.Set<String> existingLabels = new java.util.HashSet<>();
        for (JsonObject cmd : commands) {
            if (cmd.has("label")) {
                existingLabels.add(cmd.get("label").getAsString().toLowerCase());
            }
        }

        // Essential commands that should always be available
        addCommandIfMissing(commands, existingLabels, "/resume", "Resume a previous conversation", query);
        addCommandIfMissing(commands, existingLabels, "/clear", "Clear chat history", query);
    }

    private void addCommandIfMissing(List<JsonObject> commands, java.util.Set<String> existingLabels,
                                     String label, String description, String query) {
        if (!existingLabels.contains(label.toLowerCase())) {
            if (query.isEmpty() || label.toLowerCase().contains(query.toLowerCase()) ||
                description.toLowerCase().contains(query.toLowerCase())) {
                JsonObject cmd = new JsonObject();
                cmd.addProperty("label", label);
                cmd.addProperty("description", description);
                commands.add(cmd);
                LOG.info("[FileHandler] Added missing essential command: " + label);
            }
        }
    }

    /**
     * Open file in editor.
     * Supports line number format: file.txt:100 or file.txt:100-200
     */
    private void handleOpenFile(String filePath) {
        CompletableFuture.runAsync(() -> {
            try {
                // Parse file path and line number
                final String[] parsedPath = {filePath};
                final int[] parsedLineNumber = {-1};

                // Extract line number (format: file.txt:100 or file.txt:100-200)
                int colonIndex = filePath.lastIndexOf(':');
                if (colonIndex > 0) {
                    String afterColon = filePath.substring(colonIndex + 1);
                    if (afterColon.matches("\\d+(-\\d+)?")) {
                        parsedPath[0] = filePath.substring(0, colonIndex);
                        int dashIndex = afterColon.indexOf('-');
                        String lineStr = dashIndex > 0 ? afterColon.substring(0, dashIndex) : afterColon;
                        try {
                            parsedLineNumber[0] = Integer.parseInt(lineStr);
                        } catch (NumberFormatException e) {
                            LOG.warn("Failed to parse line number: " + lineStr);
                        }
                    }
                }

                final String actualPath = parsedPath[0];
                final int lineNumber = parsedLineNumber[0];

                File file = new File(actualPath);

                // If file doesn't exist and is relative, try resolving from project root
                if (!file.exists() && !file.isAbsolute() && context.getProject().getBasePath() != null) {
                    File projectFile = new File(context.getProject().getBasePath(), actualPath);
                    if (projectFile.exists()) {
                        file = projectFile;
                    }
                }

                if (!file.exists()) {
                    LOG.error("File does not exist: " + actualPath);
                    ApplicationManager.getApplication().invokeLater(() -> {
                        callJavaScript("addErrorMessage", escapeJs("Cannot open file: file does not exist (" + actualPath + ")"));
                    }, ModalityState.nonModal());
                    return;
                }

                final File finalFile = file;

                EditorFileUtils.refreshAndFindFileAsync(finalFile, virtualFile -> {
                    FileEditorManager.getInstance(context.getProject()).openFile(virtualFile, true);

                    // If line number specified, jump to that line
                    if (lineNumber > 0) {
                        ApplicationManager.getApplication().invokeLater(() -> {
                            com.intellij.openapi.editor.Editor editor = FileEditorManager.getInstance(context.getProject()).getSelectedTextEditor();
                            if (editor != null && editor.getDocument().getTextLength() > 0) {
                                int zeroBasedLine = Math.max(0, lineNumber - 1);
                                int lineCount = editor.getDocument().getLineCount();
                                if (zeroBasedLine < lineCount) {
                                    int offset = editor.getDocument().getLineStartOffset(zeroBasedLine);
                                    editor.getCaretModel().moveToOffset(offset);
                                    editor.getScrollingModel().scrollToCaret(com.intellij.openapi.editor.ScrollType.CENTER);
                                }
                            }
                        }, ModalityState.nonModal());
                    }
                }, () -> {
                    LOG.error("Failed to get VirtualFile: " + filePath);
                    callJavaScript("addErrorMessage", escapeJs("Cannot open file: " + filePath));
                });
            } catch (Exception e) {
                LOG.error("Failed to open file: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Open URL in browser
     */
    private void handleOpenBrowser(String url) {
        ApplicationManager.getApplication().invokeLater(() -> {
            try {
                BrowserUtil.browse(url);
            } catch (Exception e) {
                LOG.error("Failed to open browser: " + e.getMessage(), e);
            }
        });
    }

    /**
     * List direct children of a directory (non-recursive)
     */
    private void listDirectChildren(File dir, String basePath, List<JsonObject> files) {
        if (!dir.isDirectory()) return;

        File[] children = dir.listFiles();
        if (children == null) return;

        int added = 0;
        for (File child : children) {
            if (added >= MAX_DIRECTORY_CHILDREN) break;

            String name = child.getName();
            boolean isDir = child.isDirectory();

            if (shouldSkipInSearch(name, isDir)) {
                continue;
            }

            String relativePath = getRelativePath(child, basePath);
            JsonObject fileObj = createFileObject(child, name, relativePath);
            files.add(fileObj);
            added++;
        }
    }

    /**
     * Recursively collect files matching query
     */
    private void collectFilesRecursive(File dir, String basePath, List<JsonObject> files, FileListRequest request, int depth) {
        if (depth > MAX_SEARCH_DEPTH || files.size() >= MAX_SEARCH_RESULTS) return;
        if (!dir.isDirectory()) return;

        File[] children = dir.listFiles();

        if (children == null) return;

        for (File child : children) {
            if (files.size() >= MAX_SEARCH_RESULTS) break;

            String name = child.getName();
            boolean isDir = child.isDirectory();

            if (shouldSkipInSearch(name, isDir)) {
                continue;
            }

            String relativePath = getRelativePath(child, basePath);

            // Check if matches query
            boolean matches = !request.hasQuery || request.matches(name, relativePath);

            if (matches) {
                JsonObject fileObj = createFileObject(child, name, relativePath);
                files.add(fileObj);
            }

            // Always recurse into directories (child files may match even if directory doesn't)
            if (isDir) {
                collectFilesRecursive(child, basePath, files, request, depth + 1);
            }
        }
    }

    /**
     * Check if file/directory should be skipped during search
     */
    private boolean shouldSkipInSearch(String name, boolean isDirectory) {
        // Skip version control directories
        if (name.equals(".git") || name.equals(".svn") || name.equals(".hg")) {
            return true;
        }
        // Skip dependency/cache directories
        if (name.equals("node_modules") || name.equals("__pycache__")) {
            return true;
        }
        // Skip build output directories
        if (isDirectory) {
            return (name.equals("target") || name.equals("build") || name.equals("dist") || name.equals("out"));
        }
        // Skip system/IDE files
        return name.equals(".DS_Store") || name.equals(".idea");
    }

    private String getRelativePath(File file, String basePath) {
        String relativePath = file.getAbsolutePath().substring(basePath.length());
        if (relativePath.startsWith(File.separator)) {
            relativePath = relativePath.substring(1);
        }
        return relativePath.replace("\\", "/");
    }

    /**
     * Create JSON file object from File
     */
    private JsonObject createFileObject(File file, String name, String relativePath) {
        JsonObject fileObj = new JsonObject();
        fileObj.addProperty("name", name);
        fileObj.addProperty("path", relativePath);
        fileObj.addProperty("absolutePath", file.getAbsolutePath().replace("\\", "/"));
        fileObj.addProperty("type", file.isDirectory() ? "directory" : "file");

        if (file.isFile()) {
            int dotIndex = name.lastIndexOf('.');
            if (dotIndex > 0) {
                fileObj.addProperty("extension", name.substring(dotIndex + 1));
            }
        }
        return fileObj;
    }

    /**
     * Create JSON file object from VirtualFile (avoids physical I/O)
     */
    private JsonObject createFileObject(VirtualFile file, String relativePath) {
        JsonObject fileObj = new JsonObject();
        String name = file.getName();
        fileObj.addProperty("name", name);
        fileObj.addProperty("path", relativePath);
        fileObj.addProperty("absolutePath", file.getPath()); // VirtualFile path uses /
        fileObj.addProperty("type", file.isDirectory() ? "directory" : "file");

        if (!file.isDirectory()) {
            String extension = file.getExtension();
            if (extension != null) {
                fileObj.addProperty("extension", extension);
            }
        }
        return fileObj;
    }

    /**
     * Add command to list if it matches query
     */
    private void addCommand(List<JsonObject> commands, String label, String description, String query) {
        if (query.isEmpty() || label.toLowerCase().contains(query.toLowerCase()) || description.toLowerCase().contains(query.toLowerCase())) {
            JsonObject cmd = new JsonObject();
            cmd.addProperty("label", label);
            cmd.addProperty("description", description);
            commands.add(cmd);
        }
    }

    /**
     * Add VirtualFile to result list with deduplication
     */
    private void addVirtualFile(VirtualFile vf, String basePath, List<JsonObject> files, FileSet fileSet, FileListRequest request, int priority) {
        if (vf == null || !vf.isValid() || vf.isDirectory()) return;
        if (basePath == null) return;

        String name = vf.getName();
        if (shouldSkipInSearch(name, false)) return;

        String path = vf.getPath();
        if (path == null || !fileSet.tryAdd(path)) return;

        // Calculate relative path
        String relativePath = path;
        if (path.startsWith(basePath)) {
            relativePath = path.substring(basePath.length());
            if (relativePath.startsWith("/")) {
                relativePath = relativePath.substring(1);
            }
        }

        if (request.matches(name, relativePath)) {
            JsonObject obj = createFileObject(vf, relativePath);
            obj.addProperty("priority", priority);
            files.add(obj);
        }
    }

    // --- Helper Classes ---

    /**
     * File list request with query and path
     */
    private static class FileListRequest {
        final String query;
        final String queryLower;
        final String currentPath;
        final boolean hasQuery;

        FileListRequest(String query, String currentPath) {
            this.query = query != null ? query : "";
            this.queryLower = this.query.toLowerCase();
            this.currentPath = currentPath != null ? currentPath : "";
            this.hasQuery = !this.query.isEmpty();
        }

        boolean matches(String name, String relativePath) {
            if (!hasQuery) return true;
            return name.toLowerCase().contains(queryLower) || relativePath.toLowerCase().contains(queryLower);
        }
    }

    /**
     * File set with path normalization and deduplication
     */
    private static class FileSet {
        private final HashSet<String> paths = new HashSet<>();

        boolean tryAdd(String path) {
            return paths.add(path == null ? "" : path.replace('\\', '/'));
        }
    }
}
