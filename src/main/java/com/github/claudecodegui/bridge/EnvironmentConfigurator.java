package com.github.claudecodegui.bridge;

import com.intellij.openapi.diagnostic.Logger;
import com.github.claudecodegui.util.PlatformUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Environment Configurator.
 * Responsible for configuring process environment variables.
 */
public class EnvironmentConfigurator {

    private static final Logger LOG = Logger.getInstance(EnvironmentConfigurator.class);
    private static final String CLAUDE_PERMISSION_ENV = "CLAUDE_PERMISSION_DIR";

    private volatile String cachedPermissionDir = null;

    // Cache for Codex env_key values from config.toml
    private volatile Map<String, String> cachedCodexEnvVars = null;

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

        configurePermissionEnv(env);
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
            env.putIfAbsent(CLAUDE_PERMISSION_ENV, permissionDir);
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
        this.cachedCodexEnvVars = null;
    }

    /**
     * Configure Codex-specific environment variables.
     * Reads ~/.codex/config.toml to find custom env_key settings and loads those
     * environment variables from the system shell environment.
     *
     * This is necessary because IDE processes often don't inherit shell environment
     * variables set in ~/.zshrc or ~/.bash_profile when launched from Dock/launcher.
     *
     * @param env ProcessBuilder environment map to update
     */
    public void configureCodexEnv(Map<String, String> env) {
        if (env == null) {
            return;
        }

        try {
            // 1. Find all env_key names from ~/.codex/config.toml
            Set<String> envKeyNames = parseCodexConfigEnvKeys();
            if (envKeyNames.isEmpty()) {
                LOG.debug("[Codex] No custom env_key found in config.toml");
                return;
            }

            LOG.info("[Codex] Found env_key names in config.toml: " + envKeyNames);

            // 2. Try to get values for each env_key from multiple sources
            for (String envKeyName : envKeyNames) {
                // Skip if already set in environment
                if (env.containsKey(envKeyName) && env.get(envKeyName) != null && !env.get(envKeyName).isEmpty()) {
                    LOG.debug("[Codex] Env var already set: " + envKeyName);
                    continue;
                }

                // Try to get value from system
                String value = resolveEnvValue(envKeyName);
                if (value != null && !value.isEmpty()) {
                    env.put(envKeyName, value);
                    LOG.info("[Codex] Set env var from shell: " + envKeyName + " (length: " + value.length() + ")");
                } else {
                    LOG.warn("[Codex] Could not resolve env var: " + envKeyName +
                            ". Please ensure it's set in your shell environment.");
                }
            }
        } catch (Exception e) {
            LOG.warn("[Codex] Error configuring Codex env: " + e.getMessage());
        }
    }

    /**
     * Parse ~/.codex/config.toml to extract all env_key values.
     *
     * @return Set of environment variable names referenced by env_key
     */
    private Set<String> parseCodexConfigEnvKeys() {
        Set<String> envKeys = new HashSet<>();
        String home = System.getProperty("user.home");
        if (home == null || home.isEmpty()) {
            return envKeys;
        }

        Path configPath = Paths.get(home, ".codex", "config.toml");
        if (!Files.exists(configPath)) {
            LOG.debug("[Codex] config.toml not found: " + configPath);
            return envKeys;
        }

        try {
            String content = Files.readString(configPath, StandardCharsets.UTF_8);

            // Pattern to match: env_key = "VALUE" or env_key = 'VALUE'
            Pattern pattern = Pattern.compile("env_key\\s*=\\s*[\"']([^\"']+)[\"']");
            Matcher matcher = pattern.matcher(content);

            while (matcher.find()) {
                String envKeyName = matcher.group(1).trim();
                if (!envKeyName.isEmpty()) {
                    envKeys.add(envKeyName);
                }
            }
        } catch (IOException e) {
            LOG.warn("[Codex] Failed to read config.toml: " + e.getMessage());
        }

        return envKeys;
    }

    /**
     * Resolve environment variable value from multiple sources.
     * Order of precedence:
     * 1. System.getenv() - already inherited env vars
     * 2. Shell environment via subprocess (macOS/Linux)
     * 3. Parse shell config files as fallback
     *
     * @param envName Environment variable name
     * @return Value or null if not found
     */
    private String resolveEnvValue(String envName) {
        // 1. Try System.getenv first (might already be inherited)
        String value = System.getenv(envName);
        if (value != null && !value.isEmpty()) {
            LOG.debug("[Codex] Env var found via System.getenv: " + envName);
            return value;
        }

        // 2. For macOS/Linux, try to get from shell environment
        if (!PlatformUtils.isWindows()) {
            value = getEnvFromShell(envName);
            if (value != null && !value.isEmpty()) {
                return value;
            }
        } else {
            // Windows: try to get from shell environment via cmd
            value = getEnvFromWindowsShell(envName);
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }

        // 3. Parse shell config files as last resort
        value = parseEnvFromShellConfigs(envName);
        if (value != null && !value.isEmpty()) {
            return value;
        }

        return null;
    }

    /**
     * Get environment variable by executing a login shell (macOS/Linux).
     * This captures environment variables set in .zshrc, .bash_profile, etc.
     *
     * @param envName Environment variable name
     * @return Value or null
     */
    private String getEnvFromShell(String envName) {
        try {
            // Use login shell to get full environment
            String shell = System.getenv("SHELL");
            if (shell == null || shell.isEmpty()) {
                shell = "/bin/zsh"; // Default to zsh on macOS
            }

            List<String> command = new ArrayList<>();
            command.add(shell);
            command.add("-l"); // Login shell
            command.add("-c");
            command.add("echo \"$" + envName + "\"");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                process.waitFor();

                if (line != null && !line.trim().isEmpty()) {
                    LOG.debug("[Codex] Env var found via shell: " + envName);
                    return line.trim();
                }
            }
        } catch (Exception e) {
            LOG.debug("[Codex] Failed to get env from shell: " + e.getMessage());
        }
        return null;
    }

    /**
     * Get environment variable from Windows shell (cmd).
     *
     * @param envName Environment variable name
     * @return Value or null
     */
    private String getEnvFromWindowsShell(String envName) {
        try {
            List<String> command = new ArrayList<>();
            command.add("cmd");
            command.add("/c");
            command.add("echo %" + envName + "%");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                process.waitFor();

                // Windows returns "%VARNAME%" if not set
                if (line != null && !line.trim().isEmpty() &&
                        !line.trim().equals("%" + envName + "%")) {
                    LOG.debug("[Codex] Env var found via Windows shell: " + envName);
                    return line.trim();
                }
            }
        } catch (Exception e) {
            LOG.debug("[Codex] Failed to get env from Windows shell: " + e.getMessage());
        }
        return null;
    }

    /**
     * Parse environment variable from shell config files.
     * Checks .zshrc, .bash_profile, .bashrc, .profile
     *
     * @param envName Environment variable name
     * @return Value or null
     */
    private String parseEnvFromShellConfigs(String envName) {
        String home = System.getProperty("user.home");
        if (home == null || home.isEmpty()) {
            return null;
        }

        // Shell config files to check (in order of preference)
        String[] configFiles;
        if (PlatformUtils.isWindows()) {
            // Windows doesn't use these, but check anyway
            configFiles = new String[]{};
        } else {
            configFiles = new String[]{
                    ".zshrc",
                    ".bash_profile",
                    ".bashrc",
                    ".profile",
                    ".zshenv",
                    ".zprofile"
            };
        }

        // Pattern to match: export VAR=value or VAR=value
        Pattern pattern = Pattern.compile(
                "(?:export\\s+)?" + Pattern.quote(envName) + "\\s*=\\s*[\"']?([^\"'\\n]+)[\"']?"
        );

        for (String configFile : configFiles) {
            Path configPath = Paths.get(home, configFile);
            if (!Files.exists(configPath)) {
                continue;
            }

            try {
                String content = Files.readString(configPath, StandardCharsets.UTF_8);
                Matcher matcher = pattern.matcher(content);

                if (matcher.find()) {
                    String value = matcher.group(1).trim();
                    if (!value.isEmpty()) {
                        LOG.debug("[Codex] Env var found in " + configFile + ": " + envName);
                        return value;
                    }
                }
            } catch (IOException e) {
                LOG.debug("[Codex] Failed to read " + configFile + ": " + e.getMessage());
            }
        }

        return null;
    }
}
