package com.github.claudecodegui.ui;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.editor.event.SelectionEvent;
import com.intellij.openapi.editor.event.SelectionListener;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerEvent;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.util.Alarm;
import com.intellij.util.messages.MessageBusConnection;
import org.jetbrains.annotations.NotNull;

import java.util.function.Consumer;

/**
 * Manages editor context tracking for the Claude chat window.
 * Monitors file switching and text selection changes to update
 * the context bar in the frontend.
 */
public class EditorContextManager {
    private static final Logger LOG = Logger.getInstance(EditorContextManager.class);
    private static final int UPDATE_DELAY_MS = 200;

    private final Project project;
    private final Consumer<String> onSelectionInfo;
    private final Runnable onClearSelection;

    private Alarm contextUpdateAlarm;
    private MessageBusConnection connection;
    private volatile boolean disposed = false;

    /**
     * Creates a new EditorContextManager.
     *
     * @param project          The IntelliJ project
     * @param onSelectionInfo  Callback when selection info is available (e.g., "@/path/file.java#L1-10")
     * @param onClearSelection Callback when selection should be cleared (no file open)
     */
    public EditorContextManager(Project project, Consumer<String> onSelectionInfo, Runnable onClearSelection) {
        this.project = project;
        this.onSelectionInfo = onSelectionInfo;
        this.onClearSelection = onClearSelection;
    }

    /**
     * Initialize and start listening for editor events.
     */
    public void init() {
        contextUpdateAlarm = new Alarm(Alarm.ThreadToUse.SWING_THREAD);
        connection = project.getMessageBus().connect();

        // Monitor file switching
        connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, new FileEditorManagerListener() {
            @Override
            public void selectionChanged(@NotNull FileEditorManagerEvent event) {
                scheduleContextUpdate();
            }
        });

        // Monitor text selection
        SelectionListener selectionListener = new SelectionListener() {
            @Override
            public void selectionChanged(@NotNull SelectionEvent e) {
                if (e.getEditor().getProject() == project) {
                    scheduleContextUpdate();
                }
            }
        };
        EditorFactory.getInstance().getEventMulticaster().addSelectionListener(selectionListener, connection);
    }

    /**
     * Schedule a debounced context update.
     */
    private void scheduleContextUpdate() {
        if (disposed || contextUpdateAlarm == null) return;
        contextUpdateAlarm.cancelAllRequests();
        contextUpdateAlarm.addRequest(this::updateContextInfo, UPDATE_DELAY_MS);
    }

    /**
     * Update context info based on current editor state.
     */
    private void updateContextInfo() {
        if (disposed) return;

        // Ensure we are on EDT (Alarm.ThreadToUse.SWING_THREAD guarantees this, but being safe)
        ApplicationManager.getApplication().invokeLater(() -> {
            if (disposed) return;
            try {
                FileEditorManager editorManager = FileEditorManager.getInstance(project);
                Editor editor = editorManager.getSelectedTextEditor();

                String selectionInfo = null;

                if (editor != null) {
                    VirtualFile file = FileDocumentManager.getInstance().getFile(editor.getDocument());
                    if (file != null) {
                        String path = file.getPath();
                        selectionInfo = "@" + path;

                        com.intellij.openapi.editor.SelectionModel selectionModel = editor.getSelectionModel();
                        if (selectionModel.hasSelection()) {
                            int startLine = editor.getDocument().getLineNumber(selectionModel.getSelectionStart()) + 1;
                            int endLine = editor.getDocument().getLineNumber(selectionModel.getSelectionEnd()) + 1;

                            if (endLine > startLine && editor.offsetToLogicalPosition(selectionModel.getSelectionEnd()).column == 0) {
                                endLine--;
                            }
                            selectionInfo += "#L" + startLine + "-" + endLine;
                        }
                    }
                } else {
                    VirtualFile[] files = editorManager.getSelectedFiles();
                    if (files.length > 0) {
                        selectionInfo = "@" + files[0].getPath();
                    }
                }

                if (selectionInfo != null) {
                    onSelectionInfo.accept(selectionInfo);
                } else {
                    // When no file is open, clear the frontend display
                    onClearSelection.run();
                }
            } catch (Exception e) {
                LOG.warn("Failed to update context info: " + e.getMessage());
            }
        });
    }

    /**
     * Dispose of resources.
     */
    public void dispose() {
        disposed = true;
        if (connection != null) {
            connection.disconnect();
            connection = null;
        }
        if (contextUpdateAlarm != null) {
            contextUpdateAlarm.dispose();
            contextUpdateAlarm = null;
        }
    }
}
