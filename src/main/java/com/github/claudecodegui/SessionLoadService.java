package com.github.claudecodegui;

/**
 * Session Load Service (Singleton).
 * Used to pass session load requests between "History Sessions" and "Claude Code GUI" tool windows.
 */
public class SessionLoadService {

    private static final SessionLoadService INSTANCE = new SessionLoadService();

    private SessionLoadListener listener;
    private String pendingSessionId;
    private String pendingProjectPath;

    private SessionLoadService() {
    }

    public static SessionLoadService getInstance() {
        return INSTANCE;
    }

    /**
     * Session load listener.
     */
    public interface SessionLoadListener {
        void onLoadSessionRequest(String sessionId, String projectPath);
    }

    /**
     * Set the listener (called by Claude Code GUI window).
     */
    public void setListener(SessionLoadListener listener) {
        this.listener = listener;

        // If there's a pending load request, trigger it immediately
        if (pendingSessionId != null && listener != null) {
            listener.onLoadSessionRequest(pendingSessionId, pendingProjectPath);
            pendingSessionId = null;
            pendingProjectPath = null;
        }
    }

    /**
     * Request to load a session (called by "History Sessions" window).
     */
    public void requestLoadSession(String sessionId, String projectPath) {
        if (listener != null) {
            listener.onLoadSessionRequest(sessionId, projectPath);
        } else {
            // If listener is not set yet, save the pending request
            pendingSessionId = sessionId;
            pendingProjectPath = projectPath;
        }
    }

}
