package com.github.claudecodegui.model;

public class DeleteResult {

    public enum ErrorType {
        NONE,
        FILE_LOCKED,
        PERMISSION_DENIED,
        FILE_NOT_FOUND,
        IO_ERROR,
        IN_USE,
        UNKNOWN
    }

    private final boolean success;
    private final String errorMessage;
    private final ErrorType errorType;
    private final String affectedPath;
    private final String suggestion;

    private DeleteResult(boolean success, ErrorType errorType, String errorMessage, String affectedPath, String suggestion) {
        this.success = success;
        this.errorType = errorType;
        this.errorMessage = errorMessage;
        this.affectedPath = affectedPath;
        this.suggestion = suggestion;
    }

    public static DeleteResult success() {
        return new DeleteResult(true, ErrorType.NONE, null, null, null);
    }

    public static DeleteResult success(String deletedPath) {
        return new DeleteResult(true, ErrorType.NONE, null, deletedPath, null);
    }

    public static DeleteResult failure(ErrorType errorType, String errorMessage) {
        return new DeleteResult(false, errorType, errorMessage, null, null);
    }

    public static DeleteResult failure(ErrorType errorType, String errorMessage, String affectedPath) {
        return new DeleteResult(false, errorType, errorMessage, affectedPath, null);
    }

    public static DeleteResult failure(ErrorType errorType, String errorMessage, String affectedPath, String suggestion) {
        return new DeleteResult(false, errorType, errorMessage, affectedPath, suggestion);
    }

    public static DeleteResult fromException(Exception e, String path) {
        ErrorType type = ErrorType.UNKNOWN;
        String message = e.getMessage();
        String suggestion = null;

        if (e instanceof java.io.FileNotFoundException) {
            type = ErrorType.FILE_NOT_FOUND;
            suggestion = "Please check if the file exists";
        } else if (e instanceof java.nio.file.AccessDeniedException ||
                   (message != null && message.toLowerCase().contains("access denied"))) {
            type = ErrorType.PERMISSION_DENIED;
            suggestion = "Please check file permissions or run as administrator";
        } else if (message != null && (message.toLowerCase().contains("locked") ||
                   message.toLowerCase().contains("being used"))) {
            type = ErrorType.FILE_LOCKED;
            suggestion = "Please close programs that may be using the file and try again";
        } else if (e instanceof java.io.IOException) {
            type = ErrorType.IO_ERROR;
            suggestion = "Please check disk space and file system status";
        }

        return new DeleteResult(false, type, message, path, suggestion);
    }

    public boolean isSuccess() {
        return success;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public ErrorType getErrorType() {
        return errorType;
    }

    public String getAffectedPath() {
        return affectedPath;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public String getUserFriendlyMessage() {
        if (success) {
            return "Operation successful";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Operation failed");

        if (errorMessage != null && !errorMessage.isEmpty()) {
            sb.append(": ").append(errorMessage);
        }

        if (affectedPath != null && !affectedPath.isEmpty()) {
            sb.append("\nFile: ").append(affectedPath);
        }

        if (suggestion != null && !suggestion.isEmpty()) {
            sb.append("\nSuggestion: ").append(suggestion);
        }

        return sb.toString();
    }

    @Override
    public String toString() {
        return "DeleteResult{" +
                "success=" + success +
                ", errorType=" + errorType +
                ", errorMessage='" + errorMessage + '\'' +
                ", affectedPath='" + affectedPath + '\'' +
                ", suggestion='" + suggestion + '\'' +
                '}';
    }
}
