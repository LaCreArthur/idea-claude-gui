package com.github.claudecodegui.dependency;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DependencyManager {

    private static final Logger LOG = Logger.getInstance(DependencyManager.class);
    private static final String DEPS_DIR_NAME = "dependencies";
    private static final String MANIFEST_FILE = "manifest.json";
    private static final String INSTALLED_MARKER = ".installed";

    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final EnvironmentConfigurator envConfigurator;

    public DependencyManager() {
        this.gson = new GsonBuilder().setPrettyPrinting().create();
        this.nodeDetector = new NodeDetector();
        this.envConfigurator = new EnvironmentConfigurator();
    }

    public DependencyManager(NodeDetector nodeDetector) {
        this.gson = new GsonBuilder().setPrettyPrinting().create();
        this.nodeDetector = nodeDetector;
        this.envConfigurator = new EnvironmentConfigurator();
    }

    public Path getDependenciesDir() {
        String home = System.getProperty("user.home");
        return Paths.get(home, ".claude-gui", DEPS_DIR_NAME);
    }

    public Path getSdkDir(String sdkId) {
        return getDependenciesDir().resolve(sdkId);
    }

    public Path getSdkNodeModulesDir(String sdkId) {
        return getSdkDir(sdkId).resolve("node_modules");
    }

    public boolean isInstalled(String sdkId) {
        SdkDefinition sdk = SdkDefinition.fromId(sdkId);
        if (sdk == null) {
            return false;
        }

        Path packageDir = getPackageDir(sdkId, sdk.getNpmPackage());
        if (!Files.exists(packageDir)) {
            return false;
        }

        Path sdkDir = getSdkDir(sdkId);
        Path markerFile = sdkDir.resolve(INSTALLED_MARKER);
        if (!Files.exists(markerFile)) {
            try {
                String version = getInstalledVersionFromPackage(sdkId, sdk.getNpmPackage());
                Files.writeString(markerFile, version != null ? version : "unknown");
                LOG.info("[DependencyManager] Created missing marker file for manually installed SDK: " + sdkId);
            } catch (Exception e) {
                LOG.warn("[DependencyManager] Failed to create marker file: " + e.getMessage());
            }
        }

        return true;
    }

    private String getInstalledVersionFromPackage(String sdkId, String npmPackage) {
        Path packageJson = getPackageDir(sdkId, npmPackage).resolve("package.json");
        if (!Files.exists(packageJson)) {
            return null;
        }

        try (Reader reader = Files.newBufferedReader(packageJson, StandardCharsets.UTF_8)) {
            JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
            if (json.has("version")) {
                return json.get("version").getAsString();
            }
        } catch (Exception e) {
            LOG.warn("[DependencyManager] Failed to read version from package.json: " + e.getMessage());
        }

        return null;
    }

    private Path getPackageDir(String sdkId, String npmPackage) {
        String[] parts = npmPackage.split("/");
        Path nodeModules = getSdkNodeModulesDir(sdkId);
        Path packagePath = nodeModules;
        for (String part : parts) {
            packagePath = packagePath.resolve(part);
        }
        return packagePath;
    }

    public String getInstalledVersion(String sdkId) {
        SdkDefinition sdk = SdkDefinition.fromId(sdkId);
        if (sdk == null || !isInstalled(sdkId)) {
            return null;
        }

        return getInstalledVersionFromPackage(sdkId, sdk.getNpmPackage());
    }

    public String getLatestVersion(String sdkId) {
        SdkDefinition sdk = SdkDefinition.fromId(sdkId);
        if (sdk == null) {
            return null;
        }

        try {
            String nodePath = nodeDetector.findNodeExecutable();
            String npmPath = getNpmPath(nodePath);

            ProcessBuilder pb = new ProcessBuilder(
                npmPath, "view", sdk.getNpmPackage(), "version"
            );
            configureProcessEnvironment(pb);

            Process process = pb.start();
            StringBuilder output = new StringBuilder();

            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line.trim());
                }
            }

            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }

            if (process.exitValue() == 0) {
                return output.toString().trim();
            }
        } catch (Exception e) {
            LOG.warn("[DependencyManager] Failed to get latest version: " + e.getMessage());
        }

        return null;
    }

    public UpdateInfo checkForUpdates(String sdkId) {
        SdkDefinition sdk = SdkDefinition.fromId(sdkId);
        if (sdk == null) {
            return UpdateInfo.error(sdkId, "Unknown SDK", "Unknown SDK: " + sdkId);
        }

        if (!isInstalled(sdkId)) {
            return UpdateInfo.error(sdkId, sdk.getDisplayName(), "SDK not installed");
        }

        String currentVersion = getInstalledVersion(sdkId);
        if (currentVersion == null) {
            return UpdateInfo.error(sdkId, sdk.getDisplayName(), "Cannot read installed version");
        }

        String latestVersion = getLatestVersion(sdkId);
        if (latestVersion == null) {
            return UpdateInfo.error(sdkId, sdk.getDisplayName(), "Cannot fetch latest version");
        }

        if (compareVersions(currentVersion, latestVersion) < 0) {
            return UpdateInfo.updateAvailable(sdkId, sdk.getDisplayName(), currentVersion, latestVersion);
        }

        return UpdateInfo.noUpdate(sdkId, sdk.getDisplayName(), currentVersion);
    }

    public CompletableFuture<InstallResult> installSdk(String sdkId, Consumer<String> logCallback) {
        return CompletableFuture.supplyAsync(() -> installSdkSync(sdkId, logCallback));
    }

    public InstallResult installSdkSync(String sdkId, Consumer<String> logCallback) {
        SdkDefinition sdk = SdkDefinition.fromId(sdkId);
        if (sdk == null) {
            return InstallResult.failure(sdkId, "Unknown SDK: " + sdkId, "");
        }

        StringBuilder logs = new StringBuilder();
        Consumer<String> log = (msg) -> {
            logs.append(msg).append("\n");
            if (logCallback != null) {
                logCallback.accept(msg);
            }
        };

        try {
            log.accept("Starting installation of " + sdk.getDisplayName() + "...");

            String nodePath = nodeDetector.findNodeExecutable();
            if (nodePath == null || "node".equals(nodePath)) {
                String version = nodeDetector.verifyNodePath("node");
                if (version == null) {
                    return InstallResult.failure(sdkId,
                        "Node.js not found. Please configure Node.js path in Settings > Basic.",
                        logs.toString());
                }
            }
            log.accept("Using Node.js: " + nodePath);

            String npmPath = getNpmPath(nodePath);
            log.accept("Using npm: " + npmPath);

            Path sdkDir = getSdkDir(sdkId);

            Path normalizedSdkDir = sdkDir.normalize().toAbsolutePath();
            Path normalizedDepsDir = getDependenciesDir().normalize().toAbsolutePath();
            if (!normalizedSdkDir.startsWith(normalizedDepsDir)) {
                return InstallResult.failure(sdkId,
                    "Security error: SDK directory path is outside dependencies directory",
                    logs.toString());
            }

            Files.createDirectories(sdkDir);
            log.accept("Created directory: " + sdkDir);

            createPackageJson(sdkDir, sdk);
            log.accept("Created package.json");

            log.accept("Checking npm cache permissions...");
            if (!NpmPermissionHelper.checkCachePermission()) {
                log.accept("Warning: npm cache may have permission issues, attempting to fix...");

                if (NpmPermissionHelper.cleanNpmCache(npmPath)) {
                    log.accept("npm cache cleaned successfully");
                } else if (NpmPermissionHelper.forceDeleteCache()) {
                    log.accept("npm cache directory deleted successfully");
                } else {
                    log.accept("Warning: Could not clean cache automatically, will try installation anyway");
                }
            }

            List<String> packages = sdk.getAllPackages();
            int maxRetries = 2;
            InstallResult lastResult = null;

            for (int attempt = 0; attempt <= maxRetries; attempt++) {
                if (attempt > 0) {
                    log.accept("\nRetry attempt " + attempt + "/" + maxRetries + "...");
                }

                log.accept("Running npm install...");
                List<String> command = NpmPermissionHelper.buildInstallCommandWithFallback(
                    npmPath, normalizedSdkDir, packages, attempt
                );

                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(sdkDir.toFile());
                pb.redirectErrorStream(true);
                configureProcessEnvironment(pb);

                Process process = pb.start();

                StringBuilder installLogs = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        log.accept(line);
                        installLogs.append(line).append("\n");
                    }
                }

                boolean finished = process.waitFor(3, TimeUnit.MINUTES);
                if (!finished) {
                    process.destroyForcibly();
                    lastResult = InstallResult.failure(sdkId,
                        "Installation timed out (3 minutes)", logs.toString());
                    continue;
                }

                int exitCode = process.exitValue();
                if (exitCode == 0) {
                    break;
                }

                String logsStr = logs.toString();
                lastResult = InstallResult.failure(sdkId,
                    "npm install failed with exit code: " + exitCode, logsStr);

                if (attempt == maxRetries) {
                    String solution = NpmPermissionHelper.generateErrorSolution(logsStr);
                    return InstallResult.failure(sdkId,
                        lastResult.getErrorMessage() + solution,
                        lastResult.getLogs());
                }

                boolean fixed = false;
                if (NpmPermissionHelper.hasPermissionError(logsStr) ||
                    NpmPermissionHelper.hasCacheError(logsStr)) {

                    log.accept("Detected npm cache/permission error, attempting to fix...");

                    if (NpmPermissionHelper.cleanNpmCache(npmPath)) {
                        log.accept("Cache cleaned, will retry");
                        fixed = true;
                    } else if (NpmPermissionHelper.forceDeleteCache()) {
                        log.accept("Cache deleted, will retry");
                        fixed = true;
                    }

                    if (!fixed && !PlatformUtils.isWindows()) {
                        log.accept("Attempting to fix cache ownership (may require password)...");
                        if (NpmPermissionHelper.fixCacheOwnership()) {
                            log.accept("Ownership fixed, will retry");
                            fixed = true;
                        }
                    }
                }

                if (!fixed) {
                    log.accept("Could not auto-fix the issue, will retry with --force flag");
                }

                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return InstallResult.failure(sdkId, "Installation interrupted", logs.toString());
                }
            }

            String installedVersion = getInstalledVersion(sdkId);
            Path markerFile = sdkDir.resolve(INSTALLED_MARKER);
            Files.writeString(markerFile, installedVersion != null ? installedVersion : "unknown");

            updateManifest(sdkId, installedVersion);

            log.accept("Installation completed successfully!");
            log.accept("Installed version: " + installedVersion);

            return InstallResult.success(sdkId, installedVersion, logs.toString());

        } catch (Exception e) {
            LOG.error("[DependencyManager] Installation failed: " + e.getMessage(), e);
            log.accept("ERROR: " + e.getMessage());
            return InstallResult.failure(sdkId, e.getMessage(), logs.toString());
        }
    }

    public boolean uninstallSdk(String sdkId) {
        try {
            Path sdkDir = getSdkDir(sdkId);
            if (!Files.exists(sdkDir)) {
                return true;
            }

            List<Path> failedPaths = deleteDirectory(sdkDir);

            removeFromManifest(sdkId);

            if (failedPaths.isEmpty()) {
                LOG.info("[DependencyManager] Uninstalled SDK completely: " + sdkId);
                return true;
            } else {
                LOG.warn("[DependencyManager] Uninstalled SDK with " + failedPaths.size() +
                    " files failed to delete: " + sdkId);
                return true;
            }
        } catch (Exception e) {
            LOG.error("[DependencyManager] Failed to uninstall SDK: " + e.getMessage(), e);
            return false;
        }
    }

    public JsonObject getAllSdkStatus() {
        JsonObject result = new JsonObject();

        for (SdkDefinition sdk : SdkDefinition.values()) {
            JsonObject status = new JsonObject();
            boolean installed = isInstalled(sdk.getId());

            status.addProperty("id", sdk.getId());
            status.addProperty("name", sdk.getDisplayName());
            status.addProperty("description", sdk.getDescription());
            status.addProperty("npmPackage", sdk.getNpmPackage());
            status.addProperty("installed", installed);
            status.addProperty("status", installed ? "installed" : "not_installed");

            if (installed) {
                String version = getInstalledVersion(sdk.getId());
                status.addProperty("installedVersion", version);
                status.addProperty("version", version);
            }

            result.add(sdk.getId(), status);
        }

        return result;
    }

    public boolean checkNodeEnvironment() {
        try {
            String nodePath = nodeDetector.findNodeExecutable();
            if (nodePath == null) {
                return false;
            }

            String version = nodeDetector.verifyNodePath(nodePath);
            return version != null;
        } catch (Exception e) {
            LOG.warn("[DependencyManager] Node.js environment check failed: " + e.getMessage());
            return false;
        }
    }

    private String getNpmPath(String nodePath) {
        String npmName = PlatformUtils.isWindows() ? "npm.cmd" : "npm";

        if (nodePath != null && !"node".equals(nodePath)) {
            File nodeFile = new File(nodePath);
            String dir = nodeFile.getParent();
            if (dir != null) {
                File npmFile = new File(dir, npmName);
                if (npmFile.exists()) {
                    return npmFile.getAbsolutePath();
                }
            }
        }

        if (PlatformUtils.isWindows()) {
            String pathEnv = System.getenv("PATH");
            if (pathEnv != null) {
                for (String pathDir : pathEnv.split(File.pathSeparator)) {
                    File npmFile = new File(pathDir, npmName);
                    if (npmFile.exists()) {
                        LOG.info("[DependencyManager] Found npm in PATH: " + npmFile.getAbsolutePath());
                        return npmFile.getAbsolutePath();
                    }
                }
            }
        }

        return PlatformUtils.isWindows() ? npmName : "npm";
    }

    private void configureProcessEnvironment(ProcessBuilder pb) {
        String nodePath = nodeDetector.findNodeExecutable();
        envConfigurator.updateProcessEnvironment(pb, nodePath);
    }

    private void createPackageJson(Path sdkDir, SdkDefinition sdk) throws IOException {
        JsonObject packageJson = new JsonObject();
        packageJson.addProperty("name", sdk.getId() + "-container");
        packageJson.addProperty("version", "1.0.0");
        packageJson.addProperty("private", true);

        Path packageJsonPath = sdkDir.resolve("package.json");
        try (Writer writer = Files.newBufferedWriter(packageJsonPath, StandardCharsets.UTF_8)) {
            gson.toJson(packageJson, writer);
        }
    }

    private void updateManifest(String sdkId, String version) {
        try {
            Path manifestPath = getDependenciesDir().resolve(MANIFEST_FILE);
            JsonObject manifest;

            if (Files.exists(manifestPath)) {
                try (Reader reader = Files.newBufferedReader(manifestPath, StandardCharsets.UTF_8)) {
                    manifest = JsonParser.parseReader(reader).getAsJsonObject();
                }
            } else {
                manifest = new JsonObject();
            }

            JsonObject sdkInfo = new JsonObject();
            sdkInfo.addProperty("version", version);
            sdkInfo.addProperty("installedAt", System.currentTimeMillis());
            manifest.add(sdkId, sdkInfo);

            try (Writer writer = Files.newBufferedWriter(manifestPath, StandardCharsets.UTF_8)) {
                gson.toJson(manifest, writer);
            }
        } catch (Exception e) {
            LOG.warn("[DependencyManager] Failed to update manifest: " + e.getMessage());
        }
    }

    private void removeFromManifest(String sdkId) {
        try {
            Path manifestPath = getDependenciesDir().resolve(MANIFEST_FILE);
            if (!Files.exists(manifestPath)) {
                return;
            }

            JsonObject manifest;
            try (Reader reader = Files.newBufferedReader(manifestPath, StandardCharsets.UTF_8)) {
                manifest = JsonParser.parseReader(reader).getAsJsonObject();
            }

            manifest.remove(sdkId);

            try (Writer writer = Files.newBufferedWriter(manifestPath, StandardCharsets.UTF_8)) {
                gson.toJson(manifest, writer);
            }
        } catch (Exception e) {
            LOG.warn("[DependencyManager] Failed to remove from manifest: " + e.getMessage());
        }
    }

    private List<Path> deleteDirectory(Path dir) throws IOException {
        List<Path> failedPaths = new ArrayList<>();

        if (!Files.exists(dir)) {
            return failedPaths;
        }

        Files.walk(dir)
            .sorted((a, b) -> b.compareTo(a))
            .forEach(path -> {
                try {
                    Files.delete(path);
                } catch (IOException e) {
                    LOG.warn("[DependencyManager] Failed to delete: " + path + " - " + e.getMessage());
                    failedPaths.add(path);
                }
            });

        if (!failedPaths.isEmpty()) {
            LOG.warn("[DependencyManager] " + failedPaths.size() + " files/directories failed to delete");
        }

        return failedPaths;
    }

    private int compareVersions(String v1, String v2) {
        if (v1 == null || v2 == null) {
            return 0;
        }

        v1 = v1.startsWith("v") ? v1.substring(1) : v1;
        v2 = v2.startsWith("v") ? v2.substring(1) : v2;

        String[] parts1 = v1.split("\\.");
        String[] parts2 = v2.split("\\.");

        int maxLen = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < maxLen; i++) {
            int num1 = i < parts1.length ? parseVersionPart(parts1[i]) : 0;
            int num2 = i < parts2.length ? parseVersionPart(parts2[i]) : 0;

            if (num1 != num2) {
                return num1 - num2;
            }
        }

        return 0;
    }

    private int parseVersionPart(String part) {
        Pattern pattern = Pattern.compile("^(\\d+)");
        Matcher matcher = pattern.matcher(part);
        if (matcher.find()) {
            return Integer.parseInt(matcher.group(1));
        }
        return 0;
    }
}
