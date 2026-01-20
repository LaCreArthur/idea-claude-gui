package com.github.claudecodegui.provider.claude;

/**
 * Utility class for parsing JSON output from Claude CLI commands.
 * Handles multi-line output where JSON may be mixed with log messages.
 */
public final class JsonOutputParser {

    private JsonOutputParser() {
        // Utility class - prevent instantiation
    }

    /**
     * Extract the last complete JSON object from multi-line output.
     * Claude CLI often outputs log messages before the actual JSON response.
     *
     * @param outputStr The raw output string which may contain multiple lines
     * @return The extracted JSON string, or null if no valid JSON found
     */
    public static String extractLastJsonLine(String outputStr) {
        if (outputStr == null || outputStr.isEmpty()) {
            return null;
        }

        // First, try to find a complete JSON object on a single line (most common case)
        String[] lines = outputStr.split("\\r?\\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.startsWith("{") && line.endsWith("}")) {
                return line;
            }
        }

        // If the entire output is a JSON object
        if (outputStr.startsWith("{") && outputStr.endsWith("}")) {
            return outputStr;
        }

        // Last resort: find the first { and return everything after
        int jsonStart = outputStr.indexOf("{");
        if (jsonStart != -1) {
            return outputStr.substring(jsonStart);
        }

        return null;
    }
}
