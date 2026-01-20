package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSDKToolWindow;
import com.github.claudecodegui.ClaudeSession;
import com.github.claudecodegui.SessionLoadService;
import com.github.claudecodegui.PluginSettingsService;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.handler.*;
import com.github.claudecodegui.permission.PermissionRequest;
import com.github.claudecodegui.permission.PermissionService;
import com.github.claudecodegui.util.HtmlLoader;
import com.github.claudecodegui.util.JsUtils;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.ui.content.Content;
import com.intellij.ui.jcef.JBCefBrowser;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.util.List;
import java.util.concurrent.*;

/**
 * Claude 聊天窗口类
 * 从 ClaudeSDKToolWindow 内部类提取而来
 */
public class ClaudeChatWindow {
    private static final Logger LOG = Logger.getInstance(ClaudeChatWindow.class);

    private final JPanel mainPanel;
    private final ClaudeSDKBridge claudeSDKBridge;
    private final Project project;
    private final PluginSettingsService settingsService;
    private final HtmlLoader htmlLoader;
    private final SettingsLoader settingsLoader;
    private Content parentContent;

    // Editor context tracking (extracted to separate class)
    private EditorContextManager editorContextManager;

    private JBCefBrowser browser;
    private ClaudeSession session;

    // Streaming message update handler (extracted to separate class)
    private StreamingMessageHandler streamingHandler;

    // Slash command management (extracted to separate class)
    private SlashCommandManager slashCommandManager;

    private volatile boolean disposed = false;
    private volatile boolean initialized = false;
    private volatile boolean frontendReady = false;  // Frontend React app ready flag

    // QuickFix message handling (extracted to separate class)
    private QuickFixHandler quickFixHandler;

    // Usage tracking (extracted to separate class)
    private UsageTracker usageTracker;

    // WebView initialization (extracted to separate class)
    private WebViewInitializer webViewInitializer;

    // JavaScript bridge message handling (extracted to separate class)
    private JsBridgeMessageHandler jsBridgeMessageHandler;

    // Code snippet handling (extracted to separate class)
    private CodeSnippetHandler codeSnippetHandler;

    // Handler 相关
    private HandlerContext handlerContext;
    private MessageDispatcher messageDispatcher;
    private PermissionHandler permissionHandler;
    private HistoryHandler historyHandler;

    public ClaudeChatWindow(Project project) {
        this(project, false);
    }

    public ClaudeChatWindow(Project project, boolean skipRegister) {
        this.project = project;
        this.claudeSDKBridge = new ClaudeSDKBridge();
        this.settingsService = new PluginSettingsService();
        this.htmlLoader = new HtmlLoader(getClass());
        this.mainPanel = new JPanel(new BorderLayout());
        this.settingsLoader = new SettingsLoader(claudeSDKBridge, project);

        initializeStreamingHandler();
        initializeSlashCommandManager();
        initializeQuickFixHandler();
        initializeUsageTracker();
        initializeSession();
        settingsLoader.loadNodePathFromSettings();
        syncActiveProvider();
        setupPermissionService();
        initializeHandlers();
        initializeJsBridgeMessageHandler();
        initializeCodeSnippetHandler();
        initializeEditorContextManager();
        setupSessionCallbacks();
        initializeSessionInfo();
        overrideBridgePathIfAvailable();

        createUIComponents();
        registerSessionLoadListener();
        if (!skipRegister) {
            registerInstance();
        }
        initializeStatusBar();

        this.initialized = true;
        LOG.info("窗口实例已完全初始化，项目: " + project.getName());

        // 注意：斜杠命令的加载现在由前端发起
        // 前端在 bridge 准备好后会发送 frontend_ready 和 refresh_slash_commands 事件
        // 这确保了前后端初始化时序正确
    }

    public void setParentContent(Content content) {
        this.parentContent = content;
    }

    private void initializeStreamingHandler() {
        this.streamingHandler = new StreamingMessageHandler(
            () -> disposed,
            (messages, sequence) -> sendStreamMessagesToWebView(messages, sequence, null)
        );
    }

    private void initializeSlashCommandManager() {
        this.slashCommandManager = new SlashCommandManager(
            project,
            claudeSDKBridge,
            this::callJavaScript
        );
    }

    private void initializeQuickFixHandler() {
        this.quickFixHandler = new QuickFixHandler(new QuickFixHandler.Dependencies() {
            @Override
            public ClaudeSession getSession() {
                return session;
            }

            @Override
            public boolean isDisposed() {
                return disposed;
            }

            @Override
            public boolean isFrontendReady() {
                return frontendReady;
            }

            @Override
            public void callJavaScript(String function, String... args) {
                ClaudeChatWindow.this.callJavaScript(function, args);
            }
        });
    }

    private void initializeUsageTracker() {
        this.usageTracker = new UsageTracker(new UsageTracker.Dependencies() {
            @Override
            public boolean isDisposed() {
                return disposed;
            }

            @Override
            public JBCefBrowser getBrowser() {
                return browser;
            }

            @Override
            public String getCurrentModel() {
                return handlerContext != null ? handlerContext.getCurrentModel() : "claude-sonnet-4-5";
            }
        });
    }

    private void overrideBridgePathIfAvailable() {
            try {
                String basePath = project.getBasePath();
                if (basePath == null) return;
                File bridgeDir = new File(basePath, "ai-bridge");
                File channelManager = new File(bridgeDir, "bridge.js");
                if (bridgeDir.exists() && bridgeDir.isDirectory() && channelManager.exists()) {
                    claudeSDKBridge.setSdkTestDir(bridgeDir.getAbsolutePath());
                    LOG.info("Overriding ai-bridge path to project directory: " + bridgeDir.getAbsolutePath());
                } else {
                    LOG.info("Project ai-bridge not found, using default resolver");
                }
            } catch (Exception e) {
                LOG.warn("Failed to override bridge path: " + e.getMessage());
            }
        }

        private void initializeSession() {
            this.session = new ClaudeSession(project, claudeSDKBridge);
            settingsLoader.loadPermissionModeFromSettings(session);
        }

        private void initializeStatusBar() {
            ApplicationManager.getApplication().invokeLater(() -> {
                if (project == null || disposed) return;

                // Set initial mode
                String mode = session != null ? session.getPermissionMode() : "default";
                com.github.claudecodegui.notifications.ClaudeNotifier.setMode(project, mode);

                // Set initial model
                String model = session != null ? session.getModel() : "claude-sonnet-4-5";
                com.github.claudecodegui.notifications.ClaudeNotifier.setModel(project, model);

                // Set initial agent
                try {
                    String selectedId = settingsService.getSelectedAgentId();
                    if (selectedId != null) {
                        JsonObject agent = settingsService.getAgent(selectedId);
                        if (agent != null) {
                            String agentName = agent.has("name") ? agent.get("name").getAsString() : "Agent";
                            com.github.claudecodegui.notifications.ClaudeNotifier.setAgent(project, agentName);
                        }
                    }
                } catch (Exception e) {
                    LOG.warn("Failed to set initial agent in status bar: " + e.getMessage());
                }
            });
        }

        private void syncActiveProvider() {
            try {
                // First, try to auto-enable local provider if no provider is configured
                // This provides a better out-of-the-box experience for users who have 'claude login' done
                if (settingsService.autoEnableLocalProviderIfAvailable()) {
                    LOG.info("[ClaudeSDKToolWindow] Auto-enabled local settings.json provider");
                    return;
                }

                if (settingsService.isLocalProviderActive()) {
                    LOG.info("[ClaudeSDKToolWindow] Local provider active, skipping startup sync");
                    return;
                }
                settingsService.applyActiveProviderToClaudeSettings();
            } catch (Exception e) {
                LOG.warn("Failed to sync active provider on startup: " + e.getMessage());
            }
        }

        private void setupPermissionService() {
            PermissionService permissionService = project.getService(PermissionService.class);
            // Register dialog showers for multi-project support
            permissionService.registerDialogShower(project, (toolName, inputs) ->
                permissionHandler.showFrontendPermissionDialog(toolName, inputs));
            permissionService.registerAskUserQuestionDialogShower(project, (requestId, questionsData) ->
                permissionHandler.showAskUserQuestionDialog(requestId, questionsData));
            LOG.info("Registered permission dialog showers for project: " + project.getName());
        }

        private void initializeHandlers() {
            HandlerContext.JsCallback jsCallback = new HandlerContext.JsCallback() {
                @Override
                public void callJavaScript(String functionName, String... args) {
                    ClaudeChatWindow.this.callJavaScript(functionName, args);
                }
                @Override
                public String escapeJs(String str) {
                    return JsUtils.escapeJs(str);
                }
            };

            this.handlerContext = new HandlerContext(project, claudeSDKBridge, settingsService, jsCallback);
            handlerContext.setSession(session);

            this.messageDispatcher = new MessageDispatcher();

            // Register all handlers
            messageDispatcher.registerHandler(new McpServerHandler(handlerContext));
            messageDispatcher.registerHandler(new SkillHandler(handlerContext, mainPanel));
            messageDispatcher.registerHandler(new FileHandler(handlerContext));
            messageDispatcher.registerHandler(new SettingsHandler(handlerContext));
            messageDispatcher.registerHandler(new SessionHandler(handlerContext));
            messageDispatcher.registerHandler(new FileExportHandler(handlerContext));
            messageDispatcher.registerHandler(new DiffHandler(handlerContext));
            messageDispatcher.registerHandler(new AgentHandler(handlerContext));
            messageDispatcher.registerHandler(new TabHandler(handlerContext));
            messageDispatcher.registerHandler(new RewindHandler(handlerContext));
            messageDispatcher.registerHandler(new DependencyHandler(handlerContext));

            // 权限处理器（需要特殊回调）
            this.permissionHandler = new PermissionHandler(handlerContext);
            permissionHandler.setPermissionDeniedCallback(this::interruptDueToPermissionDenial);
            messageDispatcher.registerHandler(permissionHandler);

            // 历史处理器（需要特殊回调）
            this.historyHandler = new HistoryHandler(handlerContext);
            historyHandler.setSessionLoadCallback(this::loadHistorySession);
            messageDispatcher.registerHandler(historyHandler);

            LOG.info("Registered " + messageDispatcher.getHandlerCount() + " message handlers");
        }

        private void initializeJsBridgeMessageHandler() {
            this.jsBridgeMessageHandler = new JsBridgeMessageHandler(new JsBridgeMessageHandler.Dependencies() {
                @Override
                public com.github.claudecodegui.handler.MessageDispatcher getMessageDispatcher() {
                    return messageDispatcher;
                }

                @Override
                public SlashCommandManager getSlashCommandManager() {
                    return slashCommandManager;
                }

                @Override
                public QuickFixHandler getQuickFixHandler() {
                    return quickFixHandler;
                }

                @Override
                public String getSessionCwd() {
                    return session != null ? session.getCwd() : null;
                }

                @Override
                public boolean hasCachedSlashCommands() {
                    return slashCommandManager != null && slashCommandManager.hasCachedCommands();
                }

                @Override
                public void setFrontendReady(boolean ready) {
                    frontendReady = ready;
                }

                @Override
                public void sendCurrentPermissionMode() {
                    ClaudeChatWindow.this.sendCurrentPermissionMode();
                }

                @Override
                public void createNewSession() {
                    ClaudeChatWindow.this.createNewSession();
                }
            });
        }

        private void initializeCodeSnippetHandler() {
            this.codeSnippetHandler = new CodeSnippetHandler(new CodeSnippetHandler.Dependencies() {
                @Override
                public boolean isDisposed() {
                    return disposed;
                }

                @Override
                public boolean isInitialized() {
                    return initialized;
                }

                @Override
                public void callJavaScript(String function, String... args) {
                    ClaudeChatWindow.this.callJavaScript(function, args);
                }
            });
        }

        private void initializeEditorContextManager() {
            editorContextManager = new EditorContextManager(
                project,
                codeSnippetHandler::addSelectionInfo,
                codeSnippetHandler::clearSelectionInfo
            );
            editorContextManager.init();
        }

        private void initializeSessionInfo() {
            String workingDirectory = determineWorkingDirectory();
            session.setSessionInfo(null, workingDirectory);
            LOG.info("Initialized with working directory: " + workingDirectory);
        }

        private void registerInstance() {
            ClaudeSDKToolWindow.registerChatWindow(project, this);
        }

        private void createUIComponents() {
            webViewInitializer = new WebViewInitializer(
                new WebViewInitializer.Dependencies() {
                    @Override
                    public ClaudeSDKBridge getClaudeSDKBridge() {
                        return claudeSDKBridge;
                    }

                    @Override
                    public HtmlLoader getHtmlLoader() {
                        return htmlLoader;
                    }

                    @Override
                    public java.util.function.Consumer<String> getJavaScriptMessageHandler() {
                        return ClaudeChatWindow.this::handleJavaScriptMessage;
                    }

                    @Override
                    public Runnable getOnFrontendReady() {
                        return () -> frontendReady = true;
                    }
                },
                mainPanel
            );

            browser = webViewInitializer.initialize(new WebViewInitializer.InitCallback() {
                @Override
                public void onBrowserCreated(JBCefBrowser createdBrowser) {
                    handlerContext.setBrowser(createdBrowser);
                    LOG.info("WebView browser created successfully");
                }

                @Override
                public void onInitializationFailed(WebViewInitializer.FailureReason reason, String details) {
                    switch (reason) {
                        case NODE_NOT_FOUND:
                            showErrorPanel();
                            break;
                        case NODE_VERSION_UNSUPPORTED:
                            showVersionErrorPanel(details);
                            break;
                        case INVALID_NODE_PATH:
                            String[] parts = details != null ? details.split("\\|", 2) : new String[]{"", null};
                            showInvalidNodePathPanel(parts[0], parts.length > 1 ? parts[1] : null);
                            break;
                        case BRIDGE_ERROR:
                            showBridgeErrorPanel();
                            break;
                        case JCEF_NOT_SUPPORTED:
                            showJcefNotSupportedPanel();
                            break;
                        case GENERAL_ERROR:
                        default:
                            showErrorPanel();
                            break;
                    }
                }

                @Override
                public void onExtractionInProgress() {
                    showLoadingPanel();
                }

                @Override
                public void onExtractionComplete() {
                    reinitializeAfterExtraction();
                }
            });
        }

        private void showErrorPanel() {
            JPanel errorPanel = ErrorPanelManager.buildNodeNotFoundPanel(
                claudeSDKBridge.getNodeExecutable(),
                this::handleNodePathSave
            );
            mainPanel.add(errorPanel, BorderLayout.CENTER);
        }

        private void showVersionErrorPanel(String currentVersion) {
            JPanel errorPanel = ErrorPanelManager.buildVersionErrorPanel(
                currentVersion,
                claudeSDKBridge.getNodeExecutable(),
                this::handleNodePathSave
            );
            mainPanel.add(errorPanel, BorderLayout.CENTER);
        }

        private void showInvalidNodePathPanel(String path, String errMsg) {
            JPanel errorPanel = ErrorPanelManager.buildInvalidNodePathPanel(
                path,
                errMsg,
                this::handleNodePathSave
            );
            mainPanel.add(errorPanel, BorderLayout.CENTER);
        }

        private void showBridgeErrorPanel() {
            JPanel errorPanel = ErrorPanelManager.buildBridgeErrorPanel(
                claudeSDKBridge.getNodeExecutable(),
                claudeSDKBridge.getCachedNodeVersion(),
                this::handleNodePathSave
            );
            mainPanel.add(errorPanel, BorderLayout.CENTER);
        }

        private void showJcefNotSupportedPanel() {
            JPanel errorPanel = ErrorPanelManager.buildJcefNotSupportedPanel();
            mainPanel.add(errorPanel, BorderLayout.CENTER);
        }

        /**
         * Show a loading panel while AI Bridge is being extracted.
         * This avoids EDT freeze during first-time setup.
         */
        private void showLoadingPanel() {
            JPanel loadingPanel = ErrorPanelManager.buildLoadingPanel();
            mainPanel.add(loadingPanel, BorderLayout.CENTER);
        }

        /**
         * Reinitialize UI after bridge extraction completes.
         */
        private void reinitializeAfterExtraction() {
            ApplicationManager.getApplication().invokeLater(() -> {
                LOG.info("[ClaudeSDKToolWindow] Bridge extraction complete, reinitializing UI...");
                mainPanel.removeAll();
                createUIComponents();
                mainPanel.revalidate();
                mainPanel.repaint();
            });
        }

        private void handleNodePathSave(String manualPath) {
            try {
                if (manualPath == null || manualPath.isEmpty()) {
                    settingsLoader.clearNodePath();
                } else {
                    settingsLoader.saveNodePath(manualPath);
                }

                ApplicationManager.getApplication().invokeLater(() -> {
                    mainPanel.removeAll();
                    createUIComponents();
                    mainPanel.revalidate();
                    mainPanel.repaint();
                });

            } catch (Exception ex) {
                JOptionPane.showMessageDialog(mainPanel,
                    "保存或应用 Node.js 路径时出错: " + ex.getMessage(),
                    "错误", JOptionPane.ERROR_MESSAGE);
            }
        }

        private void handleJavaScriptMessage(String message) {
            jsBridgeMessageHandler.handleMessage(message);
        }

        private void registerSessionLoadListener() {
            SessionLoadService.getInstance().setListener((sessionId, projectPath) -> {
                ApplicationManager.getApplication().invokeLater(() -> loadHistorySession(sessionId, projectPath));
            });
        }

        private String determineWorkingDirectory() {
            String projectPath = project.getBasePath();

            // 如果项目路径无效，回退到用户主目录
            if (projectPath == null || !new File(projectPath).exists()) {
                String userHome = System.getProperty("user.home");
                LOG.warn("Using user home directory as fallback: " + userHome);
                return userHome;
            }

            // 尝试从配置中读取自定义工作目录
            try {
                PluginSettingsService settingsService = new PluginSettingsService();
                String customWorkingDir = settingsService.getCustomWorkingDirectory(projectPath);

                if (customWorkingDir != null && !customWorkingDir.isEmpty()) {
                    // 如果是相对路径，拼接到项目根路径
                    File workingDirFile = new File(customWorkingDir);
                    if (!workingDirFile.isAbsolute()) {
                        workingDirFile = new File(projectPath, customWorkingDir);
                    }

                    // 验证目录是否存在
                    if (workingDirFile.exists() && workingDirFile.isDirectory()) {
                        String resolvedPath = workingDirFile.getAbsolutePath();
                        LOG.info("Using custom working directory: " + resolvedPath);
                        return resolvedPath;
                    } else {
                        LOG.warn("Custom working directory does not exist: " + workingDirFile.getAbsolutePath() + ", falling back to project root");
                    }
                }
            } catch (Exception e) {
                LOG.warn("Failed to read custom working directory: " + e.getMessage());
            }

            // 默认使用项目根路径
            return projectPath;
        }

        private void loadHistorySession(String sessionId, String projectPath) {
            LOG.info("Loading history session: " + sessionId + " from project: " + projectPath);

            // 保存当前的 permission mode、provider、model（如果存在旧 session）
            String previousPermissionMode;
            String previousProvider;
            String previousModel;

            if (session != null) {
                previousPermissionMode = session.getPermissionMode();
                previousProvider = session.getProvider();
                previousModel = session.getModel();
            } else {
                // If no existing session, load from persistent storage
                String savedMode = settingsLoader.getSavedPermissionMode();
                previousPermissionMode = (savedMode != null) ? savedMode : "bypassPermissions";
                // provider and model use defaults, as frontend syncs these on startup
                previousProvider = "claude";
                previousModel = "claude-sonnet-4-5";
            }
            LOG.info("Preserving session state when loading history: mode=" + previousPermissionMode + ", provider=" + previousProvider + ", model=" + previousModel);

            callJavaScript("clearMessages");

            session = new ClaudeSession(project, claudeSDKBridge);

            // 恢复之前保存的 permission mode、provider、model
            session.setPermissionMode(previousPermissionMode);
            session.setProvider(previousProvider);
            session.setModel(previousModel);
            LOG.info("Restored session state to loaded session: mode=" + previousPermissionMode + ", provider=" + previousProvider + ", model=" + previousModel);

            handlerContext.setSession(session);
            setupSessionCallbacks();

            String workingDir = (projectPath != null && new File(projectPath).exists())
                ? projectPath : determineWorkingDirectory();
            session.setSessionInfo(sessionId, workingDir);

            session.loadFromServer().thenRun(() -> ApplicationManager.getApplication().invokeLater(() -> {}))
                .exceptionally(ex -> {
                    ApplicationManager.getApplication().invokeLater(() ->
                        callJavaScript("addErrorMessage", JsUtils.escapeJs("加载会话失败: " + ex.getMessage())));
                    return null;
                });
        }

        private void setupSessionCallbacks() {
            SessionCallbackFactory.Dependencies deps = new SessionCallbackFactory.Dependencies() {
                @Override
                public StreamingMessageHandler getStreamingHandler() {
                    return streamingHandler;
                }

                @Override
                public SlashCommandManager getSlashCommandManager() {
                    return slashCommandManager;
                }

                @Override
                public void callJavaScript(String function, String... args) {
                    ClaudeChatWindow.this.callJavaScript(function, args);
                }

                @Override
                public void showPermissionDialog(PermissionRequest request) {
                    permissionHandler.showPermissionDialog(request);
                }
            };
            session.setCallback(SessionCallbackFactory.create(deps));
        }

        /**
         * Sends messages to the webview for display.
         * Called by StreamingMessageHandler through the callback.
         */
        private void sendStreamMessagesToWebView(
            List<ClaudeSession.Message> messages,
            Long sequence,
            Runnable afterSendOnEdt
        ) {
            ApplicationManager.getApplication().executeOnPooledThread(() -> {
                final String escapedMessagesJson;
                try {
                    escapedMessagesJson = JsUtils.escapeJs(MessageConverter.convertMessagesToJson(messages));
                } catch (Exception e) {
                    LOG.warn("Failed to serialize messages for streaming update: " + e.getMessage(), e);
                    if (afterSendOnEdt != null) {
                        ApplicationManager.getApplication().invokeLater(afterSendOnEdt);
                    }
                    return;
                }

                ApplicationManager.getApplication().invokeLater(() -> {
                    if (disposed) {
                        return;
                    }

                    // Check sequence is still current (for deduplication)
                    if (sequence != null && !streamingHandler.isSequenceCurrent(sequence)) {
                        return;
                    }

                    callJavaScript("updateMessages", escapedMessagesJson);
                    usageTracker.pushUsageUpdateFromMessages(messages);

                    if (afterSendOnEdt != null) {
                        afterSendOnEdt.run();
                    }
                });
            });
        }

        /**
         * 发送当前权限模式到前端
         * 在前端准备就绪时调用，确保前端显示正确的权限模式
         */
        private void sendCurrentPermissionMode() {
            try {
                String currentMode = "bypassPermissions";  // 默认值

                // 优先从 session 中获取
                if (session != null) {
                    String sessionMode = session.getPermissionMode();
                    if (sessionMode != null && !sessionMode.trim().isEmpty()) {
                        currentMode = sessionMode;
                    }
                }

                final String modeToSend = currentMode;

                ApplicationManager.getApplication().invokeLater(() -> {
                    if (!disposed && browser != null) {
                        callJavaScript("window.onModeReceived", JsUtils.escapeJs(modeToSend));
                    }
                });
            } catch (Exception e) {
                LOG.error("Failed to send current permission mode: " + e.getMessage(), e);
            }
        }

        private void createNewSession() {
            LOG.info("Creating new session...");

            // 保存当前的 permission mode、provider、model（如果存在旧 session）
            String previousPermissionMode = (session != null) ? session.getPermissionMode() : "bypassPermissions";
            String previousProvider = (session != null) ? session.getProvider() : "claude";
            String previousModel = (session != null) ? session.getModel() : "claude-sonnet-4-5";
            LOG.info("Preserving session state: mode=" + previousPermissionMode + ", provider=" + previousProvider + ", model=" + previousModel);

            // 清空前端消息显示（修复新建会话时消息不清空的bug）
            callJavaScript("clearMessages");

            // 先中断旧会话，确保彻底断开旧的连接
            // 使用异步方式等待中断完成，避免竞态条件
            CompletableFuture<Void> interruptFuture = session != null
                ? session.interrupt()
                : CompletableFuture.completedFuture(null);

            interruptFuture.thenRun(() -> {
                LOG.info("Old session interrupted, creating new session");

                // 创建全新的 Session 对象
                session = new ClaudeSession(project, claudeSDKBridge);

                // 恢复之前保存的 permission mode、provider、model
                session.setPermissionMode(previousPermissionMode);
                session.setProvider(previousProvider);
                session.setModel(previousModel);
                LOG.info("Restored session state to new session: mode=" + previousPermissionMode + ", provider=" + previousProvider + ", model=" + previousModel);

                // 更新 HandlerContext 中的 Session 引用（重要：确保所有 Handler 使用新 Session）
                handlerContext.setSession(session);

                // 设置回调
                setupSessionCallbacks();

                // 设置工作目录（sessionId 为 null 表示新会话）
                String workingDirectory = determineWorkingDirectory();
                session.setSessionInfo(null, workingDirectory);

                LOG.info("New session created successfully, working directory: " + workingDirectory);

                // 更新前端状态
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("updateStatus", JsUtils.escapeJs("New session created, you can start asking questions"));

                    // 重置 Token 使用统计
                    usageTracker.resetUsage();
                });
            }).exceptionally(ex -> {
                LOG.error("Failed to create new session: " + ex.getMessage(), ex);
                ApplicationManager.getApplication().invokeLater(() -> {
                    callJavaScript("updateStatus", JsUtils.escapeJs("创建新会话失败: " + ex.getMessage()));
                });
                return null;
            });
        }

        private void interruptDueToPermissionDenial() {
            this.session.interrupt().thenRun(() -> ApplicationManager.getApplication().invokeLater(() -> {}));
        }

        /**
         * 执行 JavaScript 代码（对外公开，用于权限弹窗等功能）.
         *
         * @param jsCode 要执行的 JavaScript 代码
         */
        public void executeJavaScriptCode(String jsCode) {
            if (this.disposed || this.browser == null) {
                return;
            }
            ApplicationManager.getApplication().invokeLater(() -> {
                if (!this.disposed && this.browser != null) {
                    this.browser.getCefBrowser().executeJavaScript(jsCode, this.browser.getCefBrowser().getURL(), 0);
                }
            });
        }

        private void callJavaScript(String functionName, String... args) {
            if (disposed || browser == null) {
                LOG.warn("无法调用 JS 函数 " + functionName + ": disposed=" + disposed + ", browser=" + (browser == null ? "null" : "exists"));
                return;
            }

            ApplicationManager.getApplication().invokeLater(() -> {
                if (disposed || browser == null) {
                    return;
                }
                try {
                    String callee = functionName;
                    if (functionName != null && !functionName.isEmpty() && !functionName.contains(".")) {
                        callee = "window." + functionName;
                    }

                    StringBuilder argsJs = new StringBuilder();
                    if (args != null) {
                        for (int i = 0; i < args.length; i++) {
                            if (i > 0) argsJs.append(", ");
                            String arg = args[i] == null ? "" : args[i];
                            argsJs.append("'").append(arg).append("'");
                        }
                    }

                    String checkAndCall =
                        "(function() {" +
                        "  try {" +
                        "    if (typeof " + callee + " === 'function') {" +
                        "      " + callee + "(" + argsJs + ");" +
                        "      console.log('[Backend->Frontend] Successfully called " + functionName + "');" +
                        "    } else {" +
                        "      console.warn('[Backend->Frontend] Function " + functionName + " not found: ' + (typeof " + callee + "));" +
                        "    }" +
                        "  } catch (e) {" +
                        "    console.error('[Backend->Frontend] Failed to call " + functionName + ":', e);" +
                        "  }" +
                        "})();";

                    browser.getCefBrowser().executeJavaScript(checkAndCall, browser.getCefBrowser().getURL(), 0);
                } catch (Exception e) {
                    LOG.warn("调用 JS 函数失败: " + functionName + ", 错误: " + e.getMessage(), e);
                }
            });
        }

        /**
         * Delegate to CodeSnippetHandler for external access.
         */
        public static void addSelectionFromExternalInternal(Project project, String selectionInfo) {
            CodeSnippetHandler.addSelectionFromExternal(project, selectionInfo);
        }

        /**
         * Get the code snippet handler for this window.
         */
        public CodeSnippetHandler getCodeSnippetHandler() {
            return codeSnippetHandler;
        }

        /**
         * Check if this window has been disposed.
         */
        public boolean isDisposed() {
            return disposed;
        }

        /**
         * Check if this window has been initialized.
         */
        public boolean isInitialized() {
            return initialized;
        }

        /**
         * 发送 QuickFix 消息 - 供 QuickFixWithClaudeAction 调用
         * Send QuickFix message - called by QuickFixWithClaudeAction
         */
        public void sendQuickFixMessage(String prompt, boolean isQuickFix, MessageCallback callback) {
            quickFixHandler.sendQuickFixMessage(prompt, isQuickFix, callback);
        }

        public JPanel getContent() {
            return mainPanel;
        }

        /**
         * Cleanup all Node.js processes managed by this window.
         * Used by shutdown hooks for cleanup during IDE shutdown.
         */
        public void cleanupAllProcesses() {
            if (claudeSDKBridge != null) {
                claudeSDKBridge.cleanupAllProcesses();
            }
        }

        public void dispose() {
            if (disposed) return;

            // Dispose editor context manager
            if (editorContextManager != null) {
                editorContextManager.dispose();
                editorContextManager = null;
            }
            try {
                if (streamingHandler != null) {
                    streamingHandler.dispose();
                }
            } catch (Exception e) {
                LOG.warn("Failed to dispose streaming handler: " + e.getMessage());
            }

            // 清理斜杠命令管理器
            if (slashCommandManager != null) {
                slashCommandManager.dispose();
                slashCommandManager = null;
            }

            // 注销权限服务的 dialogShower 和 askUserQuestionDialogShower，防止内存泄漏
            try {
                PermissionService permissionService = project.getService(PermissionService.class);
                permissionService.unregisterDialogShower(project);
                permissionService.unregisterAskUserQuestionDialogShower(project);
            } catch (Exception e) {
                LOG.warn("Failed to unregister dialog showers: " + e.getMessage());
            }

            LOG.info("开始清理窗口资源，项目: " + project.getName());

            disposed = true;
            handlerContext.setDisposed(true);

            ClaudeSDKToolWindow.unregisterChatWindow(project, this);

            try {
                if (session != null) session.interrupt();
            } catch (Exception e) {
                LOG.warn("清理会话失败: " + e.getMessage());
            }

            // 清理所有活跃的 Node.js 子进程
            try {
                if (claudeSDKBridge != null) {
                    int activeCount = claudeSDKBridge.getActiveProcessCount();
                    if (activeCount > 0) {
                        LOG.info("正在清理 " + activeCount + " 个活跃的 Claude 进程...");
                    }
                    claudeSDKBridge.cleanupAllProcesses();
                }
            } catch (Exception e) {
                LOG.warn("清理 Claude 进程失败: " + e.getMessage());
            }

            try {
                if (browser != null) {
                    browser.dispose();
                    browser = null;
                }
            } catch (Exception e) {
                LOG.warn("清理浏览器失败: " + e.getMessage());
            }

            messageDispatcher.clear();

            LOG.info("窗口资源已完全清理，项目: " + project.getName());
        }
}
