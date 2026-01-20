package com.github.claudecodegui.util;

public class JsUtils {

    public static String escapeJs(String str) {
        if (str == null) {
            return "";
        }
        return str
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    public static String buildJsCall(String functionName, String... args) {
        StringBuilder js = new StringBuilder();
        js.append("if (typeof ").append(functionName).append(" === 'function') { ");
        js.append(functionName).append("(");

        for (int i = 0; i < args.length; i++) {
            if (i > 0) js.append(", ");
            js.append("'").append(args[i]).append("'");
        }

        js.append("); }");
        return js.toString();
    }

    public static String buildSafeJsCall(String objectPath, String... args) {
        StringBuilder js = new StringBuilder();
        js.append("if (").append(objectPath).append(") { ");
        js.append(objectPath).append("(");

        for (int i = 0; i < args.length; i++) {
            if (i > 0) js.append(", ");
            js.append("'").append(args[i]).append("'");
        }

        js.append("); }");
        return js.toString();
    }
}
