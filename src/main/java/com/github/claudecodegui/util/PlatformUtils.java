package com.github.claudecodegui.util;

import com.intellij.openapi.diagnostic.Logger;

import java.io.File;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class PlatformUtils {

    private static final Logger LOG = Logger.getInstance(PlatformUtils.class);
    private static volatile PlatformType cachedPlatformType = null;

    public enum PlatformType {
        WINDOWS,
        MACOS,
        LINUX,
        UNKNOWN
    }

    public static PlatformType getPlatformType() {
        if (cachedPlatformType == null) {
            String osName = System.getProperty("os.name", "").toLowerCase();
            if (osName.contains("win")) {
                cachedPlatformType = PlatformType.WINDOWS;
            } else if (osName.contains("mac") || osName.contains("darwin")) {
                cachedPlatformType = PlatformType.MACOS;
            } else if (osName.contains("linux") || osName.contains("nix") || osName.contains("nux")) {
                cachedPlatformType = PlatformType.LINUX;
            } else {
                cachedPlatformType = PlatformType.UNKNOWN;
            }
        }
        return cachedPlatformType;
    }

    public static boolean isWindows() {
        return getPlatformType() == PlatformType.WINDOWS;
    }

    public static boolean isMac() {
        return getPlatformType() == PlatformType.MACOS;
    }

    public static boolean isLinux() {
        return getPlatformType() == PlatformType.LINUX;
    }

    public static String getEnvIgnoreCase(String name) {
        if (name == null) {
            return null;
        }

        String value = System.getenv(name);
        if (value != null) {
            return value;
        }

        if (isWindows()) {
            for (Map.Entry<String, String> entry : System.getenv().entrySet()) {
                if (entry.getKey().equalsIgnoreCase(name)) {
                    return entry.getValue();
                }
            }
        }

        return null;
    }

    public static String getPathEnv() {
        return getEnvIgnoreCase("PATH");
    }

    public static boolean deleteWithRetry(File file, int maxRetries) {
        if (file == null || !file.exists()) {
            return true;
        }

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            if (file.delete()) {
                return true;
            }

            if (attempt < maxRetries - 1) {
                try {
                    long waitTime = 200L * (1L << attempt);
                    Thread.sleep(waitTime);
                    System.gc();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        LOG.warn("File deletion failed (may be locked): " + file.getAbsolutePath());
        return false;
    }

    public static boolean deleteDirectoryWithRetry(File directory, int maxRetries) {
        if (directory == null || !directory.exists()) {
            return true;
        }

        if (directory.isFile()) {
            return deleteWithRetry(directory, maxRetries);
        }

        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (!deleteDirectoryWithRetry(file, maxRetries)) {
                    return false;
                }
            }
        }

        return deleteWithRetry(directory, maxRetries);
    }

    public static void terminateProcess(Process process) {
        if (process == null || !process.isAlive()) {
            return;
        }

        try {
            if (isWindows()) {
                long pid = process.pid();
                ProcessBuilder pb = new ProcessBuilder(
                    "taskkill", "/F", "/T", "/PID", String.valueOf(pid)
                );
                pb.redirectErrorStream(true);
                Process killer = pb.start();
                boolean finished = killer.waitFor(5, TimeUnit.SECONDS);
                if (!finished) {
                    killer.destroyForcibly();
                }
            } else {
                process.destroy();
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                }
            }
        } catch (Exception e) {
            try {
                process.destroyForcibly();
            } catch (Exception ignored) {
            }
        }
    }

    public static boolean terminateProcessTree(long pid) {
        try {
            if (isWindows()) {
                ProcessBuilder pb = new ProcessBuilder(
                    "taskkill", "/F", "/T", "/PID", String.valueOf(pid)
                );
                pb.redirectErrorStream(true);
                Process killer = pb.start();
                return killer.waitFor(5, TimeUnit.SECONDS);
            } else {
                ProcessBuilder pb = new ProcessBuilder(
                    "kill", "-9", String.valueOf(pid)
                );
                pb.redirectErrorStream(true);
                Process killer = pb.start();
                return killer.waitFor(3, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            LOG.warn("Failed to terminate process (PID: " + pid + "): " + e.getMessage());
            return false;
        }
    }

    public static String getOsName() {
        return System.getProperty("os.name", "Unknown");
    }

    public static String getOsVersion() {
        return System.getProperty("os.version", "Unknown");
    }

    public static String getHomeDirectory() {
        return System.getProperty("user.home", "");
    }

    public static String getTempDirectory() {
        return System.getProperty("java.io.tmpdir", "");
    }

    public static int getMaxPathLength() {
        return isWindows() ? 260 : 4096;
    }
}
