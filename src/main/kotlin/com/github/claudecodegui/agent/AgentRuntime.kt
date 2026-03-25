package com.github.claudecodegui.agent

import com.anthropic.client.AnthropicClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicException
import com.anthropic.helpers.BetaMessageAccumulator
import com.anthropic.models.beta.messages.BetaBase64ImageSource
import com.anthropic.models.beta.messages.BetaContentBlockParam
import com.anthropic.models.beta.messages.BetaImageBlockParam
import com.anthropic.models.beta.messages.BetaMessageParam
import com.anthropic.models.beta.messages.BetaTextBlockParam
import com.anthropic.models.beta.messages.BetaThinkingConfigEnabled
import com.anthropic.models.beta.messages.BetaThinkingConfigParam
import com.anthropic.models.beta.messages.BetaTool
import com.anthropic.models.beta.messages.BetaToolResultBlockParam
import com.anthropic.models.beta.messages.BetaToolUseBlockParam
import com.anthropic.models.beta.messages.MessageCreateParams
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.Logger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Core agent loop for the Kotlin agent runtime.
 *
 * Replaces both bridge.js (599 LOC) and the Java process management layer (~3,500 LOC)
 * by calling the Anthropic Java SDK directly. Each [execute] call runs one full
 * agentic session: streaming → tool-use cycle → final result.
 *
 * Thread model: [execute] is a suspend function. The blocking SDK calls
 * ([createStreaming]) run on [Dispatchers.IO]. Tool execution and permission
 * checks run inline (PermissionGate suspends via CompletableFuture bridge).
 *
 * Abort: cancel the calling CoroutineScope. CancellationException propagates
 * through the IO dispatcher and causes OkHttp to cancel the in-flight request.
 */
class AgentRuntime(
    private val client: AnthropicClient,
    private val tools: ToolRegistry,
    private val permissionGate: PermissionGate,
    private val emitter: StreamEmitter,
) {

    private val LOG = Logger.getInstance(AgentRuntime::class.java)
    private val gson = Gson()

    companion object {
        private const val SYSTEM_PROMPT_TEMPLATE = """You are Claude, an AI assistant made by Anthropic. \
You are helping a developer write code in their IDE (JetBrains).
You have access to tools for reading, writing, and editing files, running commands, and searching the codebase.
The developer's working directory is: {cwd}"""
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Execute a full agent session for [userMessage].
     *
     * Emits streaming events through [emitter] as the session progresses.
     * Suspends until the session completes, the turn limit is reached,
     * or the coroutine is cancelled.
     *
     * Cancellation is clean: a [CancellationException] propagates through
     * the SDK's blocking stream call, which causes OkHttp to abort the
     * in-flight HTTP request.
     */
    suspend fun execute(config: AgentConfig, userMessage: String) {
        val systemPrompt = buildSystemPrompt(config)
        val messages = buildInitialMessages(config, userMessage)

        emitter.streamStart()

        var finalText: String? = null
        var totalInputTokens = 0L
        var totalOutputTokens = 0L
        var totalCacheCreationTokens = 0L
        var totalCacheReadTokens = 0L

        try {
            var turn = 0
            while (turn < config.maxTurns) {
                turn++
                LOG.debug("[AgentRuntime] Starting turn $turn/${config.maxTurns}")

                val params = buildParams(config, systemPrompt, messages)
                val accumulator = BetaMessageAccumulator.create()

                // Stream one model turn. Runs on IO dispatcher — blocking Java stream.
                val stopReason = withContext(Dispatchers.IO) {
                    streamTurn(params, accumulator)
                }

                val message = accumulator.message()

                // Accumulate usage across turns.
                val usage = message.usage()
                totalInputTokens += usage.inputTokens()
                totalOutputTokens += usage.outputTokens()
                usage.cacheCreationInputTokens().ifPresent { totalCacheCreationTokens += it }
                usage.cacheReadInputTokens().ifPresent { totalCacheReadTokens += it }

                LOG.debug("[AgentRuntime] Turn $turn complete, stop_reason=$stopReason")

                // Collect text content for the final result.
                message.content().forEach { block ->
                    block.text().ifPresent { finalText = (finalText ?: "") + it.text() }
                }

                // Extract all tool-use blocks from this turn.
                val toolUseBlocks = message.content().mapNotNull { block ->
                    block.toolUse().orElse(null)
                }

                // ── End conditions ──────────────────────────────────────────
                if (stopReason == "end_turn" || stopReason == "max_tokens" || toolUseBlocks.isEmpty()) {
                    emitter.messageEnd()
                    break
                }

                // ── Tool-use cycle ──────────────────────────────────────────
                if (stopReason == "tool_use") {
                    emitter.messageEnd()

                    // Append the assistant turn to the conversation.
                    messages.add(assistantMessageParam(message.content()))

                    // Execute each tool and collect results.
                    val toolResults = mutableListOf<BetaContentBlockParam>()

                    for (toolUseBlock in toolUseBlocks) {
                        val toolId = toolUseBlock.id()
                        val toolName = toolUseBlock.name()
                        val rawInput = toolUseBlock._input()

                        // Emit the tool-use event to the UI.
                        emitter.toolUse(buildToolUseJson(toolId, toolName, rawInput))

                        // Resolve input to a JsonObject for PermissionGate and ToolRegistry.
                        val inputJson = rawInput?.let { jsonValueToJsonObject(it) } ?: JsonObject()
                        val inputStr = gson.toJson(inputJson)

                        // Permission check (may suspend for user dialog).
                        val permission = permissionGate.check(toolName, inputStr)

                        val resultContent: String
                        val isError: Boolean

                        if (permission.allowed) {
                            val toolResult = tools.execute(toolName, inputJson)
                            resultContent = toolResult.content
                            isError = toolResult.isError
                        } else {
                            resultContent = permission.message
                                ?: "Permission denied for tool: $toolName"
                            isError = true
                        }

                        // Emit tool result to UI.
                        emitter.toolResult(buildToolResultJson(toolId, resultContent, isError))

                        // Build the tool-result block for the API message.
                        toolResults.add(
                            BetaContentBlockParam.ofToolResult(
                                BetaToolResultBlockParam.builder()
                                    .toolUseId(toolId)
                                    .content(resultContent)
                                    .isError(isError)
                                    .build()
                            )
                        )
                    }

                    // Append tool results as a user turn.
                    messages.add(
                        BetaMessageParam.builder()
                            .role(BetaMessageParam.Role.USER)
                            .content(BetaMessageParam.Content.ofBetaContentBlockParams(toolResults))
                            .build()
                    )

                    // Continue the loop for the next model turn.
                    continue
                }

                // Unhandled stop reason — treat as terminal.
                LOG.warn("[AgentRuntime] Unexpected stop_reason: $stopReason, ending session")
                emitter.messageEnd()
                break
            }

            if (turn >= config.maxTurns) {
                LOG.info("[AgentRuntime] Reached maxTurns (${config.maxTurns})")
                emitter.error("Turn limit reached (${config.maxTurns} turns). Start a new message to continue.")
            }

            // Emit aggregate usage.
            emitter.result(buildUsageJson(
                totalInputTokens,
                totalOutputTokens,
                totalCacheCreationTokens,
                totalCacheReadTokens,
            ))
            emitter.streamEnd()
            emitter.complete(finalText)

        } catch (e: CancellationException) {
            LOG.info("[AgentRuntime] Session cancelled by user")
            emitter.streamEnd()
            // Do not call emitter.complete() — the session was aborted.
            throw e  // Re-throw so the coroutine machinery sees the cancellation.

        } catch (e: AnthropicException) {
            val msg = "Anthropic API error: ${e.message}"
            LOG.error("[AgentRuntime] $msg", e)
            emitter.error(msg)
            emitter.streamEnd()
            emitter.complete(null)

        } catch (e: Exception) {
            val msg = "Agent error: ${e.message}"
            LOG.error("[AgentRuntime] $msg", e)
            emitter.error(msg)
            emitter.streamEnd()
            emitter.complete(null)
        }
    }

    // -------------------------------------------------------------------------
    // Streaming
    // -------------------------------------------------------------------------

    /**
     * Run a single streaming model turn.
     *
     * Must be called on a blocking-IO dispatcher. Uses try-with-resources
     * on the [com.anthropic.core.http.StreamResponse] to ensure the OkHttp
     * response body is closed even on cancellation.
     *
     * Event discrimination follows the SDK's Optional-based visitor pattern:
     * each event exposes `.contentBlockDelta()`, `.messageDelta()`, etc. which
     * return `Optional<T>`. We use `.ifPresent {}` to handle each variant.
     *
     * @return The model's `stop_reason` string (e.g. `"end_turn"`, `"tool_use"`).
     */
    private fun streamTurn(
        params: MessageCreateParams,
        accumulator: BetaMessageAccumulator,
    ): String {
        var stopReason = "end_turn"

        client.beta().messages().createStreaming(params).use { streamResponse ->
            streamResponse.stream().forEach { event ->
                // Feed every event into the accumulator to build the full message.
                accumulator.accumulate(event)

                // content_block_delta — text and thinking deltas.
                event.contentBlockDelta().ifPresent { deltaEvent ->
                    val delta = deltaEvent.delta()

                    // Text delta → content_delta to webview.
                    delta.text().ifPresent { textDelta ->
                        emitter.contentDelta(textDelta.text())
                    }

                    // Thinking delta → thinking_delta to webview (extended reasoning).
                    delta.thinking().ifPresent { thinkingDelta ->
                        emitter.thinkingDelta(thinkingDelta.thinking())
                    }
                }

                // message_delta — captures stop_reason for the turn-end decision.
                event.messageDelta().ifPresent { messageDelta ->
                    messageDelta.delta().stopReason().ifPresent { reason ->
                        stopReason = reason.toString()
                    }
                }

                // message_start / content_block_start / content_block_stop / message_stop
                // — no action needed; accumulator handles them.
            }
        }

        return stopReason
    }

    // -------------------------------------------------------------------------
    // Message building
    // -------------------------------------------------------------------------

    private fun buildSystemPrompt(config: AgentConfig): String {
        if (!config.agentPrompt.isNullOrBlank()) return config.agentPrompt
        return SYSTEM_PROMPT_TEMPLATE.replace("{cwd}", config.cwd)
    }

    /**
     * Build the initial message list from [userMessage] plus any [Attachment]s.
     *
     * If attachments are present, the first user message is a multi-part content
     * block (image/document + text). Otherwise it's a simple text message.
     */
    private fun buildInitialMessages(
        config: AgentConfig,
        userMessage: String,
    ): MutableList<BetaMessageParam> {
        if (config.attachments.isEmpty()) {
            return mutableListOf(
                BetaMessageParam.builder()
                    .role(BetaMessageParam.Role.USER)
                    .content(userMessage)
                    .build()
            )
        }

        // Build a multi-part content block with attachments + text.
        val contentBlocks = mutableListOf<BetaContentBlockParam>()

        for (attachment in config.attachments) {
            // Only images are supported as inline content blocks in the Messages API.
            // Non-image attachments are injected as a text description instead.
            if (attachment.mediaType.startsWith("image/")) {
                contentBlocks.add(
                    BetaContentBlockParam.ofImage(
                        BetaImageBlockParam.builder()
                            .source(
                                BetaBase64ImageSource.builder()
                                    .mediaType(resolveImageMediaType(attachment.mediaType))
                                    .data(attachment.data)
                                    .build()
                            )
                            .build()
                    )
                )
            } else {
                // Inject non-image as a text note (PDF etc. not yet supported inline).
                contentBlocks.add(
                    BetaContentBlockParam.ofText(
                        BetaTextBlockParam.builder()
                            .text("[Attachment: ${attachment.fileName} (${attachment.mediaType}) — binary content not shown]")
                            .build()
                    )
                )
            }
        }

        // Append the user's text message last.
        contentBlocks.add(
            BetaContentBlockParam.ofText(
                BetaTextBlockParam.builder()
                    .text(userMessage)
                    .build()
            )
        )

        return mutableListOf(
            BetaMessageParam.builder()
                .role(BetaMessageParam.Role.USER)
                .content(BetaMessageParam.Content.ofBetaContentBlockParams(contentBlocks))
                .build()
        )
    }

    /**
     * Build the [MessageCreateParams] for a single API call.
     *
     * Injects tools from [ToolRegistry], adds thinking config if requested,
     * and sets system prompt + conversation history.
     */
    private fun buildParams(
        config: AgentConfig,
        systemPrompt: String,
        messages: List<BetaMessageParam>,
    ): MessageCreateParams {
        val builder = MessageCreateParams.builder()
            .model(config.model)
            .maxTokens(config.maxOutputTokens.toLong())
            .system(
                MessageCreateParams.System.ofBetaTextBlockParams(
                    listOf(BetaTextBlockParam.builder().text(systemPrompt).build())
                )
            )
            .messages(messages)

        // Register tools from ToolRegistry.
        tools.definitions().forEach { toolElement ->
            val toolObj = toolElement.asJsonObject
            val tool: BetaTool = buildBetaTool(toolObj)
            builder.addTool(tool)
        }

        // Extended thinking (if budget > 0).
        if (config.maxThinkingTokens > 0) {
            builder.thinking(
                BetaThinkingConfigParam.ofEnabled(
                    BetaThinkingConfigEnabled.builder()
                        .budgetTokens(config.maxThinkingTokens.toLong())
                        .build()
                )
            )
        }

        return builder.build()
    }

    /**
     * Convert a [BetaContentBlock] list (from an accumulated assistant message)
     * back into a [BetaMessageParam] to append to the conversation.
     *
     * Only text and tool_use blocks are included — other block types (thinking,
     * redacted_thinking) are forwarded as-is using the raw JSON value route.
     */
    private fun assistantMessageParam(
        content: List<com.anthropic.models.beta.messages.BetaContentBlock>,
    ): BetaMessageParam {
        val blocks = content.mapNotNull { block ->
            when {
                block.isText() -> BetaContentBlockParam.ofText(
                    BetaTextBlockParam.builder()
                        .text(block.asText().text())
                        .build()
                )
                block.isToolUse() -> {
                    val tu = block.asToolUse()
                    BetaContentBlockParam.ofToolUse(
                        BetaToolUseBlockParam.builder()
                            .id(tu.id())
                            .name(tu.name())
                            .input(tu._input() ?: JsonValue.from(mapOf<String, Any>()))
                            .build()
                    )
                }
                // thinking / redacted_thinking blocks cannot be echoed back — skip them.
                else -> null
            }
        }

        return BetaMessageParam.builder()
            .role(BetaMessageParam.Role.ASSISTANT)
            .content(BetaMessageParam.Content.ofBetaContentBlockParams(blocks))
            .build()
    }

    // -------------------------------------------------------------------------
    // Tool schema helpers
    // -------------------------------------------------------------------------

    /**
     * Convert a raw-JSON tool schema object from [ToolRegistry.definitions]
     * into a [BetaTool] for the API request.
     *
     * Expected schema shape:
     * ```json
     * { "name": "...", "description": "...", "input_schema": { "type": "object", ... } }
     * ```
     */
    private fun buildBetaTool(toolSchema: JsonObject): BetaTool {
        val name = toolSchema.get("name")?.asString ?: error("Tool schema missing 'name'")
        val description = toolSchema.get("description")?.asString ?: ""
        val inputSchema = toolSchema.get("input_schema")?.asJsonObject ?: JsonObject()

        val schemaBuilder = BetaTool.InputSchema.builder()
            .type(JsonValue.from("object"))

        inputSchema.get("properties")?.let { props ->
            // Build a Properties object by putting each property key as an additional property.
            // IMPORTANT: Convert Gson JsonElement → JSON string → Jackson parse, because
            // JsonValue.from(gsonElement) wraps the Gson type, and Jackson can't serialize it.
            val propsBuilder = BetaTool.InputSchema.Properties.builder()
            if (props.isJsonObject) {
                props.asJsonObject.entrySet().forEach { (key, value) ->
                    propsBuilder.putAdditionalProperty(key, gsonToJsonValue(value))
                }
            }
            schemaBuilder.properties(propsBuilder.build())
        }

        inputSchema.get("required")?.let { req ->
            if (req.isJsonArray) {
                val requiredList = req.asJsonArray.map { it.asString }
                schemaBuilder.required(requiredList)
            }
        }

        return BetaTool.builder()
            .name(name)
            .description(description)
            .inputSchema(schemaBuilder.build())
            .build()
    }

    // -------------------------------------------------------------------------
    // JSON helpers for StreamEmitter
    // -------------------------------------------------------------------------

    /**
     * Build the tool-use [JsonObject] that [StreamEmitter.toolUse] expects.
     * Shape: `{ "type": "tool_use", "id": "...", "name": "...", "input": {...} }`
     */
    private fun buildToolUseJson(
        toolId: String,
        toolName: String,
        rawInput: JsonValue?,
    ): JsonObject {
        val obj = JsonObject()
        obj.addProperty("type", "tool_use")
        obj.addProperty("id", toolId)
        obj.addProperty("name", toolName)
        obj.add("input", rawInput?.let { jsonValueToJsonElement(it) } ?: JsonObject())
        return obj
    }

    /**
     * Build the tool-result [JsonObject] that [StreamEmitter.toolResult] expects.
     * Shape: `{ "tool_use_id": "...", "content": "...", "is_error": false }`
     */
    private fun buildToolResultJson(
        toolId: String,
        content: String,
        isError: Boolean,
    ): JsonObject {
        val obj = JsonObject()
        obj.addProperty("tool_use_id", toolId)
        obj.addProperty("content", content)
        obj.addProperty("is_error", isError)
        return obj
    }

    /**
     * Build the usage [JsonObject] for [StreamEmitter.result].
     * Shape mirrors bridge.js: `{ "input_tokens": N, "output_tokens": N, ... }`
     */
    private fun buildUsageJson(
        inputTokens: Long,
        outputTokens: Long,
        cacheCreationTokens: Long,
        cacheReadTokens: Long,
    ): JsonObject {
        val obj = JsonObject()
        obj.addProperty("input_tokens", inputTokens)
        obj.addProperty("output_tokens", outputTokens)
        if (cacheCreationTokens > 0) obj.addProperty("cache_creation_input_tokens", cacheCreationTokens)
        if (cacheReadTokens > 0) obj.addProperty("cache_read_input_tokens", cacheReadTokens)
        return obj
    }

    // -------------------------------------------------------------------------
    // Type conversion utilities
    // -------------------------------------------------------------------------

    /**
     * Convert a Gson [com.google.gson.JsonElement] to an Anthropic SDK [JsonValue].
     * Serialises to JSON string and re-parses with Jackson (via JsonValue.from on a Map/List).
     * This avoids the "No serializer found for class com.google.gson.JsonObject" error
     * that occurs when Gson types leak into Jackson-serialized SDK objects.
     */
    @Suppress("UNCHECKED_CAST")
    private fun gsonToJsonValue(element: com.google.gson.JsonElement): JsonValue {
        // Round-trip through JSON string → generic Java types → JsonValue
        val javaObj = gson.fromJson<Any>(element, Any::class.java)
        return JsonValue.from(javaObj)
    }

    /**
     * Convert an Anthropic SDK [JsonValue] to a Gson [JsonObject].
     * Used to pass tool inputs into [ToolRegistry.execute] and [PermissionGate.check].
     *
     * Serialises the [JsonValue] to a JSON string and re-parses with Gson.
     * This is the safest conversion path given the two incompatible JSON libraries.
     */
    private fun jsonValueToJsonObject(value: JsonValue): JsonObject {
        return try {
            // JsonValue.toString() produces valid JSON for object/array/scalar values.
            val raw = value.toString()
            val element = JsonParser.parseString(raw)
            if (element.isJsonObject) element.asJsonObject else JsonObject()
        } catch (_: Exception) {
            JsonObject()
        }
    }

    /**
     * Convert an Anthropic SDK [JsonValue] to a Gson [com.google.gson.JsonElement].
     * Used to populate the `input` field in tool-use event payloads.
     */
    private fun jsonValueToJsonElement(value: JsonValue): com.google.gson.JsonElement {
        return try {
            JsonParser.parseString(value.toString())
        } catch (_: Exception) {
            JsonObject()
        }
    }

    /**
     * Resolve a MIME type string to the [BetaBase64ImageSource.MediaType] enum.
     * Defaults to JPEG for unrecognised types.
     */
    private fun resolveImageMediaType(
        mimeType: String,
    ): BetaBase64ImageSource.MediaType {
        return when (mimeType.lowercase()) {
            "image/png"  -> BetaBase64ImageSource.MediaType.IMAGE_PNG
            "image/gif"  -> BetaBase64ImageSource.MediaType.IMAGE_GIF
            "image/webp" -> BetaBase64ImageSource.MediaType.IMAGE_WEBP
            else         -> BetaBase64ImageSource.MediaType.IMAGE_JPEG
        }
    }
}
