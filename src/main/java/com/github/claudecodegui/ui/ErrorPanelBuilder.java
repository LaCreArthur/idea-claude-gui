package com.github.claudecodegui.ui;

import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.diagnostic.Logger;

import javax.swing.*;
import java.awt.*;
import java.util.function.Consumer;

/**
 * Error panel builder for environment check failures and other error messages.
 */
public class ErrorPanelBuilder {

    private static final Logger LOG = Logger.getInstance(ErrorPanelBuilder.class);
    private static final String NODE_PATH_PROPERTY_KEY = "claude.code.node.path";

    /**
     * Build an error panel with Node.js path input.
     * @param title Panel title
     * @param message Error message
     * @param currentNodePath Currently detected Node.js path
     * @param onSaveAndRetry Save callback (parameter is user-entered path, may be null or empty)
     * @return Error panel
     */
    public static JPanel build(String title, String message, String currentNodePath, Consumer<String> onSaveAndRetry) {
        JPanel errorPanel = new JPanel(new BorderLayout());
        errorPanel.setBackground(new Color(30, 30, 30));

        // Title
        JLabel titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
        titleLabel.setForeground(Color.WHITE);
        titleLabel.setBorder(BorderFactory.createEmptyBorder(20, 20, 10, 20));

        // Error message area
        JTextArea textArea = new JTextArea(message);
        textArea.setEditable(false);
        textArea.setFont(new Font("Monospaced", Font.PLAIN, 12));
        textArea.setBackground(new Color(40, 40, 40));
        textArea.setForeground(new Color(220, 220, 220));
        textArea.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        textArea.setLineWrap(true);
        textArea.setWrapStyleWord(true);

        errorPanel.add(titleLabel, BorderLayout.NORTH);
        errorPanel.add(new JScrollPane(textArea), BorderLayout.CENTER);

        // Bottom: Manual Node.js path input
        JPanel bottomPanel = new JPanel();
        bottomPanel.setLayout(new BoxLayout(bottomPanel, BoxLayout.Y_AXIS));
        bottomPanel.setBorder(BorderFactory.createEmptyBorder(10, 20, 20, 20));
        bottomPanel.setBackground(new Color(30, 30, 30));

        JLabel nodeLabel = new JLabel("Node.js path (Note: Restart IDE after saving):");
        nodeLabel.setForeground(Color.WHITE);
        nodeLabel.setAlignmentX(Component.LEFT_ALIGNMENT);

        JTextField nodeField = new JTextField();
        nodeField.setMaximumSize(new Dimension(Integer.MAX_VALUE, 30));
        nodeField.setAlignmentX(Component.LEFT_ALIGNMENT);

        // Pre-fill with saved path or currently detected path
        try {
            PropertiesComponent props = PropertiesComponent.getInstance();
            String savedNodePath = props.getValue(NODE_PATH_PROPERTY_KEY);
            if (savedNodePath != null && !savedNodePath.trim().isEmpty()) {
                nodeField.setText(savedNodePath.trim());
            } else if (currentNodePath != null) {
                nodeField.setText(currentNodePath);
            }
        } catch (Exception e) {
            LOG.warn("Failed to preload Node.js path: " + e.getMessage());
        }

        JButton saveAndRetryButton = new JButton("Save");
        saveAndRetryButton.setAlignmentX(Component.LEFT_ALIGNMENT);
        saveAndRetryButton.addActionListener(e -> {
            String manualPath = nodeField.getText();
            if (manualPath != null) {
                manualPath = manualPath.trim();
            }
            if (manualPath != null && manualPath.isEmpty()) {
                manualPath = null;
            }
            onSaveAndRetry.accept(manualPath);
        });

        bottomPanel.add(nodeLabel);
        bottomPanel.add(Box.createRigidArea(new Dimension(0, 5)));
        bottomPanel.add(nodeField);
        bottomPanel.add(Box.createRigidArea(new Dimension(0, 10)));
        bottomPanel.add(saveAndRetryButton);

        errorPanel.add(bottomPanel, BorderLayout.SOUTH);

        return errorPanel;
    }

    /**
     * Build a simple error panel (without Node.js path input).
     */
    public static JPanel buildSimple(String title, String message) {
        JPanel errorPanel = new JPanel(new BorderLayout());
        errorPanel.setBackground(new Color(30, 30, 30));

        JLabel titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
        titleLabel.setForeground(Color.WHITE);
        titleLabel.setBorder(BorderFactory.createEmptyBorder(20, 20, 10, 20));

        JTextArea textArea = new JTextArea(message);
        textArea.setEditable(false);
        textArea.setFont(new Font("Monospaced", Font.PLAIN, 12));
        textArea.setBackground(new Color(40, 40, 40));
        textArea.setForeground(new Color(220, 220, 220));
        textArea.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        textArea.setLineWrap(true);
        textArea.setWrapStyleWord(true);

        errorPanel.add(titleLabel, BorderLayout.NORTH);
        errorPanel.add(new JScrollPane(textArea), BorderLayout.CENTER);

        return errorPanel;
    }
}
