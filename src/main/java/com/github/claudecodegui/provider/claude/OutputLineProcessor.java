package com.github.claudecodegui.provider.claude;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.intellij.openapi.diagnostic.Logger;

/**
 * Processes output lines from Claude SDK Node.js processes.
 * Centralizes the parsing logic for various message types like [MESSAGE], [CONTENT_DELTA], etc.
 */
public class OutputLineProcessor {
    private static final Logger LOG = Logger.getInstance(OutputLineProcessor.class);
    private final Gson gson;

    public OutputLineProcessor(Gson gson) {
        this.gson = gson;
    }

    /**
     * Context object holding state during output processing.
     */
    public static class ProcessingContext {
        public final SDKResult result;
        public final StringBuilder assistantContent;
        public boolean hadSendError = false;
        public String lastNodeError = null;
        public String nodeVersion = null;
        public String nodePath = null;
        public String workDir = null;

        public ProcessingContext(SDKResult result) {
            this.result = result;
            this.assistantContent = new StringBuilder();
        }

        public ProcessingContext(SDKResult result, StringBuilder assistantContent) {
            this.result = result;
            this.assistantContent = assistantContent;
        }

        /**
         * Set diagnostic info for error messages.
         */
        public ProcessingContext withDiagnostics(String nodePath, String nodeVersion, String workDir) {
            this.nodePath = nodePath;
            this.nodeVersion = nodeVersion;
            this.workDir = workDir;
            return this;
        }
    }

    /**
     * Process a single output line from the Node.js process.
     *
     * @param line     The line to process
     * @param context  Processing context with state
     * @param callback Message callback for events
     * @return true if the line was processed, false if it was unrecognized
     */
    public boolean processLine(String line, ProcessingContext context, MessageCallback callback) {
        // Capture error logs
        if (isErrorLine(line)) {
            LOG.warn("[Node.js ERROR] " + line);
            context.lastNodeError = line;
        }

        if (line.startsWith("[MESSAGE]")) {
            processMessageLine(line, context, callback);
            return true;
        } else if (line.startsWith("[SEND_ERROR]")) {
            processSendErrorLine(line, context, callback);
            return true;
        } else if (line.startsWith("[CONTENT]")) {
            processContentLine(line, context, callback);
            return true;
        } else if (line.startsWith("[CONTENT_DELTA]")) {
            processContentDeltaLine(line, context, callback);
            return true;
        } else if (line.startsWith("[THINKING]")) {
            processThinkingLine(line, context, callback);
            return true;
        } else if (line.startsWith("[THINKING_DELTA]")) {
            processThinkingDeltaLine(line, context, callback);
            return true;
        } else if (line.startsWith("[STREAM_START]")) {
            callback.onMessage("stream_start", "");
            return true;
        } else if (line.startsWith("[STREAM_END]")) {
            callback.onMessage("stream_end", "");
            return true;
        } else if (line.startsWith("[SESSION_ID]")) {
            String capturedSessionId = line.substring("[SESSION_ID]".length()).trim();
            callback.onMessage("session_id", capturedSessionId);
            return true;
        } else if (line.startsWith("[SLASH_COMMANDS]")) {
            String slashCommandsJson = line.substring("[SLASH_COMMANDS]".length()).trim();
            callback.onMessage("slash_commands", slashCommandsJson);
            return true;
        } else if (line.startsWith("[TOOL_RESULT]")) {
            String toolResultJson = line.substring("[TOOL_RESULT]".length()).trim();
            callback.onMessage("tool_result", toolResultJson);
            return true;
        } else if (line.startsWith("[MESSAGE_START]")) {
            callback.onMessage("message_start", "");
            return true;
        } else if (line.startsWith("[MESSAGE_END]")) {
            callback.onMessage("message_end", "");
            return true;
        }

        return false;
    }

    /**
     * Check if a line is an error log line.
     */
    public boolean isErrorLine(String line) {
        return line.startsWith("[UNCAUGHT_ERROR]")
                || line.startsWith("[UNHANDLED_REJECTION]")
                || line.startsWith("[COMMAND_ERROR]")
                || line.startsWith("[STARTUP_ERROR]")
                || line.startsWith("[ERROR]")
                || line.startsWith("[STDIN_ERROR]")
                || line.startsWith("[STDIN_PARSE_ERROR]")
                || line.startsWith("[GET_SESSION_ERROR]")
                || line.startsWith("[PERSIST_ERROR]");
    }

    private void processMessageLine(String line, ProcessingContext context, MessageCallback callback) {
        String jsonStr = line.substring("[MESSAGE]".length()).trim();
        try {
            JsonObject msg = gson.fromJson(jsonStr, JsonObject.class);
            context.result.messages.add(msg);
            String type = msg.has("type") ? msg.get("type").getAsString() : "unknown";
            callback.onMessage(type, jsonStr);
        } catch (Exception e) {
            // JSON parse failed, skip
        }
    }

    private void processSendErrorLine(String line, ProcessingContext context, MessageCallback callback) {
        String jsonStr = line.substring("[SEND_ERROR]".length()).trim();
        String errorMessage = jsonStr;
        try {
            JsonObject obj = gson.fromJson(jsonStr, JsonObject.class);
            if (obj.has("error")) {
                errorMessage = obj.get("error").getAsString();
            }
        } catch (Exception ignored) {
        }

        // Add diagnostics to error message if available
        if (context.nodePath != null || context.nodeVersion != null || context.workDir != null) {
            StringBuilder diagMsg = new StringBuilder();
            diagMsg.append(errorMessage);
            diagMsg.append("\n\n**【Environment Diagnostics】**  \n");
            if (context.nodePath != null) {
                diagMsg.append("  Node.js path: `").append(context.nodePath).append("`  \n");
            }
            if (context.nodeVersion != null) {
                diagMsg.append("  Node.js version: ").append(context.nodeVersion).append("  \n");
            } else {
                diagMsg.append("  Node.js version: ❌ unknown  \n");
            }
            if (context.workDir != null) {
                diagMsg.append("  SDK directory: `").append(context.workDir).append("`  \n");
            }
            errorMessage = diagMsg.toString();
        }

        context.hadSendError = true;
        context.result.success = false;
        context.result.error = errorMessage;
        callback.onError(errorMessage);
    }

    private void processContentLine(String line, ProcessingContext context, MessageCallback callback) {
        String content = line.substring("[CONTENT]".length()).trim();
        context.assistantContent.append(content);
        callback.onMessage("content", content);
    }

    private void processContentDeltaLine(String line, ProcessingContext context, MessageCallback callback) {
        String rawDelta = line.substring("[CONTENT_DELTA]".length());
        String jsonStr = rawDelta.startsWith(" ") ? rawDelta.substring(1) : rawDelta;
        String delta;
        try {
            // JSON decode to restore newlines and special characters
            delta = gson.fromJson(jsonStr, String.class);
        } catch (Exception e) {
            // Fallback to raw string if parsing fails
            delta = jsonStr;
        }
        context.assistantContent.append(delta);
        callback.onMessage("content_delta", delta);
    }

    private void processThinkingLine(String line, ProcessingContext context, MessageCallback callback) {
        String thinkingContent = line.substring("[THINKING]".length()).trim();
        callback.onMessage("thinking", thinkingContent);
    }

    private void processThinkingDeltaLine(String line, ProcessingContext context, MessageCallback callback) {
        String rawDelta = line.substring("[THINKING_DELTA]".length());
        String jsonStr = rawDelta.startsWith(" ") ? rawDelta.substring(1) : rawDelta;
        String thinkingDelta;
        try {
            thinkingDelta = gson.fromJson(jsonStr, String.class);
        } catch (Exception e) {
            thinkingDelta = jsonStr;
        }
        callback.onMessage("thinking_delta", thinkingDelta);
    }
}
