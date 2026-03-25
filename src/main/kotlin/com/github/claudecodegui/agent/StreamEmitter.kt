package com.github.claudecodegui.agent

import com.github.claudecodegui.provider.common.MessageCallback
import com.github.claudecodegui.provider.common.SDKResult
import com.google.gson.Gson
import com.google.gson.JsonObject

/**
 * Bridges typed Kotlin agent events to the [MessageCallback] interface consumed
 * by [com.github.claudecodegui.session.ClaudeMessageHandler].
 *
 * Each method maps to one of the `type` strings that ClaudeMessageHandler.onMessage
 * switches on, keeping the message-type contract in a single place.
 */
class StreamEmitter(
    private val callback: MessageCallback,
    private val gson: Gson = Gson(),
) {

    // ── Streaming lifecycle ──────────────────────────────────────────────────

    /** Signal that a streaming response has started. */
    fun streamStart() {
        callback.onMessage("stream_start", "")
    }

    /** Signal that the streaming response has finished. */
    fun streamEnd() {
        callback.onMessage("stream_end", "")
    }

    // ── Content deltas ───────────────────────────────────────────────────────

    /**
     * Incremental text content chunk.
     * Drives [com.github.claudecodegui.session.ClaudeMessageHandler.handleContentDelta].
     */
    fun contentDelta(text: String) {
        callback.onMessage("content_delta", text)
    }

    /**
     * Incremental thinking (extended reasoning) chunk.
     * Drives [com.github.claudecodegui.session.ClaudeMessageHandler.handleThinkingDelta].
     */
    fun thinkingDelta(text: String) {
        callback.onMessage("thinking_delta", text)
    }

    // ── Session identity ─────────────────────────────────────────────────────

    /**
     * Propagate the Claude session ID returned by the SDK so that
     * [com.github.claudecodegui.session.SessionState] can persist it for resumption.
     */
    fun sessionId(id: String) {
        callback.onMessage("session_id", id)
    }

    // ── Tool events ──────────────────────────────────────────────────────────

    /**
     * A tool-use block emitted by the assistant.
     * [block] should be a JsonObject with at minimum `type`, `id`, `name`, and `input`.
     * It is serialised to JSON before dispatch so ClaudeMessageHandler receives the
     * same format it expects from the bridge.
     */
    fun toolUse(block: JsonObject) {
        // Wrap in the assistant message envelope that handleAssistantMessage expects.
        val contentArray = com.google.gson.JsonArray()
        contentArray.add(block)
        val messageObj = JsonObject()
        messageObj.add("content", contentArray)
        val envelope = JsonObject()
        envelope.addProperty("type", "assistant")
        envelope.add("message", messageObj)
        callback.onMessage("assistant", gson.toJson(envelope))
    }

    /**
     * A tool result returned to the model.
     * [result] should contain at minimum `tool_use_id` and `content`.
     */
    fun toolResult(result: JsonObject) {
        callback.onMessage("tool_result", gson.toJson(result))
    }

    // ── Turn boundary ────────────────────────────────────────────────────────

    /**
     * End of a single assistant message turn.
     * Causes ClaudeMessageHandler to clear busy/loading state.
     */
    fun messageEnd() {
        callback.onMessage("message_end", "")
    }

    // ── Usage / cost ─────────────────────────────────────────────────────────

    /**
     * Aggregate token-usage statistics for the turn.
     * [usage] should contain `input_tokens`, `output_tokens`, and optionally
     * `cache_creation_input_tokens` / `cache_read_input_tokens`.
     */
    fun result(usage: JsonObject) {
        val payload = JsonObject()
        payload.add("usage", usage)
        callback.onMessage("result", gson.toJson(payload))
    }

    // ── Terminal events ──────────────────────────────────────────────────────

    /**
     * Non-fatal error during the run — forwarded to [MessageCallback.onError].
     * The session is left open; the UI will render an error message.
     */
    fun error(msg: String) {
        callback.onError(msg)
    }

    /**
     * Terminal success — forwarded to [MessageCallback.onComplete].
     * [finalResult] is the last text output of the agent run, if any.
     */
    fun complete(finalResult: String?) {
        callback.onComplete(
            if (finalResult != null) SDKResult.success(finalResult)
            else SDKResult.success("")
        )
    }
}
