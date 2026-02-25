package com.github.claudecodegui.session;

import com.github.claudecodegui.ClaudeSession;

import java.util.ArrayList;
import java.util.List;

public class SessionState {
    private String sessionId;
    private String channelId;

    private boolean busy = false;
    private boolean loading = false;
    private String error = null;

    private final List<ClaudeSession.Message> messages = new ArrayList<>();

    private String summary = null;
    private long lastModifiedTime = System.currentTimeMillis();
    private String cwd = null;

    private String permissionMode = "default";
    private String model = "claude-sonnet-4-6";
    private String provider = "claude";

    private List<String> slashCommands = new ArrayList<>();

    private boolean psiContextEnabled = true;

    public String getSessionId() {
        return sessionId;
    }

    public String getChannelId() {
        return channelId;
    }

    public boolean isBusy() {
        return busy;
    }

    public boolean isLoading() {
        return loading;
    }

    public String getError() {
        return error;
    }

    public List<ClaudeSession.Message> getMessages() {
        return new ArrayList<>(messages);
    }

    public List<ClaudeSession.Message> getMessagesReference() {
        return messages;
    }

    public String getSummary() {
        return summary;
    }

    public long getLastModifiedTime() {
        return lastModifiedTime;
    }

    public String getCwd() {
        return cwd;
    }

    public String getPermissionMode() {
        return permissionMode;
    }

    public String getModel() {
        return model;
    }

    public String getProvider() {
        return provider;
    }

    public List<String> getSlashCommands() {
        return new ArrayList<>(slashCommands);
    }

    public boolean isPsiContextEnabled() {
        return psiContextEnabled;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public void setChannelId(String channelId) {
        this.channelId = channelId;
    }

    public void setBusy(boolean busy) {
        this.busy = busy;
    }

    public void setLoading(boolean loading) {
        this.loading = loading;
    }

    public void setError(String error) {
        this.error = error;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public void setLastModifiedTime(long lastModifiedTime) {
        this.lastModifiedTime = lastModifiedTime;
    }

    public void setCwd(String cwd) {
        this.cwd = cwd;
    }

    public void setPermissionMode(String permissionMode) {
        this.permissionMode = permissionMode;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public void setSlashCommands(List<String> slashCommands) {
        this.slashCommands = new ArrayList<>(slashCommands);
    }

    public void setPsiContextEnabled(boolean psiContextEnabled) {
        this.psiContextEnabled = psiContextEnabled;
    }

    public void addMessage(ClaudeSession.Message message) {
        messages.add(message);
    }

    public void clearMessages() {
        messages.clear();
    }

    public void updateLastModifiedTime() {
        this.lastModifiedTime = System.currentTimeMillis();
    }
}
