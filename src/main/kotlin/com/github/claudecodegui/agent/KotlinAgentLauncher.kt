package com.github.claudecodegui.agent

import com.anthropic.client.AnthropicClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.CompletableFuture
import kotlin.coroutines.cancellation.CancellationException

/**
 * Java-friendly launcher for the Kotlin [AgentRuntime].
 *
 * Calling Kotlin suspend functions directly from Java requires manual Continuation
 * plumbing. This object exposes a clean, Java-callable API that:
 *  - Creates a per-query [CoroutineScope] on [Dispatchers.IO]
 *  - Bridges the coroutine completion to a [CompletableFuture]
 *  - Returns both the future and the scope so the caller can cancel on abort
 */
object KotlinAgentLauncher {

    /**
     * Launch a single agent session.
     *
     * @param runtime       The [AgentRuntime] to execute.
     * @param config        Session configuration.
     * @param userMessage   The user's input text.
     * @return A [LaunchResult] containing the scope (for abort) and the future (for completion).
     */
    @JvmStatic
    fun launch(
        runtime: AgentRuntime,
        config: AgentConfig,
        userMessage: String,
    ): LaunchResult {
        val scope = CoroutineScope(Dispatchers.IO)
        val future = CompletableFuture<Void>()

        scope.launch {
            try {
                runtime.execute(config, userMessage)
                future.complete(null)
            } catch (e: CancellationException) {
                // User abort — treat as graceful completion from the Java side.
                future.complete(null)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return LaunchResult(scope, future)
    }

    /**
     * Cancel the coroutine scope for an in-flight agent session.
     *
     * Safe to call even if the scope has already completed.
     */
    @JvmStatic
    fun cancel(scope: CoroutineScope) {
        scope.cancel()
    }

    /**
     * Result of [launch]: a scope for abort and a future for completion tracking.
     */
    class LaunchResult(
        val scope: CoroutineScope,
        val future: CompletableFuture<Void>,
    )
}
