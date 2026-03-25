package com.github.claudecodegui.agent

import com.github.claudecodegui.permission.PermissionService
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Outcome of a permission check.
 *
 * @property allowed Whether the tool invocation may proceed.
 * @property message Optional explanation (populated on deny or dialog error).
 */
data class PermissionResult(
    val allowed: Boolean,
    val message: String? = null,
)

/**
 * Suspending bridge between the Kotlin agent coroutine and the Java
 * [PermissionService].
 *
 * Decision order:
 * 1. "bypassPermissions" mode → auto-allow everything.
 * 2. Read-only tools (Read, Glob, Grep) → always allowed without a dialog.
 * 3. "acceptEdits" mode → auto-allow write tools (Edit, Write, MultiEdit).
 * 4. Everything else → suspend the coroutine and delegate to
 *    [PermissionService.requestPermissionDirect], which shows the IDE dialog.
 *    The coroutine resumes when the user responds.
 */
class PermissionGate(
    private val permissionService: PermissionService,
    private val permissionMode: String,
    private val gson: Gson = Gson(),
) {

    companion object {
        /** Tools that only read; never need a dialog under any mode. */
        private val READ_ONLY_TOOLS = setOf("Read", "Glob", "Grep", "LS")

        /** Tools that write files; auto-allowed when mode is "acceptEdits". */
        private val WRITE_TOOLS = setOf("Edit", "Write", "MultiEdit", "NotebookEdit")
    }

    /**
     * Check whether [toolName] with [inputsJson] may proceed.
     *
     * This function is safe to call from any coroutine context; the underlying
     * [CompletableFuture] from [PermissionService] is bridged via
     * [suspendCancellableCoroutine] so no thread is blocked.
     *
     * @param toolName The Claude SDK tool name, e.g. "Edit" or "Bash".
     * @param inputsJson Raw JSON string of the tool's input parameters.
     */
    suspend fun check(toolName: String, inputsJson: String): PermissionResult {
        // 1. Bypass mode: skip all checks.
        if (permissionMode == "bypassPermissions") {
            return PermissionResult(allowed = true)
        }

        // 2. Read-only tools: never prompt.
        if (toolName in READ_ONLY_TOOLS) {
            return PermissionResult(allowed = true)
        }

        // 3. acceptEdits: auto-allow write tools.
        if (permissionMode == "acceptEdits" && toolName in WRITE_TOOLS) {
            return PermissionResult(allowed = true)
        }

        // 4. Everything else: ask the user via the IDE dialog.
        val inputs: JsonObject = try {
            gson.fromJson(inputsJson, JsonObject::class.java) ?: JsonObject()
        } catch (_: Exception) {
            JsonObject()
        }

        return suspendCancellableCoroutine { continuation ->
            val future = permissionService.requestPermissionDirect(toolName, inputs)

            // Resume the coroutine when the CompletableFuture completes.
            future.whenComplete { response, throwable ->
                if (continuation.isActive) {
                    when {
                        throwable != null -> continuation.resumeWithException(throwable)
                        response == null -> continuation.resume(
                            PermissionResult(allowed = false, message = "No response from permission dialog")
                        )
                        else -> {
                            val allowed = response.has("allow") && response.get("allow").asBoolean
                            val message = if (response.has("message") && !response.get("message").isJsonNull)
                                response.get("message").asString
                            else null
                            continuation.resume(PermissionResult(allowed = allowed, message = message))
                        }
                    }
                }
            }

            // If the coroutine is cancelled (e.g. session abort), cancel the future too.
            continuation.invokeOnCancellation {
                future.cancel(true)
            }
        }
    }
}
