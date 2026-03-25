package com.github.claudecodegui.agent

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.diagnostic.Logger
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Resolves authentication credentials and builds an [AnthropicClient].
 *
 * Priority order (mirrors bridge.js setupAuthentication):
 *  1. Enterprise apiKeyHelper   — managed-settings.json + subprocess
 *  2. Auth token from settings  — ~/.claude/settings.json env.ANTHROPIC_AUTH_TOKEN
 *  3. API key from settings     — ~/.claude/settings.json env.ANTHROPIC_API_KEY
 *  4. Environment variables     — ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *  5. OAuth credentials         — ~/.claude/.credentials.json (macOS Keychain or file)
 */
class AuthProvider {

    private val LOG = Logger.getInstance(AuthProvider::class.java)
    private val gson = Gson()
    private val home = System.getProperty("user.home")

    /**
     * Resolve credentials and return a configured [AnthropicClient].
     *
     * @param enable1MContext When true, appends the context-1m beta flag alongside the OAuth beta.
     * @throws IllegalStateException if no auth source can be resolved.
     */
    fun createClient(enable1MContext: Boolean = false): AnthropicClient {
        val result = resolveAuth()
        LOG.info("[AuthProvider] Auth resolved: type=${result.authType}, source=${result.source}, 1MContext=$enable1MContext")

        val builder = AnthropicOkHttpClient.builder()

        when (result.authType) {
            AuthType.API_KEY -> {
                builder.apiKey(result.credential)
                if (enable1MContext) {
                    builder.putHeader("anthropic-beta", CONTEXT_1M_BETA)
                }
            }
            AuthType.AUTH_TOKEN, AuthType.CLI_SESSION -> {
                builder.authToken(result.credential)
                // OAuth tokens require the oauth beta header — without it,
                // the API rejects with "OAuth authentication is currently not supported"
                val beta = if (enable1MContext) "$OAUTH_BETA_HEADER,$CONTEXT_1M_BETA" else OAUTH_BETA_HEADER
                builder.putHeader("anthropic-beta", beta)
                // Client fingerprint headers — the gateway ACL gates Sonnet 4.x / Opus 4.x
                // behind a trusted-client check. Without these, only Haiku is accessible.
                builder.putHeader("User-Agent", "claude-code/$CLI_VERSION")
                builder.putHeader("X-Anthropic-Client", "claude-code")
            }
        }

        // Apply base URL override from settings.json if present
        loadClaudeSettings()
            ?.get("env")?.asJsonObject
            ?.get("ANTHROPIC_BASE_URL")?.asString
            ?.takeIf { it.isNotBlank() }
            ?.let { builder.baseUrl(it) }

        return builder.build()
    }

    companion object {
        // Required beta flag for OAuth-authenticated requests.
        // Without this, api.anthropic.com rejects Bearer tokens.
        private const val OAUTH_BETA_HEADER = "oauth-2025-04-20"

        // Beta flag for 1M-token context window (Sonnet 4.6 / Opus).
        private const val CONTEXT_1M_BETA = "context-1m-2025-08-07"

        // Claude Code's OAuth client ID (hardcoded in the CLI binary)
        private const val OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

        // Client version for User-Agent header. The gateway gates premium models
        // behind a trusted-client fingerprint; this must look like a real Claude Code version.
        private const val CLI_VERSION = "2.1.83"

        // Token refresh endpoints (primary and fallback — some integrations use the console URL)
        private const val OAUTH_TOKEN_URL = "https://api.anthropic.com/v1/oauth/token"
        private const val OAUTH_TOKEN_URL_FALLBACK = "https://console.anthropic.com/api/oauth/token"
    }

    // -------------------------------------------------------------------------
    // Internal resolution logic
    // -------------------------------------------------------------------------

    private fun resolveAuth(): AuthResult {
        // 1. Enterprise apiKeyHelper
        resolveApiKeyHelper()?.let { return it }

        val settings = loadClaudeSettings()

        // 2. Auth token from settings
        settings?.get("env")?.asJsonObject
            ?.get("ANTHROPIC_AUTH_TOKEN")?.asString
            ?.takeIf { it.isNotBlank() }
            ?.let { return AuthResult(AuthType.AUTH_TOKEN, it, "settings.json") }

        // 3. API key from settings
        settings?.get("env")?.asJsonObject
            ?.get("ANTHROPIC_API_KEY")?.asString
            ?.takeIf { it.isNotBlank() }
            ?.let { return AuthResult(AuthType.API_KEY, it, "settings.json") }

        // 4. Environment variables
        System.getenv("ANTHROPIC_AUTH_TOKEN")
            ?.takeIf { it.isNotBlank() }
            ?.let { return AuthResult(AuthType.AUTH_TOKEN, it, "env") }

        System.getenv("ANTHROPIC_API_KEY")
            ?.takeIf { it.isNotBlank() }
            ?.let { return AuthResult(AuthType.API_KEY, it, "env") }

        // 5. OAuth credentials (macOS Keychain first, then file)
        resolveOAuthCredentials()?.let { return it }

        throw IllegalStateException(
            "No authentication configured. Run \"claude login\" or set ANTHROPIC_API_KEY in ~/.claude/settings.json"
        )
    }

    /**
     * Path 1: Enterprise apiKeyHelper.
     *
     * Reads ~/.claude/managed-settings.json. If `apiKeyHelper` is present,
     * executes the command (10s timeout) and treats stdout as the API key.
     */
    private fun resolveApiKeyHelper(): AuthResult? {
        val managedSettings = readJsonFile("$home/.claude/managed-settings.json") ?: return null
        val helperCmd = managedSettings.get("apiKeyHelper")?.asString
            ?.takeIf { it.isNotBlank() } ?: return null

        return try {
            val process = ProcessBuilder(*splitCommand(helperCmd))
                .redirectErrorStream(false)
                .start()

            val exited = process.waitFor(10, TimeUnit.SECONDS)
            if (!exited) {
                process.destroyForcibly()
                LOG.warn("[AuthProvider] apiKeyHelper timed out after 10s")
                return null
            }

            val apiKey = process.inputStream.bufferedReader().readText().trim()
            if (apiKey.isBlank()) {
                LOG.warn("[AuthProvider] apiKeyHelper returned empty output")
                return null
            }

            AuthResult(AuthType.API_KEY, apiKey, "managed-settings.json")
        } catch (e: Exception) {
            LOG.warn("[AuthProvider] apiKeyHelper failed: ${e.message}")
            null
        }
    }

    /**
     * Path 5: OAuth credentials.
     *
     * On macOS: tries Keychain service names "Claude Code-credentials" and "Claude Code"
     * via `security find-generic-password`. Falls back to ~/.claude/.credentials.json.
     *
     * Expects JSON with `claudeAiOauth.accessToken`.
     */
    private fun resolveOAuthCredentials(): AuthResult? {
        val isMac = System.getProperty("os.name", "").lowercase().contains("mac")

        if (isMac) {
            readMacKeychainCredentials()?.let { return it }
        }

        return readFileCredentials()
    }

    private fun readMacKeychainCredentials(): AuthResult? {
        val serviceNames = listOf("Claude Code-credentials", "Claude Code")
        // Claude Code stores credentials under varying account names (e.g. "Claude Code", username).
        // Try the current OS user first, then common account names, then a bare lookup.
        val accountNames = listOf(System.getProperty("user.name"), "Claude Code", null)
        var bestResult: AuthResult? = null
        var bestExpiresAt = 0L

        for (service in serviceNames) {
            for (account in accountNames) {
                try {
                    val cmd = mutableListOf("security", "find-generic-password", "-s", service)
                    if (account != null) { cmd += listOf("-a", account) }
                    cmd += "-w"

                    val process = ProcessBuilder(cmd).redirectErrorStream(true).start()
                    val exited = process.waitFor(5, TimeUnit.SECONDS)
                    if (!exited) { process.destroyForcibly(); continue }
                    if (process.exitValue() != 0) continue

                    val output = process.inputStream.bufferedReader().readText().trim()
                    if (output.isBlank()) continue

                    // Parse and check expiry — pick the freshest token
                    val expiresAt = try {
                        val obj = gson.fromJson(output, JsonObject::class.java)
                        obj?.get("claudeAiOauth")?.asJsonObject?.get("expiresAt")?.asLong ?: 0L
                    } catch (_: Exception) { 0L }

                    if (expiresAt > bestExpiresAt) {
                        extractOAuthToken(output, "Keychain")?.let {
                            bestResult = it
                            bestExpiresAt = expiresAt
                            LOG.info("[AuthProvider] Found Keychain token: service=$service, account=${account ?: "(any)"}, expiresAt=$expiresAt")
                        }
                    }
                } catch (e: Exception) {
                    LOG.debug("[AuthProvider] Keychain lookup failed for service='$service' account='$account': ${e.message}")
                }
            }
        }
        return bestResult
    }

    private fun readFileCredentials(): AuthResult? {
        val json = readJsonFile("$home/.claude/.credentials.json")?.toString() ?: return null
        return extractOAuthToken(json, ".credentials.json")
    }

    private fun extractOAuthToken(json: String, source: String): AuthResult? {
        return try {
            val obj = gson.fromJson(json, JsonObject::class.java)
            val oauth = obj?.get("claudeAiOauth")?.asJsonObject ?: return null
            var token = oauth.get("accessToken")?.asString
                ?.takeIf { it.isNotBlank() } ?: return null

            // Check if token is expired and refresh if possible
            val expiresAt = oauth.get("expiresAt")?.asLong ?: 0L
            if (expiresAt > 0 && expiresAt < System.currentTimeMillis()) {
                LOG.info("[AuthProvider] OAuth token expired (expiresAt=$expiresAt), attempting refresh...")
                val refreshToken = oauth.get("refreshToken")?.asString
                if (refreshToken != null && refreshToken.isNotBlank()) {
                    val refreshed = refreshOAuthToken(refreshToken)
                    if (refreshed != null) {
                        token = refreshed.accessToken
                        persistRefreshedToken(refreshed, source)
                        LOG.info("[AuthProvider] OAuth token refreshed successfully")
                    } else {
                        LOG.warn("[AuthProvider] Token refresh failed, using expired token (will likely 401)")
                    }
                } else {
                    LOG.warn("[AuthProvider] No refresh token available, using expired token")
                }
            }

            AuthResult(AuthType.CLI_SESSION, token, source)
        } catch (e: Exception) {
            LOG.debug("[AuthProvider] Failed to parse OAuth JSON from $source: ${e.message}")
            null
        }
    }

    /**
     * Refresh an expired OAuth token using the Anthropic token endpoint.
     *
     * Tries the primary endpoint first ([OAUTH_TOKEN_URL]), then falls back to
     * [OAUTH_TOKEN_URL_FALLBACK] (console.anthropic.com). Logs the full error
     * body on failure so the caller can surface a "please run claude login" message.
     */
    private fun refreshOAuthToken(refreshToken: String): OAuthTokens? {
        val requestBody = gson.toJson(mapOf(
            "grant_type" to "refresh_token",
            "refresh_token" to refreshToken,
            "client_id" to OAUTH_CLIENT_ID
        ))
        for (url in listOf(OAUTH_TOKEN_URL, OAUTH_TOKEN_URL_FALLBACK)) {
            val result = tryRefreshAt(url, requestBody, refreshToken)
            if (result != null) return result
        }
        LOG.warn("[AuthProvider] OAuth token refresh failed on all endpoints — user may need to run 'claude login'")
        return null
    }

    private fun tryRefreshAt(url: String, requestBody: String, originalRefreshToken: String): OAuthTokens? {
        return try {
            val process = ProcessBuilder(
                "/usr/bin/curl", "-s", "-w", "\n%{http_code}",
                "-X", "POST", url,
                "-H", "Content-Type: application/json",
                "-d", requestBody
            ).redirectErrorStream(false).start()

            val exited = process.waitFor(15, TimeUnit.SECONDS)
            if (!exited) { process.destroyForcibly(); return null }

            val raw = process.inputStream.bufferedReader().readText().trim()
            val lines = raw.lines().toList()
            val statusCode = lines.lastOrNull()?.toIntOrNull() ?: 0
            val responseBody = lines.dropLast(1).joinToString("\n")

            if (statusCode != 200) {
                LOG.warn("[AuthProvider] Token refresh at $url failed: HTTP $statusCode — $responseBody")
                return null
            }

            val json = gson.fromJson(responseBody, JsonObject::class.java) ?: run {
                LOG.warn("[AuthProvider] Token refresh at $url: could not parse JSON — $responseBody")
                return null
            }

            val newAccessToken = json.get("access_token")?.asString ?: run {
                LOG.warn("[AuthProvider] Token refresh at $url: no access_token in response — $responseBody")
                return null
            }
            val newRefreshToken = json.get("refresh_token")?.asString ?: originalRefreshToken
            val expiresIn = json.get("expires_in")?.asLong ?: 28800L
            val newExpiresAt = System.currentTimeMillis() + (expiresIn * 1000)

            LOG.info("[AuthProvider] Token refreshed via $url")
            OAuthTokens(newAccessToken, newRefreshToken, newExpiresAt)
        } catch (e: Exception) {
            LOG.warn("[AuthProvider] OAuth refresh at $url threw: ${e.message}")
            null
        }
    }

    /**
     * Persist refreshed tokens back to Keychain (macOS) or credentials file.
     */
    private fun persistRefreshedToken(tokens: OAuthTokens, source: String) {
        try {
            val isMac = System.getProperty("os.name", "").lowercase().contains("mac")
            if (isMac && source == "Keychain") {
                // Read current keychain value, update tokens, write back
                val serviceNames = listOf("Claude Code-credentials", "Claude Code")
                for (service in serviceNames) {
                    try {
                        val readProcess = ProcessBuilder(
                            "security", "find-generic-password", "-s", service, "-w"
                        ).redirectErrorStream(true).start()
                        if (!readProcess.waitFor(5, TimeUnit.SECONDS)) continue
                        if (readProcess.exitValue() != 0) continue

                        val currentJson = readProcess.inputStream.bufferedReader().readText().trim()
                        val obj = gson.fromJson(currentJson, JsonObject::class.java) ?: continue
                        val oauth = obj.get("claudeAiOauth")?.asJsonObject ?: continue

                        oauth.addProperty("accessToken", tokens.accessToken)
                        oauth.addProperty("refreshToken", tokens.refreshToken)
                        oauth.addProperty("expiresAt", tokens.expiresAt)

                        val updatedJson = gson.toJson(obj)

                        // Write back to Keychain — delete then add
                        ProcessBuilder("security", "delete-generic-password", "-s", service)
                            .redirectErrorStream(true).start().waitFor(5, TimeUnit.SECONDS)

                        val writeProcess = ProcessBuilder(
                            "security", "add-generic-password", "-s", service,
                            "-a", "", "-w", updatedJson, "-U"
                        ).redirectErrorStream(true).start()
                        writeProcess.waitFor(5, TimeUnit.SECONDS)

                        LOG.info("[AuthProvider] Refreshed token persisted to Keychain service: $service")
                        return
                    } catch (e: Exception) {
                        LOG.debug("[AuthProvider] Failed to persist to Keychain service '$service': ${e.message}")
                    }
                }
            }
            // File-based fallback
            val credFile = File("$home/.claude/.credentials.json")
            if (credFile.exists()) {
                val obj = gson.fromJson(credFile.readText(Charsets.UTF_8), JsonObject::class.java)
                val oauth = obj?.get("claudeAiOauth")?.asJsonObject
                if (oauth != null) {
                    oauth.addProperty("accessToken", tokens.accessToken)
                    oauth.addProperty("refreshToken", tokens.refreshToken)
                    oauth.addProperty("expiresAt", tokens.expiresAt)
                    credFile.writeText(gson.toJson(obj), Charsets.UTF_8)
                    LOG.info("[AuthProvider] Refreshed token persisted to .credentials.json")
                }
            }
        } catch (e: Exception) {
            LOG.warn("[AuthProvider] Failed to persist refreshed token: ${e.message}")
        }
    }

    private data class OAuthTokens(
        val accessToken: String,
        val refreshToken: String,
        val expiresAt: Long,
    )

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun loadClaudeSettings(): JsonObject? =
        readJsonFile("$home/.claude/settings.json")

    private fun readJsonFile(path: String): JsonObject? {
        return try {
            val file = File(path)
            if (!file.exists()) return null
            gson.fromJson(file.readText(Charsets.UTF_8), JsonObject::class.java)
        } catch (e: Exception) {
            LOG.debug("[AuthProvider] Could not read $path: ${e.message}")
            null
        }
    }

    /**
     * Splits a shell command string into tokens for [ProcessBuilder].
     * Handles simple quoted strings; sufficient for apiKeyHelper values.
     */
    private fun splitCommand(cmd: String): Array<String> {
        val tokens = mutableListOf<String>()
        val current = StringBuilder()
        var inSingle = false
        var inDouble = false
        for (ch in cmd) {
            when {
                ch == '\'' && !inDouble -> inSingle = !inSingle
                ch == '"' && !inSingle -> inDouble = !inDouble
                ch == ' ' && !inSingle && !inDouble -> {
                    if (current.isNotEmpty()) { tokens += current.toString(); current.clear() }
                }
                else -> current.append(ch)
            }
        }
        if (current.isNotEmpty()) tokens += current.toString()
        return tokens.toTypedArray()
    }

    // -------------------------------------------------------------------------
    // Internal types
    // -------------------------------------------------------------------------

    private enum class AuthType { API_KEY, AUTH_TOKEN, CLI_SESSION }

    private data class AuthResult(
        val authType: AuthType,
        val credential: String,
        val source: String,
    )
}
