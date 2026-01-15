package com.github.claudecodegui.bridge;

import com.intellij.openapi.diagnostic.Logger;
import com.github.claudecodegui.util.PlatformUtils;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * Environment Configurator.
 * Responsible for configuring process environment variables.
 */
public class EnvironmentConfigurator {

    private static final Logger LOG = Logger.getInstance(EnvironmentConfigurator.class);
    private static final String CLAUDE_PERMISSION_ENV = "CLAUDE_PERMISSION_DIR";

    private volatile String cachedPermissionDir = null;

    /**
     * Update the process environment variables, ensuring PATH includes Node.js directory.
     * Supports Windows (Path) and Unix (PATH) environment variable naming.
     */
    public void updateProcessEnvironment(ProcessBuilder pb, String nodeExecutable) {
        Map<String, String> env = pb.environment();

        // Use PlatformUtils to get PATH environment variable (case-insensitive)
        String path = PlatformUtils.isWindows() ?
            PlatformUtils.getEnvIgnoreCase("PATH") :
            env.get("PATH");

        if (path == null) {
            path = "";
        }

        StringBuilder newPath = new StringBuilder(path);
        String separator = File.pathSeparator;

        // 1. Add Node.js directory
        if (nodeExecutable != null && !nodeExecutable.equals("node")) {
            File nodeFile = new File(nodeExecutable);
            String nodeDir = nodeFile.getParent();
            if (nodeDir != null && !pathContains(path, nodeDir)) {
                newPath.append(separator).append(nodeDir);
            }
        }

        // 2. Add common paths based on platform
        if (PlatformUtils.isWindows()) {
            // Common Windows paths
            String[] windowsPaths = {
                System.getenv("ProgramFiles") + "\\nodejs",
                System.getenv("APPDATA") + "\\npm",
                System.getenv("LOCALAPPDATA") + "\\Programs\\nodejs"
            };
            for (String p : windowsPaths) {
                if (p != null && !p.contains("null") && !pathContains(path, p)) {
                    newPath.append(separator).append(p);
                }
            }
        } else {
            // Common macOS/Linux paths
            String[] unixPaths = {
                "/usr/local/bin",
                "/opt/homebrew/bin",
                "/usr/bin",
                "/bin",
                "/usr/sbin",
                "/sbin",
                System.getProperty("user.home") + "/.nvm/current/bin"
            };
            for (String p : unixPaths) {
                if (!pathContains(path, p)) {
                    newPath.append(separator).append(p);
                }
            }
        }

        // 3. Set PATH environment variable
        // Windows needs both PATH and Path set (some programs only recognize one)
        String newPathStr = newPath.toString();
        if (PlatformUtils.isWindows()) {
            // Remove possible old values first to avoid duplicates
            env.remove("PATH");
            env.remove("Path");
            env.remove("path");
            // Set multiple case variations for compatibility
            env.put("PATH", newPathStr);
            env.put("Path", newPathStr);
        } else {
            env.put("PATH", newPathStr);
        }

        // 4. Ensure HOME environment variable is set correctly
        // SDK needs HOME to find ~/.claude/commands/ directory
        String home = env.get("HOME");
        if (home == null || home.isEmpty()) {
            home = System.getProperty("user.home");
            if (home != null && !home.isEmpty()) {
                env.put("HOME", home);
            }
        }

        // 5. Set NODE_PATH to find SDK packages
        // Look in: ~/.codemoss/dependencies/node_modules, global npm node_modules
        configureNodePath(env, nodeExecutable);

        configurePermissionEnv(env);
    }

    /**
     * Configure NODE_PATH to find SDK packages in global npm and custom locations.
     */
    private void configureNodePath(Map<String, String> env, String nodeExecutable) {
        StringBuilder nodePath = new StringBuilder();
        String separator = File.pathSeparator;
        String home = System.getProperty("user.home");

        // 1. Add ~/.codemoss/dependencies/node_modules (plugin's SDK install location)
        if (home != null) {
            String codemossDeps = home + File.separator + ".codemoss" + File.separator + "dependencies" + File.separator + "node_modules";
            nodePath.append(codemossDeps);
        }

        // 2. Add global npm node_modules locations
        if (PlatformUtils.isWindows()) {
            String appData = System.getenv("APPDATA");
            if (appData != null) {
                nodePath.append(separator).append(appData).append("\\npm\\node_modules");
            }
        } else {
            // macOS/Linux: Check common global npm locations
            String[] globalPaths = {
                "/usr/local/lib/node_modules",           // npm default global
                "/opt/homebrew/lib/node_modules",        // Homebrew on Apple Silicon
                "/usr/lib/node_modules",                 // Linux system npm
                home + "/.npm-global/lib/node_modules",  // Custom npm prefix
                home + "/.nvm/versions/node"             // NVM - we'll try to find current version
            };

            for (String gp : globalPaths) {
                if (gp != null && new File(gp).exists()) {
                    nodePath.append(separator).append(gp);
                }
            }

            // Try to get npm global prefix dynamically if node is available
            if (nodeExecutable != null) {
                try {
                    String npmGlobalPath = getNpmGlobalPath(nodeExecutable);
                    if (npmGlobalPath != null && !nodePath.toString().contains(npmGlobalPath)) {
                        nodePath.append(separator).append(npmGlobalPath);
                    }
                } catch (Exception e) {
                    LOG.debug("Could not determine npm global path: " + e.getMessage());
                }
            }
        }

        String nodePathStr = nodePath.toString();
        if (!nodePathStr.isEmpty()) {
            // Append to existing NODE_PATH if present
            String existing = env.get("NODE_PATH");
            if (existing != null && !existing.isEmpty()) {
                nodePathStr = existing + separator + nodePathStr;
            }
            env.put("NODE_PATH", nodePathStr);
            LOG.info("[EnvironmentConfigurator] Set NODE_PATH=" + nodePathStr);
        }
    }

    /**
     * Get npm global node_modules path by running npm root -g.
     */
    private String getNpmGlobalPath(String nodeExecutable) {
        try {
            File nodeFile = new File(nodeExecutable);
            String nodeDir = nodeFile.getParent();
            String npmCmd = PlatformUtils.isWindows() ? "npm.cmd" : "npm";
            String npmPath = nodeDir != null ? nodeDir + File.separator + npmCmd : npmCmd;

            ProcessBuilder pb = new ProcessBuilder(npmPath, "root", "-g");
            pb.redirectErrorStream(true);
            Process process = pb.start();

            try (java.io.BufferedReader reader = new java.io.BufferedReader(
                    new java.io.InputStreamReader(process.getInputStream()))) {
                String line = reader.readLine();
                int exitCode = process.waitFor();
                if (exitCode == 0 && line != null && !line.isEmpty()) {
                    return line.trim();
                }
            }
        } catch (Exception e) {
            LOG.debug("Failed to get npm global path: " + e.getMessage());
        }
        return null;
    }

    /**
     * Configure permission environment variables.
     */
    public void configurePermissionEnv(Map<String, String> env) {
        if (env == null) {
            return;
        }
        String permissionDir = getPermissionDirectory();
        if (permissionDir != null) {
            // Use put() instead of putIfAbsent() to ensure our value is always used
            env.put(CLAUDE_PERMISSION_ENV, permissionDir);
            LOG.info("[EnvironmentConfigurator] Set CLAUDE_PERMISSION_DIR=" + permissionDir);
        }
    }

    /**
     * Get the permission directory.
     */
    public String getPermissionDirectory() {
        String cached = this.cachedPermissionDir;
        if (cached != null) {
            return cached;
        }

        Path dir = Paths.get(System.getProperty("java.io.tmpdir"), "claude-permission");
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            LOG.error("[EnvironmentConfigurator] Failed to prepare permission dir: " + dir + " (" + e.getMessage() + ")");
        }
        cachedPermissionDir = dir.toAbsolutePath().toString();
        return cachedPermissionDir;
    }

    /**
     * Check if PATH already contains the specified path.
     * Windows uses case-insensitive comparison.
     */
    private boolean pathContains(String pathEnv, String targetPath) {
        if (pathEnv == null || targetPath == null) {
            return false;
        }
        if (PlatformUtils.isWindows()) {
            return pathEnv.toLowerCase().contains(targetPath.toLowerCase());
        }
        return pathEnv.contains(targetPath);
    }

    /**
     * Configure temporary directory environment variables.
     */
    public void configureTempDir(Map<String, String> env, File tempDir) {
        if (env == null || tempDir == null) {
            return;
        }
        String tmpPath = tempDir.getAbsolutePath();
        env.put("TMPDIR", tmpPath);
        env.put("TEMP", tmpPath);
        env.put("TMP", tmpPath);
    }

    /**
     * Configure project path environment variables.
     */
    public void configureProjectPath(Map<String, String> env, String cwd) {
        if (env == null || cwd == null || cwd.isEmpty() || "undefined".equals(cwd) || "null".equals(cwd)) {
            return;
        }
        env.put("IDEA_PROJECT_PATH", cwd);
        env.put("PROJECT_PATH", cwd);
    }

    /**
     * Configure attachment-related environment variables.
     */
    public void configureAttachmentEnv(Map<String, String> env, boolean hasAttachments) {
        if (env == null) {
            return;
        }
        if (hasAttachments) {
            env.put("CLAUDE_USE_STDIN", "true");
        }
    }

    /**
     * Clear the cache.
     */
    public void clearCache() {
        this.cachedPermissionDir = null;
    }
}
