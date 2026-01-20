package com.github.claudecodegui;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.SelectionModel;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.util.concurrency.AppExecutorUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.io.File;

public class SendSelectionToTerminalAction extends AnAction implements DumbAware {

    private static final Logger LOG = Logger.getInstance(SendSelectionToTerminalAction.class);

    public SendSelectionToTerminalAction() {
        super(
            "Send Selected Code to GUI Plugin",
            "Send current selected code and path to terminal window",
            null
        );
    }

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        Project project = e.getProject();
        if (project == null) {
            return;
        }

        try {
            ReadAction
                .nonBlocking(() -> {
                    return getSelectionInfo(e);
                })
                .finishOnUiThread(com.intellij.openapi.application.ModalityState.defaultModalityState(), selectionInfo -> {
                    if (selectionInfo == null) {
                        return;
                    }

                    sendToChatWindow(project, selectionInfo);
                    LOG.info("Added to pending send: " + selectionInfo);
                })
                .submit(AppExecutorUtil.getAppExecutorService());

        } catch (Exception ex) {
            showError(project, "Send failed: " + ex.getMessage());
            LOG.error("Error: " + ex.getMessage(), ex);
        }
    }

    @Override
    public void update(@NotNull AnActionEvent e) {
        Project project = e.getProject();
        if (project == null) {
            e.getPresentation().setEnabledAndVisible(false);
            return;
        }

        Editor editor = e.getData(CommonDataKeys.EDITOR);
        if (editor == null) {
            e.getPresentation().setEnabledAndVisible(false);
            return;
        }

        SelectionModel selectionModel = editor.getSelectionModel();
        String selectedText = selectionModel.getSelectedText();

        e.getPresentation().setEnabledAndVisible(selectedText != null && !selectedText.isEmpty());
    }

    private @Nullable String getSelectionInfo(@NotNull AnActionEvent e) {
        Project project = e.getProject();
        Editor editor = e.getData(CommonDataKeys.EDITOR);

        if (project == null || editor == null) {
            showError(project, "Unable to get editor information");
            return null;
        }

        SelectionModel selectionModel = editor.getSelectionModel();
        String selectedText = selectionModel.getSelectedText();

        if (selectedText == null || selectedText.trim().isEmpty()) {
            showInfo(project, "Please select code to send first");
            return null;
        }

        VirtualFile[] selectedFiles = FileEditorManager.getInstance(project).getSelectedFiles();
        if (selectedFiles.length == 0) {
            showError(project, "Unable to get current file");
            return null;
        }
        VirtualFile virtualFile = selectedFiles[0];

        String relativePath = getRelativePath(project, virtualFile);
        if (relativePath == null) {
            showError(project, "Unable to determine file path");
            return null;
        }

        int startOffset = selectionModel.getSelectionStart();
        int endOffset = selectionModel.getSelectionEnd();

        int startLine = editor.getDocument().getLineNumber(startOffset) + 1;
        int endLine = editor.getDocument().getLineNumber(endOffset) + 1;

        String formattedPath;
        if (startLine == endLine) {
            formattedPath = "@" + relativePath + "#L" + startLine;
        } else {
            formattedPath = "@" + relativePath + "#L" + startLine + "-" + endLine;
        }

        return formattedPath;
    }

    private @Nullable String getRelativePath(@NotNull Project project, @NotNull VirtualFile file) {
        try {
            String absolutePath = file.getPath();
            LOG.debug("File absolute path: " + absolutePath);
            return absolutePath;
        } catch (Exception ex) {
            LOG.error("Failed to get file path: " + ex.getMessage(), ex);
            return null;
        }
    }

    private void sendToChatWindow(@NotNull Project project, @NotNull String text) {
        try {
            ToolWindowManager toolWindowManager = ToolWindowManager.getInstance(project);
            ToolWindow toolWindow = toolWindowManager.getToolWindow("CCG");

            if (toolWindow != null) {
                if (!toolWindow.isVisible()) {
                    toolWindow.activate(() -> {
                        ApplicationManager.getApplication().invokeLater(() -> {
                            try {
                                Thread.sleep(300);
                                ClaudeSDKToolWindow.addSelectionFromExternal(project, text);
                                LOG.info("Window activated and content sent to project: " + project.getName());
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        });
                    }, true);
                } else {
                    ClaudeSDKToolWindow.addSelectionFromExternal(project, text);
                    toolWindow.activate(null, true);
                    LOG.info("Chat window activated and content sent to project: " + project.getName());
                }
            } else {
                showError(project, "Cannot find CCG tool window");
            }

        } catch (Exception ex) {
            showError(project, "Failed to send to chat window: " + ex.getMessage());
            LOG.error("Error occurred", ex);
        }
    }

    private void showError(@Nullable Project project, @NotNull String message) {
        LOG.error(message);
        if (project != null) {
            ApplicationManager.getApplication().invokeLater(() -> {
                com.intellij.openapi.ui.Messages.showErrorDialog(project, message, "Error");
            });
        }
    }

    private void showInfo(@Nullable Project project, @NotNull String message) {
        LOG.info(message);
        if (project != null) {
            ApplicationManager.getApplication().invokeLater(() -> {
                com.intellij.openapi.ui.Messages.showInfoMessage(project, message, "Information");
            });
        }
    }
}

