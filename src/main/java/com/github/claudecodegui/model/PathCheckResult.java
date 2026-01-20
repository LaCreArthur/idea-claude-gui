package com.github.claudecodegui.model;

public class PathCheckResult {

    public enum ResultLevel {
        OK,
        WARNING,
        ERROR
    }

    private final ResultLevel level;
    private final String message;
    private final String path;
    private final int pathLength;

    private PathCheckResult(ResultLevel level, String message, String path, int pathLength) {
        this.level = level;
        this.message = message;
        this.path = path;
        this.pathLength = pathLength;
    }

    public static PathCheckResult ok() {
        return new PathCheckResult(ResultLevel.OK, null, null, 0);
    }

    public static PathCheckResult ok(String path, int pathLength) {
        return new PathCheckResult(ResultLevel.OK, null, path, pathLength);
    }

    public static PathCheckResult warning(String message) {
        return new PathCheckResult(ResultLevel.WARNING, message, null, 0);
    }

    public static PathCheckResult warning(String message, String path, int pathLength) {
        return new PathCheckResult(ResultLevel.WARNING, message, path, pathLength);
    }

    public static PathCheckResult error(String message) {
        return new PathCheckResult(ResultLevel.ERROR, message, null, 0);
    }

    public static PathCheckResult error(String message, String path, int pathLength) {
        return new PathCheckResult(ResultLevel.ERROR, message, path, pathLength);
    }

    public ResultLevel getLevel() {
        return level;
    }

    public String getMessage() {
        return message;
    }

    public String getPath() {
        return path;
    }

    public int getPathLength() {
        return pathLength;
    }

    public boolean isOk() {
        return level == ResultLevel.OK;
    }

    public boolean isWarning() {
        return level == ResultLevel.WARNING;
    }

    public boolean isError() {
        return level == ResultLevel.ERROR;
    }

    public boolean hasIssue() {
        return level != ResultLevel.OK;
    }

    @Override
    public String toString() {
        return "PathCheckResult{" +
                "level=" + level +
                ", message='" + message + '\'' +
                ", path='" + path + '\'' +
                ", pathLength=" + pathLength +
                '}';
    }
}
