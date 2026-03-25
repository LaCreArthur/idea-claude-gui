package com.github.claudecodegui.ui;

import com.github.claudecodegui.util.FontConfigService;
import com.github.claudecodegui.util.HtmlLoader;
import com.github.claudecodegui.util.JBCefBrowserFactory;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefBrowserBase;
import com.intellij.ui.jcef.JBCefJSQuery;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefLoadHandlerAdapter;

import javax.swing.*;
import java.awt.*;
import java.awt.datatransfer.Clipboard;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.dnd.DnDConstants;
import java.awt.dnd.DropTarget;
import java.awt.dnd.DropTargetAdapter;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.util.List;
import java.util.function.Consumer;

/**
 * Handles WebView (JCEF browser) initialization for ClaudeChatWindow.
 * Extracted from ClaudeChatWindow to reduce file size and improve separation of concerns.
 */
public class WebViewInitializer {
    private static final Logger LOG = Logger.getInstance(WebViewInitializer.class);

    /**
     * Callback interface for WebView initialization events.
     */
    public interface InitCallback {
        void onBrowserCreated(JBCefBrowser browser);
        void onInitializationFailed(FailureReason reason, String details);
        void onExtractionInProgress();
        void onExtractionComplete();
    }

    /**
     * Reasons why initialization might fail.
     */
    public enum FailureReason {
        JCEF_NOT_SUPPORTED,
        GENERAL_ERROR
    }

    /**
     * Dependencies needed for WebView initialization.
     */
    public interface Dependencies {
        HtmlLoader getHtmlLoader();
        Consumer<String> getJavaScriptMessageHandler();
        Runnable getOnFrontendReady();
    }

    private final Dependencies deps;
    private final JPanel mainPanel;

    public WebViewInitializer(Dependencies deps, JPanel mainPanel) {
        this.deps = deps;
        this.mainPanel = mainPanel;
    }

    /**
     * Initialize the WebView browser component.
     * With the Kotlin agent runtime, no Node.js or bridge checks are needed.
     * Only JCEF availability matters.
     */
    public JBCefBrowser initialize(InitCallback callback) {
        // Check JCEF support
        if (!JBCefBrowserFactory.isJcefSupported()) {
            LOG.warn("JCEF is not supported in this environment");
            callback.onInitializationFailed(FailureReason.JCEF_NOT_SUPPORTED, null);
            return null;
        }

        // Create browser
        try {
            JBCefBrowser browser = JBCefBrowserFactory.create();
            browser.getJBCefClient().setProperty("allowRunningInsecureContent", true);

            setupJavaScriptBridge(browser);
            setupLoadHandler(browser);
            loadHtmlContent(browser);
            setupDropTarget(browser);

            mainPanel.add(browser.getComponent(), BorderLayout.CENTER);
            callback.onBrowserCreated(browser);

            return browser;
        } catch (IllegalStateException e) {
            if (e.getMessage() != null && e.getMessage().contains("JCEF")) {
                LOG.error("JCEF initialization failed: " + e.getMessage(), e);
                callback.onInitializationFailed(FailureReason.JCEF_NOT_SUPPORTED, e.getMessage());
            } else {
                LOG.error("Failed to create UI components: " + e.getMessage(), e);
                callback.onInitializationFailed(FailureReason.GENERAL_ERROR, e.getMessage());
            }
            return null;
        } catch (Exception e) {
            LOG.error("Failed to create UI components: " + e.getMessage(), e);
            callback.onInitializationFailed(FailureReason.GENERAL_ERROR, e.getMessage());
            return null;
        }
    }

    // Store queries as instance fields for use across methods
    private JBCefJSQuery jsQuery;
    private JBCefJSQuery clipboardQuery;

    private void setupJavaScriptBridge(JBCefBrowser browser) {
        JBCefBrowserBase browserBase = browser;
        jsQuery = JBCefJSQuery.create(browserBase);
        jsQuery.addHandler((msg) -> {
            deps.getJavaScriptMessageHandler().accept(msg);
            return new JBCefJSQuery.Response("ok");
        });

        // Create clipboard path query
        clipboardQuery = JBCefJSQuery.create(browserBase);
        clipboardQuery.addHandler((msg) -> {
            try {
                LOG.debug("Clipboard path request received");
                Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
                Transferable contents = clipboard.getContents(null);

                if (contents != null && contents.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                    @SuppressWarnings("unchecked")
                    List<File> files = (List<File>) contents.getTransferData(DataFlavor.javaFileListFlavor);

                    if (!files.isEmpty()) {
                        File file = files.get(0);
                        String filePath = file.getAbsolutePath();
                        LOG.debug("Returning file path from clipboard: " + filePath);
                        return new JBCefJSQuery.Response(filePath);
                    }
                }
                LOG.debug("No file in clipboard");
                return new JBCefJSQuery.Response("");
            } catch (Exception ex) {
                LOG.warn("Error getting clipboard path: " + ex.getMessage());
                return new JBCefJSQuery.Response("");
            }
        });
    }

    private void setupLoadHandler(JBCefBrowser browser) {
        // Capture instance fields for use in anonymous inner class
        final JBCefJSQuery jsQueryRef = this.jsQuery;
        final JBCefJSQuery clipboardQueryRef = this.clipboardQuery;

        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser cefBrowser, CefFrame frame, int httpStatusCode) {
                LOG.debug("onLoadEnd called, isMain=" + frame.isMain() + ", url=" + cefBrowser.getURL());

                if (!frame.isMain()) {
                    return;
                }

                // Inject sendToJava function
                String injection = "window.sendToJava = function(msg) { " + jsQueryRef.inject("msg") + " };";
                cefBrowser.executeJavaScript(injection, cefBrowser.getURL(), 0);

                // Inject E2E test mode helpers if enabled
                if (Boolean.getBoolean("claude.test.mode")) {
                    injectTestModeHelpers(cefBrowser);
                }

                // Inject clipboard path function
                String clipboardPathInjection =
                    "window.getClipboardFilePath = function() {" +
                    "  return new Promise((resolve) => {" +
                    "    " + clipboardQueryRef.inject("''",
                        "function(response) { resolve(response); }",
                        "function(error_code, error_message) { console.error('Failed to get clipboard path:', error_message); resolve(''); }") +
                    "  });" +
                    "};";
                cefBrowser.executeJavaScript(clipboardPathInjection, cefBrowser.getURL(), 0);

                // Forward console logs to IDEA console
                injectConsoleForwarding(cefBrowser);

                // Inject font configuration
                injectFontConfig(cefBrowser);

                LOG.debug("onLoadEnd completed, waiting for frontend_ready signal");
            }
        }, browser.getCefBrowser());
    }

    private void injectTestModeHelpers(CefBrowser cefBrowser) {
        String testModeInjection =
            "window.__testMode = true;" +
            "window.__testMessageLog = [];" +
            "window.__testCallbackRegistry = new Map();" +
            "window.__originalSendToJava = window.sendToJava;" +
            "window.sendToJava = function(msg) {" +
            "  window.__testMessageLog.push({ ts: Date.now(), dir: 'out', msg: msg });" +
            "  return window.__originalSendToJava(msg);" +
            "};" +
            "window.__testCommandPoll = setInterval(function() {" +
            "  try {" +
            "    var cmd = localStorage.getItem('__testCommand');" +
            "    if (cmd) {" +
            "      localStorage.removeItem('__testCommand');" +
            "      console.log('[TEST_MODE] Executing command:', cmd);" +
            "      var parsed = JSON.parse(cmd);" +
            "      if (parsed.type === 'send_message' && parsed.message) {" +
            "        window.sendToJava('send_message:' + JSON.stringify({message: parsed.message, provider: 'claude'}));" +
            "      } else if (parsed.type === 'click_option' && typeof parsed.index === 'number') {" +
            "        var btns = document.querySelectorAll('button');" +
            "        if (btns[parsed.index]) btns[parsed.index].click();" +
            "      } else if (parsed.type === 'execute_js' && parsed.code) {" +
            "        eval(parsed.code);" +
            "      }" +
            "      localStorage.setItem('__testResult', JSON.stringify({success: true, ts: Date.now()}));" +
            "    }" +
            "  } catch(e) {" +
            "    console.error('[TEST_MODE] Command error:', e);" +
            "    localStorage.setItem('__testResult', JSON.stringify({error: e.message, ts: Date.now()}));" +
            "  }" +
            "}, 500);";
        cefBrowser.executeJavaScript(testModeInjection, cefBrowser.getURL(), 0);
        LOG.info("[TEST_MODE] Test mode helpers injected with command polling");

        // Start file-based command watcher for E2E testing
        startTestCommandWatcher(cefBrowser);
    }

    private void startTestCommandWatcher(CefBrowser cefBrowser) {
        java.util.concurrent.ScheduledExecutorService testCommandWatcher =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        testCommandWatcher.scheduleAtFixedRate(() -> {
            try {
                java.nio.file.Path cmdPath = java.nio.file.Paths.get("/tmp/claude-gui-test-command.txt");
                if (java.nio.file.Files.exists(cmdPath)) {
                    String content = java.nio.file.Files.readString(cmdPath);
                    java.nio.file.Files.delete(cmdPath);
                    String[] lines = content.split("\n", 2);
                    if (lines.length >= 1) {
                        String command = lines[0].trim();
                        String payload = lines.length > 1 ? lines[1].trim() : "";
                        LOG.info("[TEST_MODE] Executing file command: " + command);

                        String js = "";
                        if ("send_message".equals(command)) {
                            String escaped = payload.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
                            js = "window.sendToJava('send_message:' + JSON.stringify({message: \"" + escaped + "\", provider: 'claude'}));";
                        } else if ("click_option".equals(command)) {
                            js = "var btns = document.querySelectorAll('button'); if (btns[" + payload + "]) btns[" + payload + "].click();";
                        } else if ("execute_js".equals(command)) {
                            js = payload;
                        }

                        if (!js.isEmpty()) {
                            final String jsCode = js;
                            ApplicationManager.getApplication().invokeLater(() -> {
                                cefBrowser.executeJavaScript(jsCode, cefBrowser.getURL(), 0);
                                LOG.info("[TEST_MODE] JavaScript executed successfully");
                            });
                        }
                    }
                }
            } catch (Exception e) {
                LOG.warn("[TEST_MODE] Error processing command file: " + e.getMessage());
            }
        }, 500, 500, java.util.concurrent.TimeUnit.MILLISECONDS);
        LOG.info("[TEST_MODE] File command watcher started");
    }

    private void injectConsoleForwarding(CefBrowser cefBrowser) {
        String consoleForward =
            "const originalLog = console.log;" +
            "const originalError = console.error;" +
            "const originalWarn = console.warn;" +
            "console.log = function(...args) {" +
            "  originalLog.apply(console, args);" +
            "  window.sendToJava(JSON.stringify({type: 'console.log', args: args}));" +
            "};" +
            "console.error = function(...args) {" +
            "  originalError.apply(console, args);" +
            "  window.sendToJava(JSON.stringify({type: 'console.error', args: args}));" +
            "};" +
            "console.warn = function(...args) {" +
            "  originalWarn.apply(console, args);" +
            "  window.sendToJava(JSON.stringify({type: 'console.warn', args: args}));" +
            "};";
        cefBrowser.executeJavaScript(consoleForward, cefBrowser.getURL(), 0);
    }

    private void injectFontConfig(CefBrowser cefBrowser) {
        String fontConfig = FontConfigService.getEditorFontConfigJson();
        LOG.info("[FontSync] Got font config: " + fontConfig);
        String fontConfigInjection = String.format(
            "if (window.applyIdeaFontConfig) { window.applyIdeaFontConfig(%s); } " +
            "else { window.__pendingFontConfig = %s; }",
            fontConfig, fontConfig
        );
        cefBrowser.executeJavaScript(fontConfigInjection, cefBrowser.getURL(), 0);
        LOG.info("[FontSync] Font config injected to frontend");
    }

    private void loadHtmlContent(JBCefBrowser browser) {
        String htmlContent = deps.getHtmlLoader().loadChatHtml();
        browser.loadHTML(htmlContent);
    }

    private void setupDropTarget(JBCefBrowser browser) {
        JComponent browserComponent = browser.getComponent();

        new DropTarget(browserComponent, new DropTargetAdapter() {
            @Override
            public void drop(DropTargetDropEvent dtde) {
                try {
                    dtde.acceptDrop(DnDConstants.ACTION_COPY);
                    Transferable transferable = dtde.getTransferable();

                    if (transferable.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                        @SuppressWarnings("unchecked")
                        List<File> files = (List<File>) transferable.getTransferData(DataFlavor.javaFileListFlavor);

                        if (!files.isEmpty()) {
                            File file = files.get(0);
                            String filePath = file.getAbsolutePath();
                            LOG.debug("Dropped file path: " + filePath);

                            String jsCode = String.format(
                                "if (window.handleFilePathFromJava) { window.handleFilePathFromJava('%s'); }",
                                filePath.replace("\\", "\\\\").replace("'", "\\'")
                            );
                            browser.getCefBrowser().executeJavaScript(jsCode, browser.getCefBrowser().getURL(), 0);
                        }
                        dtde.dropComplete(true);
                        return;
                    }
                } catch (Exception ex) {
                    LOG.warn("Drop error: " + ex.getMessage(), ex);
                }
                dtde.dropComplete(false);
            }
        });
    }
}
