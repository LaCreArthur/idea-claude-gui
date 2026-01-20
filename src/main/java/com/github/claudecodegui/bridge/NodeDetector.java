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

public class NodeDetector {

    private static final Logger LOG = Logger.getInstance(NodeDetector.class);
    private static final String[] WINDOWS_NODE_PATHS = {
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        "C:\\ProgramData\\chocolatey\\bin\\node.exe",
        "%USERPROFILE%\\scoop\\apps\\nodejs\\current\\node.exe",
        "%USERPROFILE%\\scoop\\apps\\nodejs-lts\\current\\node.exe",
        "%APPDATA%\\nvm\\current\\node.exe",
        "%USERPROFILE%\\.fnm\\node-versions\\default\\installation\\node.exe",
        "%USERPROFILE%\\.volta\\bin\\node.exe",
        "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
    };

    private String cachedNodeExecutable = null;
    private NodeDetectionResult cachedDetectionResult = null;

    public String findNodeExecutable() {
        if (cachedNodeExecutable != null) {
            return cachedNodeExecutable;
        }

        NodeDetectionResult result = detectNodeWithDetails();
        if (result.isFound()) {
            cachedNodeExecutable = result.getNodePath();
            return cachedNodeExecutable;
        }

        LOG.warn("Could not auto-detect Node.js path, using default 'node'");
        LOG.warn(result.getUserFriendlyMessage());
        cachedNodeExecutable = "node";
        return cachedNodeExecutable;
    }

    public NodeDetectionResult detectNodeWithDetails() {
        List<String> triedPaths = new ArrayList<>();
        LOG.info("Searching for Node.js...");
        LOG.info("  Operating system: " + System.getProperty("os.name"));
        LOG.info("  Platform type: " + (PlatformUtils.isWindows() ? "Windows" :
            (PlatformUtils.isMac() ? "macOS" : "Linux/Unix")));

        NodeDetectionResult cmdResult = detectNodeViaSystemCommand(triedPaths);
        if (cmdResult != null && cmdResult.isFound()) {
            return cmdResult;
        }

        NodeDetectionResult knownPathResult = detectNodeViaKnownPaths(triedPaths);
        if (knownPathResult != null && knownPathResult.isFound()) {
            return knownPathResult;
        }

        NodeDetectionResult pathResult = detectNodeViaPath(triedPaths);
        if (pathResult != null && pathResult.isFound()) {
            return pathResult;
        }

        NodeDetectionResult fallbackResult = detectNodeViaFallback(triedPaths);
        if (fallbackResult != null && fallbackResult.isFound()) {
            return fallbackResult;
        }

        return NodeDetectionResult.failure("Node.js not found in any known paths", triedPaths);
    }

    private NodeDetectionResult detectNodeViaSystemCommand(List<String> triedPaths) {
        if (PlatformUtils.isWindows()) {
            return detectNodeViaWindowsWhere(triedPaths);
        } else {
            NodeDetectionResult result = detectNodeViaShell("/bin/zsh", "zsh", triedPaths);
            if (result != null && result.isFound()) {
                return result;
            }
            return detectNodeViaShell("/bin/bash", "bash", triedPaths);
        }
    }

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
                        LOG.info("Found Node.js via " + methodDesc + ": " + path + " (" + version + ")");
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
            LOG.debug("  Windows where command lookup failed: " + e.getMessage());
        }
        return null;
    }

    private NodeDetectionResult detectNodeViaShell(String shellPath, String shellName, List<String> triedPaths) {
        if (!new File(shellPath).exists()) {
            LOG.debug("  Skipping " + shellName + " (not found)");
            return null;
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(shellPath, "-l", "-c", "which node");
            String methodDesc = shellName + " which command";

            LOG.info("  Trying method: " + methodDesc);
            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String path = reader.readLine();
                if (path != null && !path.isEmpty()) {
                    path = path.trim();
                    if (path.startsWith("/") && !path.contains("not found")) {
                        triedPaths.add(path);

                        String version = verifyNodePath(path);
                        if (version != null) {
                            LOG.info("Found Node.js via " + methodDesc + ": " + path + " (" + version + ")");
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
            LOG.debug("  " + shellName + " command lookup failed: " + e.getMessage());
        }
        return null;
    }

    private NodeDetectionResult detectNodeViaKnownPaths(List<String> triedPaths) {
        String userHome = System.getProperty("user.home");
        List<String> pathsToCheck = new ArrayList<>();

        if (PlatformUtils.isWindows()) {
            LOG.info("  Checking Windows common installation paths...");
            for (String templatePath : WINDOWS_NODE_PATHS) {
                String expandedPath = expandWindowsEnvVars(templatePath);
                pathsToCheck.add(expandedPath);
            }

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
            LOG.info("  Checking Unix/macOS common installation paths...");

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

            String[] homebrewOptDirs = {"/opt/homebrew/opt", "/usr/local/opt"};
            for (String optDir : homebrewOptDirs) {
                File optFile = new File(optDir);
                if (optFile.exists() && optFile.isDirectory()) {
                    File[] nodeDirs = optFile.listFiles((dir, name) ->
                        name.equals("node") || name.startsWith("node@"));
                    if (nodeDirs != null) {
                        java.util.Arrays.sort(nodeDirs, (a, b) -> {
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

            File nvmdBin = new File(userHome + "/.nvmd/bin/node");
            if (nvmdBin.exists()) {
                pathsToCheck.add(nvmdBin.getAbsolutePath());
                LOG.info("  Found nvmd Node.js: " + nvmdBin.getAbsolutePath());
            }

            pathsToCheck.add("/usr/local/bin/node");
            pathsToCheck.add("/opt/homebrew/bin/node");
            pathsToCheck.add("/usr/bin/node");
            pathsToCheck.add(userHome + "/.volta/bin/node");
            pathsToCheck.add(userHome + "/.fnm/aliases/default/bin/node");
            pathsToCheck.add(userHome + "/.nvmd/bin/node");
        }

        for (String path : pathsToCheck) {
            triedPaths.add(path);

            File nodeFile = new File(path);
            if (!nodeFile.exists()) {
                LOG.debug("  Skipping non-existent: " + path);
                continue;
            }

            if (!PlatformUtils.isWindows() && !nodeFile.canExecute()) {
                LOG.debug("  Skipping no execute permission: " + path);
                continue;
            }

            String version = verifyNodePath(path);
            if (version != null) {
                LOG.info("Found Node.js at known path: " + path + " (" + version + ")");
                return NodeDetectionResult.success(path, version,
                    NodeDetectionResult.DetectionMethod.KNOWN_PATH, triedPaths);
            }
        }

        return null;
    }

    private NodeDetectionResult detectNodeViaPath(List<String> triedPaths) {
        LOG.info("  Checking PATH environment variable...");

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
                LOG.info("Found Node.js in PATH: " + nodePath + " (" + version + ")");
                return NodeDetectionResult.success(nodePath, version,
                    NodeDetectionResult.DetectionMethod.PATH_VARIABLE, triedPaths);
            }
        }

        return null;
    }

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
                LOG.info("Direct node call succeeded (" + version + ")");
                return NodeDetectionResult.success("node", version,
                    NodeDetectionResult.DetectionMethod.FALLBACK, triedPaths);
            }
        } catch (Exception e) {
            LOG.debug("  Direct 'node' call failed: " + e.getMessage());
        }

        return null;
    }

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

    private String expandWindowsEnvVars(String path) {
        if (path == null) return null;

        String result = path;

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

    private int parseNodeVersion(String version) {
        if (version == null || version.isEmpty()) {
            return 0;
        }
        try {
            int dotIndex = version.indexOf('.');
            if (dotIndex > 0) {
                version = version.substring(0, dotIndex);
            }
            return Integer.parseInt(version);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public void setNodeExecutable(String path) {
        this.cachedNodeExecutable = path;
        this.cachedDetectionResult = null;
    }

    public String getNodeExecutable() {
        if (cachedNodeExecutable == null) {
            return findNodeExecutable();
        }
        return cachedNodeExecutable;
    }

    public void clearCache() {
        this.cachedNodeExecutable = null;
        this.cachedDetectionResult = null;
    }

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
            result = NodeDetectionResult.failure("Could not verify specified Node.js path: " + path);
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

    public static final int MIN_NODE_MAJOR_VERSION = 18;

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

    public static boolean isVersionSupported(String version) {
        int major = parseMajorVersion(version);
        return major >= MIN_NODE_MAJOR_VERSION;
    }
}
