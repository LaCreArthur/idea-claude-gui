package com.github.claudecodegui.util;

import com.github.claudecodegui.model.PathCheckResult;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class PathUtils {

    private static final int WINDOWS_MAX_PATH = 260;
    private static final int SAFE_PATH_LENGTH = 200;

    public static String sanitizePath(String path) {
        if (path == null || path.isEmpty()) {
            return "";
        }
        return path.replaceAll("[^a-zA-Z0-9]", "-");
    }

    public static String normalizeToUnix(String path) {
        if (path == null || path.isEmpty()) {
            return "";
        }
        return path.replace("\\", "/");
    }

    public static String normalizeToPlatform(String path) {
        if (path == null || path.isEmpty()) {
            return "";
        }
        if (PlatformUtils.isWindows()) {
            return path.replace("/", "\\");
        } else {
            return path.replace("\\", "/");
        }
    }

    public static boolean isWindowsPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        return path.matches("^[a-zA-Z]:.*");
    }

    public static boolean isUncPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        return path.startsWith("\\\\") || path.startsWith("//");
    }

    public static PathCheckResult checkPathLength(String path) {
        if (path == null || path.isEmpty()) {
            return PathCheckResult.ok();
        }

        if (!PlatformUtils.isWindows()) {
            return PathCheckResult.ok();
        }

        int pathLength = path.length();

        if (pathLength >= WINDOWS_MAX_PATH) {
            return PathCheckResult.error(
                "Project path too long (" + pathLength + " characters)\n" +
                "Windows limits path length to 260 characters.\n" +
                "Suggestion: Move project to a shorter path, e.g., D:\\projects\\",
                path,
                pathLength
            );
        }

        if (pathLength >= SAFE_PATH_LENGTH) {
            return PathCheckResult.warning(
                "Project path is long (" + pathLength + " characters)\n" +
                "May exceed Windows path limit when creating deeply nested files.",
                path,
                pathLength
            );
        }

        return PathCheckResult.ok(path, pathLength);
    }

    public static List<String> getTempPaths() {
        Set<String> paths = new HashSet<>();

        String javaTmpDir = System.getProperty("java.io.tmpdir");
        if (javaTmpDir != null && !javaTmpDir.isEmpty()) {
            paths.add(normalizeToUnix(javaTmpDir).toLowerCase());
        }

        if (PlatformUtils.isWindows()) {
            String temp = PlatformUtils.getEnvIgnoreCase("TEMP");
            if (temp != null && !temp.isEmpty()) {
                paths.add(normalizeToUnix(temp).toLowerCase());
            }

            String tmp = PlatformUtils.getEnvIgnoreCase("TMP");
            if (tmp != null && !tmp.isEmpty()) {
                paths.add(normalizeToUnix(tmp).toLowerCase());
            }

            String localAppData = PlatformUtils.getEnvIgnoreCase("LOCALAPPDATA");
            if (localAppData != null && !localAppData.isEmpty()) {
                paths.add(normalizeToUnix(localAppData + "\\Temp").toLowerCase());
            }

            paths.add("c:/windows/temp");
        } else {
            paths.add("/tmp");
            paths.add("/var/tmp");
            paths.add("/private/tmp");

            String tmpDir = System.getenv("TMPDIR");
            if (tmpDir != null && !tmpDir.isEmpty()) {
                paths.add(normalizeToUnix(tmpDir).toLowerCase());
            }
        }

        return new ArrayList<>(paths);
    }

    public static boolean isTempDirectory(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }

        String normalizedPath = normalizeToUnix(path).toLowerCase();
        List<String> tempPaths = getTempPaths();

        for (String tempPath : tempPaths) {
            if (tempPath != null && normalizedPath.startsWith(tempPath)) {
                return true;
            }
        }

        return false;
    }

    public static boolean isWritable(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        File file = new File(path);
        return file.exists() && file.canWrite();
    }

    public static boolean exists(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        return new File(path).exists();
    }

    public static String getParentPath(String path) {
        if (path == null || path.isEmpty()) {
            return null;
        }
        File file = new File(path);
        File parent = file.getParentFile();
        return parent != null ? parent.getAbsolutePath() : null;
    }

    public static String joinPath(String basePath, String relativePath) {
        if (basePath == null || basePath.isEmpty()) {
            return relativePath;
        }
        if (relativePath == null || relativePath.isEmpty()) {
            return basePath;
        }
        return new File(basePath, relativePath).getAbsolutePath();
    }
}
