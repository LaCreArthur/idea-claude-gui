package com.github.claudecodegui.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NodeDetectionResult {

    public enum DetectionMethod {
        WHERE_COMMAND,
        WHICH_COMMAND,
        KNOWN_PATH,
        PATH_VARIABLE,
        FALLBACK
    }

    private final boolean found;
    private final String nodePath;
    private final String nodeVersion;
    private final DetectionMethod method;
    private final List<String> triedPaths;
    private final String errorMessage;

    private NodeDetectionResult(boolean found, String nodePath, String nodeVersion,
                                DetectionMethod method, List<String> triedPaths, String errorMessage) {
        this.found = found;
        this.nodePath = nodePath;
        this.nodeVersion = nodeVersion;
        this.method = method;
        this.triedPaths = triedPaths != null ? new ArrayList<>(triedPaths) : new ArrayList<>();
        this.errorMessage = errorMessage;
    }

    public static NodeDetectionResult success(String nodePath, String nodeVersion, DetectionMethod method) {
        return new NodeDetectionResult(true, nodePath, nodeVersion, method, null, null);
    }

    public static NodeDetectionResult success(String nodePath, String nodeVersion,
                                              DetectionMethod method, List<String> triedPaths) {
        return new NodeDetectionResult(true, nodePath, nodeVersion, method, triedPaths, null);
    }

    public static NodeDetectionResult failure(String errorMessage) {
        return new NodeDetectionResult(false, null, null, null, null, errorMessage);
    }

    public static NodeDetectionResult failure(String errorMessage, List<String> triedPaths) {
        return new NodeDetectionResult(false, null, null, null, triedPaths, errorMessage);
    }

    public boolean isFound() {
        return found;
    }

    public String getNodePath() {
        return nodePath;
    }

    public String getNodeVersion() {
        return nodeVersion;
    }

    public DetectionMethod getMethod() {
        return method;
    }

    public List<String> getTriedPaths() {
        return Collections.unmodifiableList(triedPaths);
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void addTriedPath(String path) {
        if (path != null && !path.isEmpty()) {
            this.triedPaths.add(path);
        }
    }

    public String getUserFriendlyMessage() {
        if (found) {
            return "Node.js detected: " + nodePath + " (" + nodeVersion + ")";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Node.js not found\n\n");

        if (errorMessage != null && !errorMessage.isEmpty()) {
            sb.append("Error: ").append(errorMessage).append("\n\n");
        }

        if (!triedPaths.isEmpty()) {
            sb.append("Tried paths:\n");
            for (String path : triedPaths) {
                sb.append("  - ").append(path).append("\n");
            }
            sb.append("\n");
        }

        String osName = System.getProperty("os.name", "").toLowerCase();
        if (osName.contains("win")) {
            sb.append("Windows installation:\n");
            sb.append("1. Download and install Node.js from https://nodejs.org/\n");
            sb.append("2. Restart IntelliJ IDEA after installation\n");
            sb.append("3. Ensure Node.js installation directory is added to system PATH\n");
        } else if (osName.contains("mac")) {
            sb.append("macOS installation:\n");
            sb.append("1. Using Homebrew: brew install node\n");
            sb.append("2. Or download from https://nodejs.org/\n");
        } else {
            sb.append("Linux installation:\n");
            sb.append("1. Ubuntu/Debian: sudo apt install nodejs\n");
            sb.append("2. CentOS/RHEL: sudo yum install nodejs\n");
            sb.append("3. Or use nvm: https://github.com/nvm-sh/nvm\n");
        }

        return sb.toString();
    }

    public String getMethodDescription() {
        if (method == null) {
            return "Unknown";
        }
        switch (method) {
            case WHERE_COMMAND:
                return "Windows where command";
            case WHICH_COMMAND:
                return "Unix which command";
            case KNOWN_PATH:
                return "Known installation path";
            case PATH_VARIABLE:
                return "PATH environment variable";
            case FALLBACK:
                return "Direct node invocation";
            default:
                return "Unknown";
        }
    }

    @Override
    public String toString() {
        return "NodeDetectionResult{" +
                "found=" + found +
                ", nodePath='" + nodePath + '\'' +
                ", nodeVersion='" + nodeVersion + '\'' +
                ", method=" + method +
                ", triedPaths=" + triedPaths +
                ", errorMessage='" + errorMessage + '\'' +
                '}';
    }
}
