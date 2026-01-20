package com.github.claudecodegui.ui;

import com.github.claudecodegui.bridge.NodeDetector;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.awt.*;
import java.util.function.Consumer;

/**
 * Factory for building error and status panels.
 * Extracted from ClaudeChatWindow to reduce file size.
 */
public class ErrorPanelManager {
    private static final Logger LOG = Logger.getInstance(ErrorPanelManager.class);

    // Common dark theme colors
    private static final Color BG_DARK = new Color(30, 30, 30);
    private static final Color BG_PANEL = new Color(45, 45, 45);
    private static final Color TEXT_LIGHT = new Color(200, 200, 200);
    private static final Color TEXT_DIM = new Color(180, 180, 180);

    /**
     * Build error panel for missing Node.js.
     */
    public static JPanel buildNodeNotFoundPanel(String currentNodePath, Consumer<String> onSave) {
        String message = "Cannot find Node.js (restart IDE after saving path below)\n\n" +
            "Please ensure:\n" +
            "• Node.js is installed (run in terminal: node --version)\n\n" +
            "If auto-detection fails, run this command to get Node.js path:\n" +
            "    node -p \"process.execPath\"\n\n" +
            "Currently detected Node.js path: " + currentNodePath;

        return ErrorPanelBuilder.build(
            "Environment Check Failed",
            message,
            currentNodePath,
            onSave
        );
    }

    /**
     * Build error panel for outdated Node.js version.
     */
    public static JPanel buildVersionErrorPanel(String currentVersion, String currentNodePath, Consumer<String> onSave) {
        int minVersion = NodeDetector.MIN_NODE_MAJOR_VERSION;
        String message = "Node.js version is too low\n\n" +
            "Current version: " + currentVersion + "\n" +
            "Minimum required: v" + minVersion + "\n\n" +
            "Please upgrade Node.js to v" + minVersion + " or higher and try again.\n\n" +
            "Currently detected Node.js path: " + currentNodePath;

        return ErrorPanelBuilder.build(
            "Node.js Version Requirement Not Met",
            message,
            currentNodePath,
            onSave
        );
    }

    /**
     * Build error panel for invalid saved Node.js path.
     */
    public static JPanel buildInvalidNodePathPanel(String path, String errMsg, Consumer<String> onSave) {
        String message = "Saved Node.js path is not valid: " + path + "\n\n" +
            (errMsg != null ? errMsg + "\n\n" : "") +
            "Please save the correct Node.js path below.";

        return ErrorPanelBuilder.build(
            "Node.js Path Not Valid",
            message,
            path,
            onSave
        );
    }

    /**
     * Build error panel for bridge initialization failure.
     */
    public static JPanel buildBridgeErrorPanel(String nodePath, String nodeVersion, Consumer<String> onSave) {
        boolean nodeOk = nodePath != null && nodeVersion != null;

        String message;
        String title;

        if (nodeOk) {
            // Node.js is fine, the issue is with the bridge
            title = "AI Bridge Setup Failed";
            message = "The AI Bridge component could not be initialized.\n\n" +
                "This usually resolves itself on restart. Please try:\n" +
                "1. Click Save below (even without changes)\n" +
                "2. Restart the IDE\n\n" +
                "If the problem persists, try reinstalling the plugin.\n\n" +
                "Node.js: " + nodePath + " (" + nodeVersion + ")";
        } else {
            // Node.js issue
            title = "Node.js Not Found";
            message = "Cannot find Node.js (restart IDE after saving path below)\n\n" +
                "Please ensure:\n" +
                "• Node.js is installed (run in terminal: node --version)\n\n" +
                "If auto-detection fails, run this command to get Node.js path:\n" +
                "    node -p \"process.execPath\"\n\n" +
                "Currently detected Node.js path: " + nodePath;
        }

        return ErrorPanelBuilder.build(title, message, nodePath, onSave);
    }

    /**
     * Build panel for JCEF not supported.
     */
    public static JPanel buildJcefNotSupportedPanel() {
        JPanel errorPanel = new JPanel(new BorderLayout());
        errorPanel.setBackground(BG_DARK);

        JPanel centerPanel = new JPanel();
        centerPanel.setLayout(new BoxLayout(centerPanel, BoxLayout.Y_AXIS));
        centerPanel.setBackground(BG_DARK);
        centerPanel.setBorder(BorderFactory.createEmptyBorder(50, 50, 50, 50));

        JLabel iconLabel = new JLabel("⚠️");
        iconLabel.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 48));
        iconLabel.setForeground(Color.WHITE);
        iconLabel.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel titleLabel = new JLabel("JCEF Not Available");
        titleLabel.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 18));
        titleLabel.setForeground(Color.WHITE);
        titleLabel.setAlignmentX(Component.CENTER_ALIGNMENT);

        JTextArea messageArea = new JTextArea();
        messageArea.setText(
            "Current environment does not support JCEF (Java Chromium Embedded Framework).\n\n" +
            "Possible causes:\n" +
            "• Using an IDE version or runtime that doesn't support JCEF\n" +
            "• IDE started with -Dide.browser.jcef.enabled=false parameter\n" +
            "• System missing required dependencies\n\n" +
            "Solutions:\n" +
            "1. Ensure you're using IntelliJ IDEA version 2020.2+\n" +
            "2. Check IDE settings: Help → Find Action → Registry,\n" +
            "   ensure ide.browser.jcef.enabled is true\n" +
            "3. Try restarting the IDE\n" +
            "4. If using JetBrains Runtime, ensure the version supports JCEF"
        );
        messageArea.setEditable(false);
        messageArea.setBackground(BG_PANEL);
        messageArea.setForeground(TEXT_LIGHT);
        messageArea.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        messageArea.setBorder(BorderFactory.createEmptyBorder(15, 15, 15, 15));
        messageArea.setAlignmentX(Component.CENTER_ALIGNMENT);
        messageArea.setMaximumSize(new Dimension(500, 300));

        centerPanel.add(iconLabel);
        centerPanel.add(Box.createVerticalStrut(15));
        centerPanel.add(titleLabel);
        centerPanel.add(Box.createVerticalStrut(20));
        centerPanel.add(messageArea);

        errorPanel.add(centerPanel, BorderLayout.CENTER);
        return errorPanel;
    }

    /**
     * Build loading panel shown during bridge extraction.
     */
    public static JPanel buildLoadingPanel() {
        JPanel loadingPanel = new JPanel(new BorderLayout());
        loadingPanel.setBackground(BG_DARK);

        JPanel centerPanel = new JPanel();
        centerPanel.setLayout(new BoxLayout(centerPanel, BoxLayout.Y_AXIS));
        centerPanel.setBackground(BG_DARK);
        centerPanel.setBorder(BorderFactory.createEmptyBorder(100, 50, 100, 50));

        // Loading icon/spinner placeholder
        JLabel iconLabel = new JLabel("⏳");
        iconLabel.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 48));
        iconLabel.setForeground(Color.WHITE);
        iconLabel.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel titleLabel = new JLabel("Preparing AI Bridge...");
        titleLabel.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 16));
        titleLabel.setForeground(Color.WHITE);
        titleLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        titleLabel.setHorizontalAlignment(SwingConstants.CENTER);

        JLabel descLabel = new JLabel("<html><center>First-time setup: extracting AI Bridge components.<br>This only happens once.</center></html>");
        descLabel.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 12));
        descLabel.setForeground(TEXT_DIM);
        descLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        descLabel.setHorizontalAlignment(SwingConstants.CENTER);

        centerPanel.add(iconLabel);
        centerPanel.add(Box.createVerticalStrut(20));
        centerPanel.add(titleLabel);
        centerPanel.add(Box.createVerticalStrut(10));
        centerPanel.add(descLabel);

        loadingPanel.add(centerPanel, BorderLayout.CENTER);

        LOG.info("[ErrorPanelManager] Built loading panel for bridge extraction");
        return loadingPanel;
    }
}
