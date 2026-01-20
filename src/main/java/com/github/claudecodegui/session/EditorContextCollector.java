package com.github.claudecodegui.session;

import com.github.claudecodegui.handler.context.ContextCollector;
import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.Project;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

public class EditorContextCollector {
    private static final Logger LOG = Logger.getInstance(EditorContextCollector.class);

    private final Project project;
    private boolean psiContextEnabled = true;

    private boolean isQuickFix = false;

    public EditorContextCollector(Project project) {
        this.project = project;
    }

    public void setQuickFix(boolean quickFix) {
        this.isQuickFix = quickFix;
    }

    public void setPsiContextEnabled(boolean enabled) {
        this.psiContextEnabled = enabled;
    }

    public CompletableFuture<JsonObject> collectContext() {
        CompletableFuture<JsonObject> future = new CompletableFuture<>();

        AtomicReference<Editor> editorRef = new AtomicReference<>();
        AtomicReference<String> activeFileRef = new AtomicReference<>();

        ApplicationManager.getApplication().invokeAndWait(() -> {
            try {
                editorRef.set(FileEditorManager.getInstance(project).getSelectedTextEditor());
                activeFileRef.set(EditorFileUtils.getCurrentActiveFile(project));
            } catch (Exception e) {
                LOG.warn("Failed to get editor on EDT: " + e.getMessage());
            }
        });

        ReadAction
            .nonBlocking(() -> {
                try {
                    return buildContextJson(editorRef.get(), activeFileRef.get());
                } catch (Exception e) {
                    LOG.warn("Failed to get file info: " + e.getMessage());
                    return new JsonObject();
                }
            })
            .finishOnUiThread(com.intellij.openapi.application.ModalityState.defaultModalityState(), future::complete)
            .submit(AppExecutorUtil.getAppExecutorService());

        return future;
    }

    private JsonObject buildContextJson(Editor editor, String activeFile) {
        List<String> allOpenedFiles = EditorFileUtils.getOpenedFiles(project);
        Map<String, Object> selectionInfo = EditorFileUtils.getSelectedCodeInfo(project);

        JsonObject openedFilesJson = new JsonObject();

        if (activeFile != null) {
            openedFilesJson.addProperty("active", activeFile);
            LOG.debug("Current active file: " + activeFile);

            if (selectionInfo != null) {
                JsonObject selectionJson = new JsonObject();
                selectionJson.addProperty("startLine", (Integer) selectionInfo.get("startLine"));
                selectionJson.addProperty("endLine", (Integer) selectionInfo.get("endLine"));
                selectionJson.addProperty("selectedText", (String) selectionInfo.get("selectedText"));
                openedFilesJson.add("selection", selectionJson);
                LOG.debug("Code selection detected: lines " +
                    selectionInfo.get("startLine") + "-" + selectionInfo.get("endLine"));
            }

            if (psiContextEnabled && editor != null && activeFile != null) {
                try {
                    ContextCollector semanticCollector = new ContextCollector();
                    JsonObject semanticContext = semanticCollector.collectSemanticContext(editor, project);
                    if (semanticContext != null && semanticContext.size() > 0) {
                        for (String key : semanticContext.keySet()) {
                            openedFilesJson.add(key, semanticContext.get(key));
                        }
                        LOG.debug("PSI semantic context merged for: " + activeFile);
                    }
                } catch (Exception e) {
                    LOG.warn("Failed to collect PSI semantic context: " + e.getMessage());
                }
            }
        }

        JsonArray othersArray = new JsonArray();
        for (String file : allOpenedFiles) {
            if (!file.equals(activeFile)) {
                othersArray.add(file);
            }
        }
        if (othersArray.size() > 0) {
            openedFilesJson.add("others", othersArray);
            LOG.debug("Other opened files count: " + othersArray.size());
        }

        if (isQuickFix) {
            openedFilesJson.addProperty("isQuickFix", true);
        }

        return openedFilesJson;
    }
}
