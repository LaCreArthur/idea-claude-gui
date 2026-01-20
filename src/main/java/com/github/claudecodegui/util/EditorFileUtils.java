package com.github.claudecodegui.util;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.SelectionModel;
import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.TextEditor;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

public class EditorFileUtils {

    private static final Logger LOG = Logger.getInstance(EditorFileUtils.class);

    public static List<String> getOpenedFiles(Project project) {
        List<String> openedFiles = new ArrayList<>();

        if (project == null) {
            return openedFiles;
        }

        try {
            FileEditorManager fileEditorManager = FileEditorManager.getInstance(project);
            VirtualFile[] openFiles = fileEditorManager.getOpenFiles();

            for (VirtualFile file : openFiles) {
                if (file != null && file.getPath() != null) {
                    openedFiles.add(file.getPath());
                }
            }
        } catch (Exception e) {
            LOG.error("[EditorFileUtils] Error getting opened files: " + e.getMessage());
        }

        return openedFiles;
    }

    public static String getCurrentActiveFile(Project project) {
        if (project == null) {
            return null;
        }

        try {
            FileEditorManager fileEditorManager = FileEditorManager.getInstance(project);
            VirtualFile[] selectedFiles = fileEditorManager.getSelectedFiles();

            if (selectedFiles.length > 0 && selectedFiles[0] != null) {
                return selectedFiles[0].getPath();
            }
        } catch (Exception e) {
            LOG.error("[EditorFileUtils] Error getting active file: " + e.getMessage());
        }

        return null;
    }

    public static Map<String, Object> getSelectedCodeInfo(Project project) {
        if (project == null) {
            return null;
        }

        try {
            FileEditorManager fileEditorManager = FileEditorManager.getInstance(project);
            FileEditor selectedEditor = fileEditorManager.getSelectedEditor();

            if (selectedEditor instanceof TextEditor) {
                Editor editor = ((TextEditor) selectedEditor).getEditor();
                SelectionModel selectionModel = editor.getSelectionModel();

                if (selectionModel.hasSelection()) {
                    String selectedText = selectionModel.getSelectedText();
                    if (selectedText != null && !selectedText.trim().isEmpty()) {
                        int startOffset = selectionModel.getSelectionStart();
                        int endOffset = selectionModel.getSelectionEnd();

                        int startLine = editor.getDocument().getLineNumber(startOffset) + 1;
                        int endLine = editor.getDocument().getLineNumber(endOffset) + 1;

                        Map<String, Object> selectionInfo = new HashMap<>();
                        selectionInfo.put("startLine", startLine);
                        selectionInfo.put("endLine", endLine);
                        selectionInfo.put("selectedText", selectedText);

                        LOG.info("[EditorFileUtils] Selection detected: lines " + startLine + "-" + endLine);
                        return selectionInfo;
                    }
                }
            }
        } catch (Exception e) {
            LOG.error("[EditorFileUtils] Error getting selected code: " + e.getMessage());
        }

        return null;
    }

    public static void refreshAndFindFileAsync(File file, Consumer<VirtualFile> onSuccess, Runnable onFailure) {
        try {
            final String canonicalPath = file.getCanonicalPath();

            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file);

                    ReadAction
                            .nonBlocking(() -> {
                                VirtualFile vf = LocalFileSystem.getInstance().findFileByPath(canonicalPath);
                                if (vf == null) {
                                    vf = LocalFileSystem.getInstance().findFileByIoFile(file);
                                }
                                return vf;
                            })
                            .finishOnUiThread(ModalityState.nonModal(), virtualFile -> {
                                if (virtualFile == null) {
                                    LOG.warn("Could not find virtual file: " + file.getAbsolutePath() + ", retrying with sync refresh...");
                                    VirtualFile retryVf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file);
                                    if (retryVf != null) {
                                        onSuccess.accept(retryVf);
                                    } else {
                                        LOG.error("Failed to find virtual file after retry: " + file.getAbsolutePath());
                                        if (onFailure != null) {
                                            onFailure.run();
                                        }
                                    }
                                    return;
                                }

                                onSuccess.accept(virtualFile);
                            })
                            .submit(AppExecutorUtil.getAppExecutorService());
                } catch (Exception e) {
                    LOG.error("Failed to refresh file system: " + file.getAbsolutePath(), e);
                    if (onFailure != null) {
                        onFailure.run();
                    }
                }
            }, ModalityState.nonModal());

        } catch (Exception e) {
            LOG.error("Failed to get canonical path: " + file.getAbsolutePath(), e);
            if (onFailure != null) {
                ApplicationManager.getApplication().invokeLater(onFailure, ModalityState.nonModal());
            }
        }
    }

    public static VirtualFile refreshAndFindFileSync(File file) {
        try {
            String canonicalPath = file.getCanonicalPath();
            VirtualFile vf = LocalFileSystem.getInstance().refreshAndFindFileByPath(canonicalPath);
            if (vf == null) {
                vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file);
            }
            return vf;
        } catch (Exception e) {
            LOG.error("Failed to refresh and find file: " + file.getAbsolutePath(), e);
            return null;
        }
    }
}
