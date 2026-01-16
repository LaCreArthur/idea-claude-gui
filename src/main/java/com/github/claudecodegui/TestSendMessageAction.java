package com.github.claudecodegui;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import org.jetbrains.annotations.NotNull;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Test action to send messages to Claude GUI webview for E2E testing.
 * Only works when -Dclaude.test.mode=true is set.
 *
 * Reads command from /tmp/claude-gui-test-command.txt and executes it.
 * After execution, deletes the command file.
 *
 * Command file format:
 * - Line 1: Command type (send_message, click_option, execute_js)
 * - Line 2+: Command payload
 *
 * Example for sending a message:
 * send_message
 * Hello Claude, please ask me a question using AskUser
 */
public class TestSendMessageAction extends AnAction {

    private static final Logger LOG = Logger.getInstance(TestSendMessageAction.class);
    private static final String COMMAND_FILE = "/tmp/claude-gui-test-command.txt";

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        if (!Boolean.getBoolean("claude.test.mode")) {
            LOG.warn("[TestAction] Test mode not enabled. Set -Dclaude.test.mode=true");
            return;
        }

        Project project = e.getProject();
        if (project == null) {
            LOG.error("[TestAction] Project is null");
            return;
        }

        ClaudeSDKToolWindow.ClaudeChatWindow chatWindow = ClaudeSDKToolWindow.getChatWindow(project);
        if (chatWindow == null) {
            LOG.error("[TestAction] Chat window not found");
            return;
        }

        Path commandPath = Paths.get(COMMAND_FILE);
        if (!Files.exists(commandPath)) {
            LOG.info("[TestAction] No command file found at " + COMMAND_FILE);
            return;
        }

        try {
            String content = Files.readString(commandPath);
            String[] lines = content.split("\n", 2);

            if (lines.length < 1) {
                LOG.error("[TestAction] Empty command file");
                return;
            }

            String command = lines[0].trim();
            String payload = lines.length > 1 ? lines[1].trim() : "";

            LOG.info("[TestAction] Executing command: " + command);

            switch (command) {
                case "send_message":
                    sendMessage(chatWindow, payload);
                    break;
                case "click_option":
                    clickOption(chatWindow, payload);
                    break;
                case "execute_js":
                    chatWindow.executeJavaScriptCode(payload);
                    break;
                case "get_state":
                    getState(chatWindow);
                    break;
                default:
                    LOG.warn("[TestAction] Unknown command: " + command);
            }

            // Delete command file after execution
            Files.delete(commandPath);
            LOG.info("[TestAction] Command executed and file deleted");

        } catch (IOException ex) {
            LOG.error("[TestAction] Failed to read command file", ex);
        }
    }

    private void sendMessage(ClaudeSDKToolWindow.ClaudeChatWindow chatWindow, String message) {
        // Escape message for JavaScript
        String escapedMessage = message.replace("\\", "\\\\")
                                       .replace("\"", "\\\"")
                                       .replace("\n", "\\n");

        String js = String.format(
            "if (window.sendToJava) { " +
            "  window.sendToJava('send_message:{\"message\":\"%s\",\"provider\":\"claude\"}'); " +
            "  console.log('[TestAction] Message sent: %s'); " +
            "} else { " +
            "  console.error('[TestAction] sendToJava not available'); " +
            "}",
            escapedMessage, escapedMessage
        );

        chatWindow.executeJavaScriptCode(js);
        LOG.info("[TestAction] Sent message: " + message);
    }

    private void clickOption(ClaudeSDKToolWindow.ClaudeChatWindow chatWindow, String optionIndex) {
        // Click on an option in AskUser dialog
        String js = String.format(
            "(() => { " +
            "  const buttons = document.querySelectorAll('[data-testid=\"ask-user-option\"], .ask-user-option, button'); " +
            "  const index = %s; " +
            "  if (buttons[index]) { " +
            "    buttons[index].click(); " +
            "    console.log('[TestAction] Clicked option ' + index); " +
            "  } else { " +
            "    console.error('[TestAction] Option not found at index ' + index); " +
            "  } " +
            "})();",
            optionIndex
        );

        chatWindow.executeJavaScriptCode(js);
        LOG.info("[TestAction] Clicked option: " + optionIndex);
    }

    private void getState(ClaudeSDKToolWindow.ClaudeChatWindow chatWindow) {
        // Write current state to /tmp/claude-gui-test-state.json
        String js =
            "(() => { " +
            "  const state = { " +
            "    testMode: window.__testMode || false, " +
            "    messageLog: window.__testMessageLog || [], " +
            "    hasAskUserDialog: !!document.querySelector('[data-testid=\"ask-user-dialog\"], .ask-user-dialog'), " +
            "    messageCount: document.querySelectorAll('.message, [data-testid=\"message\"]').length " +
            "  }; " +
            "  console.log('[TestAction] State: ' + JSON.stringify(state)); " +
            "  if (window.sendToJava) { " +
            "    window.sendToJava('test_state:' + JSON.stringify(state)); " +
            "  } " +
            "})();";

        chatWindow.executeJavaScriptCode(js);
        LOG.info("[TestAction] Requested state");
    }

    @Override
    public void update(@NotNull AnActionEvent e) {
        // Only enable in test mode
        boolean testMode = Boolean.getBoolean("claude.test.mode");
        e.getPresentation().setEnabledAndVisible(testMode);
    }
}
