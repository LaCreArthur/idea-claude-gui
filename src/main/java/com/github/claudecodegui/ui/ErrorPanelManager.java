package com.github.claudecodegui.ui;

import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.awt.*;

/**
 * Factory for building error and status panels.
 * Simplified in Phase 2 — Node.js error panels removed (no longer needed).
 */
public class ErrorPanelManager {
    private static final Logger LOG = Logger.getInstance(ErrorPanelManager.class);

    // Common dark theme colors
    private static final Color BG_DARK = new Color(30, 30, 30);
    private static final Color TEXT_LIGHT = new Color(200, 200, 200);

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

        JLabel iconLabel = new JLabel("\u26A0\uFE0F");
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
            "\u2022 Using an IDE version or runtime that doesn't support JCEF\n" +
            "\u2022 IDE started with -Dide.browser.jcef.enabled=false parameter\n" +
            "\u2022 System missing required dependencies\n\n" +
            "Solutions:\n" +
            "1. Ensure you're using IntelliJ IDEA version 2020.2+\n" +
            "2. Check IDE settings: Help \u2192 Find Action \u2192 Registry,\n" +
            "   ensure ide.browser.jcef.enabled is true\n" +
            "3. Try restarting the IDE\n" +
            "4. If using JetBrains Runtime, ensure the version supports JCEF"
        );
        messageArea.setEditable(false);
        messageArea.setBackground(new Color(45, 45, 45));
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
}
