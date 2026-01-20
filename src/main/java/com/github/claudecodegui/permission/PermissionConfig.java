package com.github.claudecodegui.permission;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class PermissionConfig {

    public static final Set<String> CONTROLLED_TOOLS = new HashSet<>(Arrays.asList(
        "Write",
        "Edit",
        "Delete",
        "CreateDirectory",
        "MoveFile",
        "CopyFile",
        "Rename",
        "Bash",
        "ExecuteCommand",
        "RunCode",
        "SystemCommand",
        "InstallPackage",
        "UninstallPackage",
        "UpdatePackage",
        "HttpRequest",
        "Download",
        "Upload",
        "GitCommit",
        "GitPush",
        "GitPull",
        "GitMerge",
        "GitCheckout",
        "DatabaseQuery",
        "DatabaseUpdate",
        "DatabaseDelete"
    ));

    public static final Set<String> HIGH_RISK_TOOLS = new HashSet<>(Arrays.asList(
        "Delete",
        "DatabaseDelete",
        "GitPush",
        "SystemCommand",
        "UninstallPackage"
    ));

    public static final Set<String> SAFE_TOOLS = new HashSet<>(Arrays.asList(
        "Read",
        "List",
        "Search",
        "Grep",
        "Find"
    ));

    public static boolean requiresPermission(String toolName) {
        return CONTROLLED_TOOLS.contains(toolName);
    }

    public static boolean isHighRisk(String toolName) {
        return HIGH_RISK_TOOLS.contains(toolName);
    }

    public static boolean isSafe(String toolName) {
        return SAFE_TOOLS.contains(toolName);
    }

    public static String getRiskLevel(String toolName) {
        if (isHighRisk(toolName)) {
            return "High Risk";
        } else if (requiresPermission(toolName)) {
            return "Requires Permission";
        } else if (isSafe(toolName)) {
            return "Safe";
        } else {
            return "Unknown";
        }
    }

    public static class DefaultSettings {
        public static boolean ENABLED = true;
        public static boolean ALWAYS_ASK_HIGH_RISK = true;
        public static long MEMORY_TIMEOUT = 3600000;
        public static int MAX_MEMORY_ENTRIES = 100;
        public static boolean LOG_PERMISSIONS = true;
        public static boolean SKIP_IN_DEV_MODE = false;
    }
}
