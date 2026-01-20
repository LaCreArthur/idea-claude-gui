package com.github.claudecodegui.permission;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.DialogWrapper;
import com.intellij.ui.jcef.JBCefBrowser;
import com.github.claudecodegui.util.JBCefBrowserFactory;
import com.intellij.ui.jcef.JBCefBrowserBase;
import com.intellij.ui.jcef.JBCefJSQuery;
import com.google.gson.Gson;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefLoadHandlerAdapter;
import org.jetbrains.annotations.Nullable;

import javax.swing.*;
import java.awt.*;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import com.intellij.openapi.diagnostic.Logger;

public class PermissionDialog extends DialogWrapper {
    private static final Logger LOG = Logger.getInstance(PermissionDialog.class);

    private final JBCefBrowser browser;
    private final JBCefJSQuery jsQuery;
    private final PermissionRequest request;
    private Consumer<PermissionDecision> decisionCallback;
    private final Gson gson = new Gson();

    public static class PermissionDecision {
        public final String channelId;
        public final boolean allow;
        public final boolean remember;
        public final String rejectMessage;

        public PermissionDecision(String channelId, boolean allow, boolean remember, String rejectMessage) {
            this.channelId = channelId;
            this.allow = allow;
            this.remember = remember;
            this.rejectMessage = rejectMessage;
        }
    }

    public PermissionDialog(@Nullable Project project, PermissionRequest request) {
        super(project, false);
        this.request = request;

        setTitle("Permission Request");
        setModal(true);
        setResizable(false);

        this.browser = JBCefBrowserFactory.create();
        JBCefBrowserBase browserBase = this.browser;
        this.jsQuery = JBCefJSQuery.create(browserBase);

        jsQuery.addHandler((message) -> {
            if (message.startsWith("permission_decision:")) {
                String jsonData = message.substring("permission_decision:".length());
                PermissionDecision decision = gson.fromJson(jsonData, PermissionDecision.class);
                if (decisionCallback != null) {
                    decisionCallback.accept(decision);
                }
                ApplicationManager.getApplication().invokeLater(() -> close(0));
                return null;
            }
            return null;
        });

        loadHtml();

        init();
    }

    private void loadHtml() {
        try {
            InputStream is = getClass().getResourceAsStream("/html/permission-dialog.html");
            if (is == null) {
                throw new RuntimeException("Cannot find permission dialog HTML file");
            }

            String html = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))
                    .lines()
                    .collect(Collectors.joining("\n"));

            String jsInjection = String.format(
                    "<script>window.sendToJava = function(message) { %s };</script>",
                    jsQuery.inject("message")
            );
            html = html.replace("</body>", jsInjection + "</body>");

            browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
                @Override
                public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int httpStatusCode) {
                    initializeRequestData();
                }
            }, browser.getCefBrowser());

            browser.loadHTML(html);

        } catch (Exception e) {
            LOG.error("Error occurred", e);
            browser.loadHTML("<html><body><h3>Failed to load permission dialog</h3></body></html>");
        }
    }

    private void initializeRequestData() {
        Map<String, Object> requestData = new HashMap<>();
        requestData.put("channelId", request.getChannelId());
        requestData.put("toolName", translateToolName(request.getToolName()));
        requestData.put("inputs", request.getInputs());
        requestData.put("suggestions", request.getSuggestions());

        String json = gson.toJson(requestData);
        String script = String.format("if (window.initPermissionRequest) { window.initPermissionRequest(%s); }", json);

        browser.getCefBrowser().executeJavaScript(script, browser.getCefBrowser().getURL(), 0);
    }

    private String translateToolName(String toolName) {
        return toolName;
    }

    public void setDecisionCallback(Consumer<PermissionDecision> callback) {
        this.decisionCallback = callback;
    }

    @Override
    protected @Nullable JComponent createCenterPanel() {
        JPanel panel = new JPanel(new BorderLayout());
        panel.setPreferredSize(new Dimension(520, 400));
        panel.add(browser.getComponent(), BorderLayout.CENTER);
        return panel;
    }

    @Override
    protected Action[] createActions() {
        return new Action[0];
    }

    @Override
    public void dispose() {
        jsQuery.dispose();
        browser.dispose();
        super.dispose();
    }
}
