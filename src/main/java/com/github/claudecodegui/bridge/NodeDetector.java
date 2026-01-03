package com.github.claudecodegui.bridge;

import com.intellij.openapi.diagnostic.Logger;
import com.github.claudecodegui.model.NodeDetectionResult;
import com.github.claudecodegui.util.PlatformUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Node.js Detector.
 * Responsible for finding and validating Node.js executable on various platforms.
 */
public class NodeDetector {

    private static final Logger LOG = Logger.getInstance(NodeDetector.class);
    // Common Windows Node.js installation paths
    private static final String[] WINDOWS_NODE_PATHS = {
        // Official installer default paths
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        // Chocolatey
        "C:\\ProgramData\\chocolatey\\bin\\node.exe",
        // Scoop
        "%USERPROFILE%\\scoop\\apps\\nodejs\\current\\node.exe",
        "%USERPROFILE%\\scoop\\apps\\nodejs-lts\\current\\node.exe",
        // nvm-windows
        "%APPDATA%\\nvm\\current\\node.exe",
        // fnm
        "%USERPROFILE%\\.fnm\\node-versions\\default\\installation\\node.exe",
        // volta
        "%USERPROFILE%\\.volta\\bin\\node.exe",
        // Custom user installation
        "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
    };

    private String cachedNodeExecutable = null;
    private NodeDetectionResult cachedDetectionResult = null;

    /**
     * Find the Node.js executable path.
     */
    public String findNodeExecutable() {
        if (cachedNodeExecutable != null) {
            return cachedNodeExecutable;
        }

        NodeDetectionResult result = detectNodeWithDetails();
        if (result.isFound()) {
            cachedNodeExecutable = result.getNodePath();
            return cachedNodeExecutable;
        }

        // If all attempts fail, fall back to default
        LOG.warn("⚠️ Unable to auto-detect Node.js path, using default 'node'");
        LOG.warn(result.getUserFriendlyMessage());
        cachedNodeExecutable = "node";
        return cachedNodeExecutable;
    }

    /**
     * Detect Node.js and return detailed results.
     * @return NodeDetectionResult containing detection details
     */
    public NodeDetectionResult detectNodeWithDetails() {
        List<String> triedPaths = new ArrayList<>();
        LOG.info("Searching for Node.js...");
        LOG.info("  Operating System: " + System.getProperty("os.name"));
        LOG.info("  Platform Type: " + (PlatformUtils.isWindows() ? "Windows" :
            (PlatformUtils.isMac() ? "macOS" : "Linux/Unix")));

        // 1. Try system command (where/which)
        NodeDetectionResult cmdResult = detectNodeViaSystemCommand(triedPaths);
        if (cmdResult != null && cmdResult.isFound()) {
            return cmdResult;
        }

        // 2. Try known installation paths
        NodeDetectionResult knownPathResult = detectNodeViaKnownPaths(triedPaths);
        if (knownPathResult != null && knownPathResult.isFound()) {
            return knownPathResult;
        }

        // 3. Try PATH environment variable
        NodeDetectionResult pathResult = detectNodeViaPath(triedPaths);
        if (pathResult != null && pathResult.isFound()) {
            return pathResult;
        }

        // 4. Final fallback: try "node" directly
        NodeDetectionResult fallbackResult = detectNodeViaFallback(triedPaths);
        if (fallbackResult != null && fallbackResult.isFound()) {
            return fallbackResult;
        }

        return NodeDetectionResult.failure("Node.js not found in any known paths", triedPaths);
    }

    /**
     * Detect Node.js via system command (where/which).
     */
    private NodeDetectionResult detectNodeViaSystemCommand(List<String> triedPaths) {
        if (PlatformUtils.isWindows()) {
            return detectNodeViaWindowsWhere(triedPaths);
        } else {
            // macOS/Linux: try zsh first (macOS default), then bash
            NodeDetectionResult result = detectNodeViaShell("/bin/zsh", "zsh", triedPaths);
            if (result != null && result.isFound()) {
                return result;
            }
            return detectNodeViaShell("/bin/bash", "bash", triedPaths);
        }
    }

    /**
     * Windows: Detect Node.js using 'where' command.
     */
    private NodeDetectionResult detectNodeViaWindowsWhere(List<String> triedPaths) {
        try {
            ProcessBuilder pb = new ProcessBuilder("where", "node");
            String methodDesc = "Windows where command";

            LOG.info("  Trying method: " + methodDesc);
            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String path = reader.readLine();
                if (path != null && !path.isEmpty()) {
                    path = path.trim();
                    triedPaths.add(path);

                    String version = verifyNodePath(path);
                    if (version != null) {
                        LOG.info("✓ Found Node.js via " + methodDesc + ": " + path + " (" + version + ")");
                        return NodeDetectionResult.success(
                            path, version,
                            NodeDetectionResult.DetectionMethod.WHERE_COMMAND,
                            triedPaths
                        );
                    }
                }
            }

            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
            }
        } catch (Exception e) {
            LOG.debug("  Windows where command failed: " + e.getMessage());
        }
        return null;
    }

    /**
     * Unix/macOS: Detect Node.js via specified shell.
     * @param shellPath shell executable path (e.g., /bin/zsh or /bin/bash)
     * @param shellName shell name (for logging)
     * @param triedPaths list of tried paths
     */
    private NodeDetectionResult detectNodeViaShell(String shellPath, String shellName, List<String> triedPaths) {
        // Check if shell exists
        if (!new File(shellPath).exists()) {
            LOG.debug("  Skipping " + shellName + " (not found)");
            return null;
        }

        try {
            // Use -l (login shell) and -i (interactive) to ensure user config is loaded
            // This allows detecting paths configured by nvm, fnm, etc.
            ProcessBuilder pb = new ProcessBuilder(shellPath, "-l", "-c", "which node");
            String methodDesc = shellName + " which command";

            LOG.info("  Trying method: " + methodDesc);
            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String path = reader.readLine();
                if (path != null && !path.isEmpty()) {
                    path = path.trim();
                    // Exclude "node not found" type error messages
                    if (path.startsWith("/") && !path.contains("not found")) {
                        triedPaths.add(path);

                        String version = verifyNodePath(path);
                        if (version != null) {
                            LOG.info("✓ Found Node.js via " + methodDesc + ": " + path + " (" + version + ")");
                            return NodeDetectionResult.success(
                                path, version,
                                NodeDetectionResult.DetectionMethod.WHICH_COMMAND,
                                triedPaths
                            );
                        }
                    }
                }
            }

            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
            }
        } catch (Exception e) {
            LOG.debug("  " + shellName + " command failed: " + e.getMessage());
        }
        return null;
    }

    /**
     * Detect Node.js via known installation paths.
     */
    private NodeDetectionResult detectNodeViaKnownPaths(List<String> triedPaths) {
        String userHome = System.getProperty("user.home");
        List<String> pathsToCheck = new ArrayList<>();

        if (PlatformUtils.isWindows()) {
            // Windows paths: expand environment variables and add
            LOG.info("  Checking common Windows installation paths...");
            for (String templatePath : WINDOWS_NODE_PATHS) {
                String expandedPath = expandWindowsEnvVars(templatePath);
                pathsToCheck.add(expandedPath);
            }

            // Dynamically find nvm-windows versions
            String nvmHome = PlatformUtils.getEnvIgnoreCase("NVM_HOME");
            if (nvmHome == null) {
                nvmHome = System.getenv("APPDATA") + "\\nvm";
            }
            File nvmDir = new File(nvmHome);
            if (nvmDir.exists() && nvmDir.isDirectory()) {
                File[] versionDirs = nvmDir.listFiles(File::isDirectory);
                if (versionDirs != null) {
                    java.util.Arrays.sort(versionDirs, (a, b) -> b.getName().compareTo(a.getName()));
                    for (File versionDir : versionDirs) {
                        if (versionDir.getName().startsWith("v")) {
                            String nodePath = versionDir.getAbsolutePath() + "\\node.exe";
                            pathsToCheck.add(nodePath);
                            LOG.info("  Found nvm-windows Node.js: " + nodePath);
                        }
                    }
                }
            }
        } else {
            // macOS/Linux paths
            LOG.info("  Checking common Unix/macOS installation paths...");

            // Dynamically find NVM managed versions
            File nvmDir = new File(userHome + "/.nvm/versions/node");
            if (nvmDir.exists() && nvmDir.isDirectory()) {
                File[] versionDirs = nvmDir.listFiles();
                if (versionDirs != null) {
                    java.util.Arrays.sort(versionDirs, (a, b) -> b.getName().compareTo(a.getName()));
                    for (File versionDir : versionDirs) {
                        if (versionDir.isDirectory()) {
                            String nodePath = versionDir.getAbsolutePath() + "/bin/node";
                            pathsToCheck.add(nodePath);
                            LOG.info("  Found NVM Node.js: " + nodePath);
                        }
                    }
                }
            }

            // Dynamically find Homebrew version-specific Node.js (node@18, node@20, node@22, etc.)
            // Apple Silicon: /opt/homebrew/opt/node@XX/bin/node
            // Intel Mac: /usr/local/opt/node@XX/bin/node
            String[] homebrewOptDirs = {"/opt/homebrew/opt", "/usr/local/opt"};
            for (String optDir : homebrewOptDirs) {
                File optFile = new File(optDir);
                if (optFile.exists() && optFile.isDirectory()) {
                    File[] nodeDirs = optFile.listFiles((dir, name) ->
                        name.equals("node") || name.startsWith("node@"));
                    if (nodeDirs != null) {
                        // Sort by version descending, prefer newer versions
                        java.util.Arrays.sort(nodeDirs, (a, b) -> {
                            // node@22 > node@20 > node@18 > node
                            String aName = a.getName();
                            String bName = b.getName();
                            int aVersion = aName.equals("node") ? 0 :
                                parseNodeVersion(aName.substring(5));
                            int bVersion = bName.equals("node") ? 0 :
                                parseNodeVersion(bName.substring(5));
                            return Integer.compare(bVersion, aVersion);
                        });
                        for (File nodeDir : nodeDirs) {
                            String nodePath = nodeDir.getAbsolutePath() + "/bin/node";
                            pathsToCheck.add(nodePath);
                            LOG.info("  Found Homebrew Node.js: " + nodePath);
                        }
                    }
                }
            }

            // Add common Unix/macOS paths
            pathsToCheck.add("/usr/local/bin/node");           // Homebrew (macOS Intel)
            pathsToCheck.add("/opt/homebrew/bin/node");        // Homebrew (Apple Silicon)
            pathsToCheck.add("/usr/bin/node");                 // Linux system
            pathsToCheck.add(userHome + "/.volta/bin/node");   // Volta
            pathsToCheck.add(userHome + "/.fnm/aliases/default/bin/node"); // fnm
        }

        // Check each path
        for (String path : pathsToCheck) {
            triedPaths.add(path);

            File nodeFile = new File(path);
            if (!nodeFile.exists()) {
                LOG.debug("  Skipping non-existent: " + path);
                continue;
            }

            // Windows doesn't check canExecute() as behavior is inconsistent
            if (!PlatformUtils.isWindows() && !nodeFile.canExecute()) {
                LOG.debug("  Skipping non-executable: " + path);
                continue;
            }

            String version = verifyNodePath(path);
            if (version != null) {
                LOG.info("✓ Found Node.js at known path: " + path + " (" + version + ")");
                return NodeDetectionResult.success(path, version,
                    NodeDetectionResult.DetectionMethod.KNOWN_PATH, triedPaths);
            }
        }

        return null;
    }

    /**
     * Detect Node.js via PATH environment variable.
     */
    private NodeDetectionResult detectNodeViaPath(List<String> triedPaths) {
        LOG.info("  Checking PATH environment variable...");

        // Use platform-compatible way to get PATH
        String pathEnv = PlatformUtils.isWindows() ?
            PlatformUtils.getEnvIgnoreCase("PATH") :
            System.getenv("PATH");

        if (pathEnv == null || pathEnv.isEmpty()) {
            LOG.debug("  PATH environment variable is empty");
            return null;
        }

        String[] paths = pathEnv.split(File.pathSeparator);
        String nodeFileName = PlatformUtils.isWindows() ? "node.exe" : "node";

        for (String dir : paths) {
            if (dir == null || dir.isEmpty()) continue;

            File nodeFile = new File(dir, nodeFileName);
            String nodePath = nodeFile.getAbsolutePath();
            triedPaths.add(nodePath);

            if (!nodeFile.exists()) continue;

            String version = verifyNodePath(nodePath);
            if (version != null) {
                LOG.info("✓ Found Node.js in PATH: " + nodePath + " (" + version + ")");
                return NodeDetectionResult.success(nodePath, version,
                    NodeDetectionResult.DetectionMethod.PATH_VARIABLE, triedPaths);
            }
        }

        return null;
    }

    /**
     * Fallback detection: try executing "node" directly.
     */
    private NodeDetectionResult detectNodeViaFallback(List<String> triedPaths) {
        LOG.info("  Trying direct 'node' call (fallback)...");
        triedPaths.add("node (direct call)");

        try {
            ProcessBuilder pb = new ProcessBuilder("node", "--version");
            Process process = pb.start();

            String version = null;
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                version = reader.readLine();
            }

            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }

            int exitCode = process.exitValue();
            if (exitCode == 0 && version != null) {
                version = version.trim();
                LOG.info("✓ Direct node call successful (" + version + ")");
                return NodeDetectionResult.success("node", version,
                    NodeDetectionResult.DetectionMethod.FALLBACK, triedPaths);
            }
        } catch (Exception e) {
            LOG.debug("  Direct 'node' call failed: " + e.getMessage());
        }

        return null;
    }

    /**
     * Verify if Node.js path is usable.
     * @param path Node.js path
     * @return version number if usable, null otherwise
     */
    public String verifyNodePath(String path) {
        try {
            ProcessBuilder pb = new ProcessBuilder(path, "--version");
            Process process = pb.start();

            String version = null;
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                version = reader.readLine();
            }

            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }

            int exitCode = process.exitValue();
            if (exitCode == 0 && version != null) {
                return version.trim();
            }
        } catch (Exception e) {
            LOG.debug("    Verification failed [" + path + "]: " + e.getMessage());
        }
        return null;
    }

    /**
     * Expand Windows environment variables.
     * Example: %USERPROFILE%\\.nvm -> C:\\Users\\xxx\\.nvm
     */
    private String expandWindowsEnvVars(String path) {
        if (path == null) return null;

        String result = path;

        // Expand common environment variables
        result = result.replace("%USERPROFILE%", System.getProperty("user.home", ""));
        result = result.replace("%APPDATA%", System.getenv("APPDATA") != null ?
            System.getenv("APPDATA") : "");
        result = result.replace("%LOCALAPPDATA%", System.getenv("LOCALAPPDATA") != null ?
            System.getenv("LOCALAPPDATA") : "");
        result = result.replace("%ProgramFiles%", System.getenv("ProgramFiles") != null ?
            System.getenv("ProgramFiles") : "C:\\Program Files");
        result = result.replace("%ProgramFiles(x86)%", System.getenv("ProgramFiles(x86)") != null ?
            System.getenv("ProgramFiles(x86)") : "C:\\Program Files (x86)");

        return result;
    }

    /**
     * Parse Node.js version number.
     * Example: "20" -> 20, "18" -> 18
     */
    private int parseNodeVersion(String version) {
        if (version == null || version.isEmpty()) {
            return 0;
        }
        try {
            // Handle possible decimal versions, e.g., "20.1" -> take major version 20
            int dotIndex = version.indexOf('.');
            if (dotIndex > 0) {
                version = version.substring(0, dotIndex);
            }
            return Integer.parseInt(version);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Manually set Node.js executable path.
     * Also clears cached detection result for re-validation on next use.
     */
    public void setNodeExecutable(String path) {
        this.cachedNodeExecutable = path;
        // Clear detection result cache to ensure consistent state
        // New path will be re-validated and cached on next verifyAndCacheNodePath call
        this.cachedDetectionResult = null;
    }

    /**
     * Get the currently used Node.js path.
     */
    public String getNodeExecutable() {
        if (cachedNodeExecutable == null) {
            return findNodeExecutable();
        }
        return cachedNodeExecutable;
    }

    /**
     * Clear cached Node.js path and detection result.
     */
    public void clearCache() {
        this.cachedNodeExecutable = null;
        this.cachedDetectionResult = null;
    }

    /**
     * Get cached detection result.
     */
    public NodeDetectionResult getCachedDetectionResult() {
        return cachedDetectionResult;
    }

    public String getCachedNodePath() {
        if (cachedDetectionResult != null && cachedDetectionResult.getNodePath() != null) {
            return cachedDetectionResult.getNodePath();
        }
        return cachedNodeExecutable;
    }

    public String getCachedNodeVersion() {
        return cachedDetectionResult != null ? cachedDetectionResult.getNodeVersion() : null;
    }

    public NodeDetectionResult verifyAndCacheNodePath(String path) {
        if (path == null || path.isEmpty()) {
            clearCache();
            return NodeDetectionResult.failure("Node.js path not specified");
        }
        String version = verifyNodePath(path);
        NodeDetectionResult result;
        if (version != null) {
            result = NodeDetectionResult.success(path, version, NodeDetectionResult.DetectionMethod.KNOWN_PATH);
        } else {
            result = NodeDetectionResult.failure("Unable to verify specified Node.js path: " + path);
        }
        cacheDetection(result);
        return result;
    }

    private void cacheDetection(NodeDetectionResult result) {
        this.cachedDetectionResult = result;
        if (result != null && result.isFound() && result.getNodePath() != null) {
            this.cachedNodeExecutable = result.getNodePath();
        }
    }

    /**
     * Minimum required Node.js major version.
     */
    public static final int MIN_NODE_MAJOR_VERSION = 18;

    /**
     * Parse major version from version string.
     * @param version version string, e.g., "v20.10.0" or "20.10.0"
     * @return major version number, returns 0 on parse failure
     */
    public static int parseMajorVersion(String version) {
        if (version == null || version.isEmpty()) {
            return 0;
        }
        try {
            String versionStr = version.startsWith("v") ? version.substring(1) : version;
            int dotIndex = versionStr.indexOf('.');
            if (dotIndex > 0) {
                return Integer.parseInt(versionStr.substring(0, dotIndex));
            }
            return Integer.parseInt(versionStr);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Check if Node.js version meets minimum requirement.
     * @param version version string
     * @return true if version >= 18, false otherwise
     */
    public static boolean isVersionSupported(String version) {
        int major = parseMajorVersion(version);
        return major >= MIN_NODE_MAJOR_VERSION;
    }
}
