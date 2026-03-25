package com.github.claudecodegui.agent.tools

import com.google.gson.JsonObject
import java.nio.file.FileSystems
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import java.util.concurrent.TimeUnit
import java.util.regex.PatternSyntaxException

data class ToolResult(
    val toolUseId: String,
    val content: String,
    val isError: Boolean = false,
)

// ---------------------------------------------------------------------------
// ReadTool
// ---------------------------------------------------------------------------

object ReadTool {
    fun execute(input: JsonObject): ToolResult {
        val filePath = input.get("file_path")?.asString
            ?: return ToolResult("", "Missing required parameter: file_path", isError = true)
        val offset = input.get("offset")?.asInt?.takeIf { it > 0 } ?: 1
        val limit = input.get("limit")?.asInt?.takeIf { it > 0 }

        return try {
            val path = Path.of(filePath)
            if (!Files.exists(path)) return ToolResult("", "File not found: $filePath", isError = true)
            if (Files.isDirectory(path)) return ToolResult("", "Path is a directory: $filePath", isError = true)

            val lines = Files.readAllLines(path)
            val startIdx = (offset - 1).coerceAtLeast(0)
            val endIdx = if (limit != null) (startIdx + limit).coerceAtMost(lines.size) else lines.size

            val selected = lines.subList(startIdx.coerceAtMost(lines.size), endIdx)
            val sb = StringBuilder()
            selected.forEachIndexed { idx, line ->
                val lineNum = startIdx + idx + 1
                sb.append(String.format("%6d\t%s%n", lineNum, line))
            }
            ToolResult("", sb.toString())
        } catch (e: Exception) {
            ToolResult("", "Failed to read file: ${e.message}", isError = true)
        }
    }
}

// ---------------------------------------------------------------------------
// WriteTool
// ---------------------------------------------------------------------------

object WriteTool {
    fun execute(input: JsonObject): ToolResult {
        val filePath = input.get("file_path")?.asString
            ?: return ToolResult("", "Missing required parameter: file_path", isError = true)
        val content = input.get("content")?.asString
            ?: return ToolResult("", "Missing required parameter: content", isError = true)

        return try {
            val path = Path.of(filePath)
            path.parent?.let { Files.createDirectories(it) }
            Files.writeString(path, content)
            ToolResult("", "Successfully wrote ${content.length} characters to $filePath")
        } catch (e: Exception) {
            ToolResult("", "Failed to write file: ${e.message}", isError = true)
        }
    }
}

// ---------------------------------------------------------------------------
// EditTool
// ---------------------------------------------------------------------------

object EditTool {
    fun execute(input: JsonObject): ToolResult {
        val filePath = input.get("file_path")?.asString
            ?: return ToolResult("", "Missing required parameter: file_path", isError = true)
        val oldString = input.get("old_string")?.asString
            ?: return ToolResult("", "Missing required parameter: old_string", isError = true)
        val newString = input.get("new_string")?.asString
            ?: return ToolResult("", "Missing required parameter: new_string", isError = true)

        return try {
            val path = Path.of(filePath)
            if (!Files.exists(path)) return ToolResult("", "File not found: $filePath", isError = true)

            val original = Files.readString(path)

            val occurrences = countOccurrences(original, oldString)
            when {
                occurrences == 0 -> ToolResult("", "old_string not found in $filePath", isError = true)
                occurrences > 1 -> ToolResult(
                    "",
                    "old_string is not unique in $filePath ($occurrences occurrences). Provide more context to make it unique.",
                    isError = true
                )
                else -> {
                    val updated = original.replace(oldString, newString)
                    Files.writeString(path, updated)
                    ToolResult("", "Successfully edited $filePath")
                }
            }
        } catch (e: Exception) {
            ToolResult("", "Failed to edit file: ${e.message}", isError = true)
        }
    }

    private fun countOccurrences(text: String, pattern: String): Int {
        if (pattern.isEmpty()) return 0
        var count = 0
        var idx = 0
        while (true) {
            idx = text.indexOf(pattern, idx)
            if (idx == -1) break
            count++
            idx += pattern.length
        }
        return count
    }
}

// ---------------------------------------------------------------------------
// BashTool
// ---------------------------------------------------------------------------

object BashTool {
    private const val MAX_OUTPUT = 10_000

    fun execute(input: JsonObject, workingDirectory: String): ToolResult {
        val command = input.get("command")?.asString
            ?: return ToolResult("", "Missing required parameter: command", isError = true)
        val timeoutMs = input.get("timeout")?.asLong ?: 120_000L

        return try {
            val pb = ProcessBuilder("/bin/bash", "-c", command)
                .redirectErrorStream(true)
                .directory(Path.of(workingDirectory).toFile())

            val process = pb.start()
            val output = process.inputStream.bufferedReader().readText()
            val finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)

            if (!finished) {
                process.destroyForcibly()
                return ToolResult("", "Command timed out after ${timeoutMs}ms", isError = true)
            }

            val exitCode = process.exitValue()
            val truncated = if (output.length > MAX_OUTPUT) {
                output.take(MAX_OUTPUT) + "\n... (truncated, ${output.length - MAX_OUTPUT} chars omitted)"
            } else output

            if (exitCode != 0) {
                ToolResult("", "Exit code $exitCode\n$truncated", isError = true)
            } else {
                ToolResult("", truncated)
            }
        } catch (e: Exception) {
            ToolResult("", "Failed to execute command: ${e.message}", isError = true)
        }
    }
}

// ---------------------------------------------------------------------------
// GlobTool
// ---------------------------------------------------------------------------

object GlobTool {
    fun execute(input: JsonObject, workingDirectory: String): ToolResult {
        val pattern = input.get("pattern")?.asString
            ?: return ToolResult("", "Missing required parameter: pattern", isError = true)
        val searchPath = input.get("path")?.asString ?: workingDirectory

        return try {
            val root = Path.of(searchPath)
            if (!Files.exists(root)) return ToolResult("", "Path not found: $searchPath", isError = true)

            // Use full absolute pattern for the matcher
            val matcher = FileSystems.getDefault().getPathMatcher("glob:$pattern")
            val matches = mutableListOf<Path>()

            Files.walkFileTree(root, object : SimpleFileVisitor<Path>() {
                override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                    // Match against path relative to search root, or absolute — try both
                    val rel = root.relativize(file)
                    if (matcher.matches(rel) || matcher.matches(file)) {
                        matches.add(file)
                    }
                    return FileVisitResult.CONTINUE
                }

                override fun visitFileFailed(file: Path, exc: java.io.IOException): FileVisitResult =
                    FileVisitResult.CONTINUE
            })

            // Sort by last modified time descending (most recently modified first)
            matches.sortByDescending { Files.getLastModifiedTime(it).toMillis() }

            if (matches.isEmpty()) {
                ToolResult("", "No files matched pattern: $pattern")
            } else {
                ToolResult("", matches.joinToString("\n") { it.toString() })
            }
        } catch (e: Exception) {
            ToolResult("", "Glob failed: ${e.message}", isError = true)
        }
    }
}

// ---------------------------------------------------------------------------
// GrepTool
// ---------------------------------------------------------------------------

object GrepTool {
    fun execute(input: JsonObject, workingDirectory: String): ToolResult {
        val pattern = input.get("pattern")?.asString
            ?: return ToolResult("", "Missing required parameter: pattern", isError = true)
        val searchPath = input.get("path")?.asString ?: workingDirectory
        val include = input.get("include")?.asString

        val regex = try {
            Regex(pattern)
        } catch (e: PatternSyntaxException) {
            return ToolResult("", "Invalid regex pattern: ${e.message}", isError = true)
        }

        val globMatcher = include?.let {
            FileSystems.getDefault().getPathMatcher("glob:$it")
        }

        return try {
            val root = Path.of(searchPath)
            if (!Files.exists(root)) return ToolResult("", "Path not found: $searchPath", isError = true)

            val results = mutableListOf<String>()

            fun searchFile(file: Path) {
                // Skip binary-looking files by checking extension heuristically
                if (isBinaryExtension(file)) return
                try {
                    Files.readAllLines(file).forEachIndexed { idx, line ->
                        if (regex.containsMatchIn(line)) {
                            results.add("${file}:${idx + 1}:$line")
                        }
                    }
                } catch (_: Exception) {
                    // Unreadable file (binary, encoding issue) — skip silently
                }
            }

            if (Files.isRegularFile(root)) {
                searchFile(root)
            } else {
                Files.walkFileTree(root, object : SimpleFileVisitor<Path>() {
                    override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                        val rel = root.relativize(file)
                        if (globMatcher == null || globMatcher.matches(rel) || globMatcher.matches(Path.of(file.fileName.toString()))) {
                            searchFile(file)
                        }
                        return FileVisitResult.CONTINUE
                    }

                    override fun visitFileFailed(file: Path, exc: java.io.IOException): FileVisitResult =
                        FileVisitResult.CONTINUE
                })
            }

            if (results.isEmpty()) {
                ToolResult("", "No matches found for pattern: $pattern")
            } else {
                ToolResult("", results.joinToString("\n"))
            }
        } catch (e: Exception) {
            ToolResult("", "Grep failed: ${e.message}", isError = true)
        }
    }

    private val BINARY_EXTENSIONS = setOf(
        "class", "jar", "zip", "gz", "tar", "png", "jpg", "jpeg", "gif",
        "ico", "pdf", "exe", "bin", "so", "dylib", "dll", "o", "a",
    )

    private fun isBinaryExtension(file: Path): Boolean {
        val name = file.fileName?.toString() ?: return false
        val ext = name.substringAfterLast('.', "").lowercase()
        return ext in BINARY_EXTENSIONS
    }
}
