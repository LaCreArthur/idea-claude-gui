package com.github.claudecodegui.handler;

import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.diff.DiffContentFactory;
import com.intellij.diff.DiffManager;
import com.intellij.diff.contents.DiffContent;
import com.intellij.diff.requests.SimpleDiffRequest;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileTypes.FileType;
import com.intellij.openapi.fileTypes.FileTypeManager;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public class DiffHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(DiffHandler.class);
    private final Gson gson = new Gson();

    private static final String[] SUPPORTED_TYPES = {
        "refresh_file",
        "show_diff",
        "show_multi_edit_diff"
    };

    public DiffHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        switch (type) {
            case "refresh_file":
                handleRefreshFile(content);
                return true;
            case "show_diff":
                handleShowDiff(content);
                return true;
            case "show_multi_edit_diff":
                handleShowMultiEditDiff(content);
                return true;
            default:
                return false;
        }
    }

    private void handleRefreshFile(String content) {
        try {
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String filePath = json.has("filePath") ? json.get("filePath").getAsString() : null;

            if (filePath == null || filePath.isEmpty()) {
                LOG.warn("refresh_file: filePath is empty");
                return;
            }

            LOG.info("Refreshing file: " + filePath);

            CompletableFuture.runAsync(() -> {
                try {
                    File file = new File(filePath);

                    try {
                        TimeUnit.MILLISECONDS.sleep(300);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }

                    if (!file.exists() && !file.isAbsolute() && context.getProject().getBasePath() != null) {
                        File projectFile = new File(context.getProject().getBasePath(), filePath);
                        if (projectFile.exists()) {
                            file = projectFile;
                        }
                    }

                    if (!file.exists()) {
                        LOG.warn("File does not exist: " + filePath);
                        return;
                    }

                    final File finalFile = file;

                    EditorFileUtils.refreshAndFindFileAsync(
                            finalFile,
                            virtualFile -> performFileRefresh(virtualFile, filePath),
                            () -> LOG.error("Failed to refresh file: " + filePath)
                    );

                } catch (Exception e) {
                    LOG.error("Failed to refresh file: " + filePath, e);
                }
            });
        } catch (Exception e) {
            LOG.error("Failed to parse refresh_file request: " + e.getMessage(), e);
        }
    }

    private void performFileRefresh(VirtualFile virtualFile, String filePath) {
        try {
            virtualFile.refresh(false, false);
            LOG.info("File refreshed successfully: " + filePath);
        } catch (Exception e) {
            LOG.error("Failed to perform file refresh: " + filePath, e);
        }
    }

    private void handleShowDiff(String content) {
        try {
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String filePath = json.has("filePath") ? json.get("filePath").getAsString() : "";
            String oldContent = json.has("oldContent") ? json.get("oldContent").getAsString() : "";
            String newContent = json.has("newContent") ? json.get("newContent").getAsString() : "";
            String title = json.has("title") ? json.get("title").getAsString() : null;

            LOG.info("Showing diff for file: " + filePath);

            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    String fileName = new File(filePath).getName();
                    FileType fileType = FileTypeManager.getInstance().getFileTypeByFileName(fileName);

                    DiffContent leftContent = DiffContentFactory.getInstance()
                        .create(context.getProject(), oldContent, fileType);
                    DiffContent rightContent = DiffContentFactory.getInstance()
                        .create(context.getProject(), newContent, fileType);

                    String diffTitle = title != null ? title : "File Changes: " + fileName;
                    SimpleDiffRequest diffRequest = new SimpleDiffRequest(
                        diffTitle,
                        leftContent,
                        rightContent,
                        fileName + " (Before)",
                        fileName + " (After)"
                    );

                    DiffManager.getInstance().showDiff(context.getProject(), diffRequest);

                    LOG.info("Diff view opened for: " + filePath);
                } catch (Exception e) {
                    LOG.error("Failed to show diff: " + e.getMessage(), e);
                }
            });
        } catch (Exception e) {
            LOG.error("Failed to parse show_diff request: " + e.getMessage(), e);
        }
    }

    private void handleShowMultiEditDiff(String content) {
        try {
            JsonObject json = gson.fromJson(content, JsonObject.class);
            String filePath = json.has("filePath") ? json.get("filePath").getAsString() : "";
            JsonArray edits = json.has("edits") ? json.getAsJsonArray("edits") : new JsonArray();
            String currentContent = json.has("currentContent") ? json.get("currentContent").getAsString() : null;

            LOG.info("Showing multi-edit diff for file: " + filePath + " with " + edits.size() + " edits");

            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    String afterContent = currentContent;
                    if (afterContent == null) {
                        File file = new File(filePath);
                        if (file.exists()) {
                            VirtualFile virtualFile = EditorFileUtils.refreshAndFindFileSync(file);
                            if (virtualFile != null) {
                                virtualFile.refresh(false, false);
                                afterContent = new String(virtualFile.contentsToByteArray(), StandardCharsets.UTF_8);
                            }
                        }
                    }

                    if (afterContent == null) {
                        LOG.warn("Could not read file content: " + filePath);
                        return;
                    }

                    String beforeContent = rebuildBeforeContent(afterContent, edits);

                    String fileName = new File(filePath).getName();
                    FileType fileType = FileTypeManager.getInstance().getFileTypeByFileName(fileName);

                    DiffContent leftContent = DiffContentFactory.getInstance()
                        .create(context.getProject(), beforeContent, fileType);
                    DiffContent rightContent = DiffContentFactory.getInstance()
                        .create(context.getProject(), afterContent, fileType);

                    String diffTitle = "File Changes: " + fileName + " (" + edits.size() + " edits)";
                    SimpleDiffRequest diffRequest = new SimpleDiffRequest(
                        diffTitle,
                        leftContent,
                        rightContent,
                        fileName + " (Before)",
                        fileName + " (After)"
                    );

                    DiffManager.getInstance().showDiff(context.getProject(), diffRequest);

                    LOG.info("Multi-edit diff view opened for: " + filePath);
                } catch (Exception e) {
                    LOG.error("Failed to show multi-edit diff: " + e.getMessage(), e);
                }
            });
        } catch (Exception e) {
            LOG.error("Failed to parse show_multi_edit_diff request: " + e.getMessage(), e);
        }
    }

    private String rebuildBeforeContent(String afterContent, JsonArray edits) {
        String content = afterContent;

        for (int i = edits.size() - 1; i >= 0; i--) {
            JsonObject edit = edits.get(i).getAsJsonObject();
            String oldString = edit.has("oldString") ? edit.get("oldString").getAsString() : "";
            String newString = edit.has("newString") ? edit.get("newString").getAsString() : "";
            boolean replaceAll = edit.has("replaceAll") && edit.get("replaceAll").getAsBoolean();

            if (replaceAll) {
                content = content.replace(newString, oldString);
            } else {
                int index = content.indexOf(newString);
                if (index >= 0) {
                    content = content.substring(0, index) + oldString + content.substring(index + newString.length());
                }
            }
        }

        return content;
    }
}
