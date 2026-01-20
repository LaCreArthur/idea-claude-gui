package com.github.claudecodegui.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;

public class FileExportHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(FileExportHandler.class);

    private static final String[] SUPPORTED_TYPES = {
        "save_markdown",
        "save_json"
    };

    private final Gson gson = new Gson();

    public FileExportHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if ("save_markdown".equals(type)) {
            LOG.info("[FileExportHandler] Processing: save_markdown");
            handleSaveFile(content, ".md", "Save Markdown File");
            return true;
        } else if ("save_json".equals(type)) {
            LOG.info("[FileExportHandler] Processing: save_json");
            handleSaveFile(content, ".json", "Save JSON File");
            return true;
        }
        return false;
    }

    private void handleSaveFile(String jsonContent, String fileExtension, String dialogTitle) {
        try {
            LOG.info("[FileExportHandler] Starting file save");
            LOG.info("[FileExportHandler] File type: " + fileExtension);

            JsonObject json = gson.fromJson(jsonContent, JsonObject.class);
            String content = json.get("content").getAsString();
            String filename = json.get("filename").getAsString();

            LOG.info("[FileExportHandler] Filename: " + filename);

            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    String projectPath = context.getProject().getBasePath();

                    FileDialog fileDialog = new FileDialog((Frame) null, dialogTitle, FileDialog.SAVE);

                    if (projectPath != null) {
                        fileDialog.setDirectory(projectPath);
                    }

                    fileDialog.setFile(filename);
                    fileDialog.setFilenameFilter((dir, name) -> name.toLowerCase().endsWith(fileExtension));
                    fileDialog.setVisible(true);

                    String selectedDir = fileDialog.getDirectory();
                    String selectedFile = fileDialog.getFile();

                    if (selectedDir != null && selectedFile != null) {
                        File fileToSave = new File(selectedDir, selectedFile);

                        String path = fileToSave.getAbsolutePath();
                        if (!path.toLowerCase().endsWith(fileExtension)) {
                            fileToSave = new File(path + fileExtension);
                        }

                        File finalFileToSave = fileToSave;
                        CompletableFuture.runAsync(() -> {
                            try (FileWriter writer = new FileWriter(finalFileToSave)) {
                                writer.write(content);
                                LOG.info("[FileExportHandler] File saved successfully: " + finalFileToSave.getAbsolutePath());

                                ApplicationManager.getApplication().invokeLater(() -> {
                                    String successMsg = escapeJs("File saved");
                                    String jsCode = "if (window.addToast) { " +
                                        "  window.addToast('" + successMsg + "', 'success'); " +
                                        "}";
                                    context.executeJavaScriptOnEDT(jsCode);
                                });

                            } catch (IOException e) {
                                LOG.error("[FileExportHandler] Failed to save file: " + e.getMessage(), e);

                                ApplicationManager.getApplication().invokeLater(() -> {
                                    String errorDetail = e.getMessage() != null ? e.getMessage() : "Save failed";
                                    String errorMsg = escapeJs("Save failed: " + errorDetail);
                                    String jsCode = "if (window.addToast) { " +
                                        "  window.addToast('" + errorMsg + "', 'error'); " +
                                        "}";
                                    context.executeJavaScriptOnEDT(jsCode);
                                });
                            }
                        });
                    } else {
                        LOG.info("[FileExportHandler] User cancelled save");
                    }
                } catch (Exception e) {
                    LOG.error("[FileExportHandler] Failed to show dialog: " + e.getMessage(), e);

                    String errorDetail = e.getMessage() != null ? e.getMessage() : "Failed to show dialog";
                    String errorMsg = escapeJs("Save failed: " + errorDetail);
                    String jsCode = "if (window.addToast) { " +
                        "  window.addToast('" + errorMsg + "', 'error'); " +
                        "}";
                    context.executeJavaScriptOnEDT(jsCode);
                }

                LOG.info("[FileExportHandler] File save completed");
            });

        } catch (Exception e) {
            LOG.error("[FileExportHandler] Failed to process save request: " + e.getMessage(), e);

            ApplicationManager.getApplication().invokeLater(() -> {
                String errorDetail = e.getMessage() != null ? e.getMessage() : "Unknown error";
                String errorMsg = escapeJs("Save failed: " + errorDetail);
                String jsCode = "if (window.addToast) { " +
                    "  window.addToast('" + errorMsg + "', 'error'); " +
                    "}";
                context.executeJavaScriptOnEDT(jsCode);
            });
        }
    }
}
