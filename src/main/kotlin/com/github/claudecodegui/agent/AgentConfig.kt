package com.github.claudecodegui.agent

/**
 * All parameters needed to start a single agent session.
 *
 * Fields mirror the state held in [com.github.claudecodegui.session.SessionState]
 * plus the per-turn call-site parameters that aren't persisted there.
 */
data class AgentConfig(
    /** Claude session ID to resume, or null to start a fresh session. */
    val sessionId: String?,

    /** Absolute path to the working directory for this session. */
    val cwd: String,

    /** Model identifier, e.g. "claude-sonnet-4-6". */
    val model: String,

    /**
     * Permission mode: one of "default", "acceptEdits", or "bypassPermissions".
     * Mirrors [com.github.claudecodegui.session.SessionState.permissionMode].
     */
    val permissionMode: String,

    /**
     * Extended thinking budget in tokens (0 = disabled).
     * Mirrors [com.github.claudecodegui.session.SessionState.maxThinkingTokens].
     */
    val maxThinkingTokens: Int,

    /** Whether to use streaming responses. */
    val streaming: Boolean,

    /** Paths of files open in the editor, injected as context. */
    val openedFiles: List<String>,

    /** Optional system/agent prompt override. */
    val agentPrompt: String?,

    /** Image or file attachments to include with the first user message. */
    val attachments: List<Attachment>,

    /** Maximum agentic turns before the run is forcibly stopped. */
    val maxTurns: Int = 100,

    /** Maximum output tokens per turn. */
    val maxOutputTokens: Int = 16384,

    /** Whether to request the 1M-token context window beta flag. */
    val enable1MContext: Boolean = false,
)

/**
 * A base64-encoded file attachment (image, PDF, etc.) to be sent with a message.
 */
data class Attachment(
    /** Original file name, used for display and MIME resolution hints. */
    val fileName: String,

    /** MIME type, e.g. "image/png" or "application/pdf". */
    val mediaType: String,

    /** Base64-encoded file content. */
    val data: String,
)
