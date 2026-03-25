package com.github.claudecodegui.agent

import com.github.claudecodegui.agent.tools.BashTool
import com.github.claudecodegui.agent.tools.EditTool
import com.github.claudecodegui.agent.tools.GlobTool
import com.github.claudecodegui.agent.tools.GrepTool
import com.github.claudecodegui.agent.tools.ReadTool
import com.github.claudecodegui.agent.tools.ToolResult
import com.github.claudecodegui.agent.tools.WriteTool
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser

typealias ToolImpl = (input: JsonObject) -> ToolResult

class ToolRegistry(private val workingDirectory: String) {

    private val tools: Map<String, ToolImpl> = mapOf(
        "read_file" to { input -> ReadTool.execute(input) },
        "write_file" to { input -> WriteTool.execute(input) },
        "edit_file" to { input -> EditTool.execute(input) },
        "bash" to { input -> BashTool.execute(input, workingDirectory) },
        "glob" to { input -> GlobTool.execute(input, workingDirectory) },
        "grep" to { input -> GrepTool.execute(input, workingDirectory) },
    )

    fun definitions(): JsonArray {
        val arr = JsonArray()
        SCHEMAS.forEach { arr.add(JsonParser.parseString(it)) }
        return arr
    }

    fun execute(name: String, input: JsonObject): ToolResult {
        val impl = tools[name]
            ?: return ToolResult("", "Unknown tool: $name", isError = true)
        return try {
            impl(input)
        } catch (e: Exception) {
            ToolResult("", "Tool '$name' threw: ${e.message}", isError = true)
        }
    }

    companion object {
        private val SCHEMAS = listOf(
            """{"name":"read_file","description":"Read the contents of a file at the given path. Returns the file content with line numbers (cat -n format). Optionally read a slice of lines with offset and limit.","input_schema":{"type":"object","properties":{"file_path":{"type":"string","description":"Absolute or relative path to the file"},"offset":{"type":"integer","description":"Line number to start reading from (1-based)"},"limit":{"type":"integer","description":"Maximum number of lines to return"}},"required":["file_path"]}}""",
            """{"name":"write_file","description":"Write content to a file, creating it (and any parent directories) if it does not exist. Overwrites existing content.","input_schema":{"type":"object","properties":{"file_path":{"type":"string","description":"Absolute or relative path to the file"},"content":{"type":"string","description":"Content to write"}},"required":["file_path","content"]}}""",
            """{"name":"edit_file","description":"Replace an exact string in a file with a new string. Fails if old_string is not found or is not unique.","input_schema":{"type":"object","properties":{"file_path":{"type":"string","description":"Absolute or relative path to the file"},"old_string":{"type":"string","description":"The exact text to find and replace"},"new_string":{"type":"string","description":"The replacement text"}},"required":["file_path","old_string","new_string"]}}""",
            """{"name":"bash","description":"Execute a shell command via /bin/bash -c. Returns combined stdout and stderr, truncated to 10000 characters.","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Shell command to execute"},"timeout":{"type":"integer","description":"Timeout in milliseconds (default 120000)"}},"required":["command"]}}""",
            """{"name":"glob","description":"Find files matching a glob pattern. Returns matching paths one per line, sorted by modification time.","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern, e.g. **/*.kt"},"path":{"type":"string","description":"Directory to search in (default: working directory)"}},"required":["pattern"]}}""",
            """{"name":"grep","description":"Search file contents for a regex pattern. Returns matching lines in file:line:content format.","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Regular expression to search for"},"path":{"type":"string","description":"File or directory to search (default: working directory)"},"include":{"type":"string","description":"Glob pattern to filter files, e.g. *.kt"}},"required":["pattern"]}}""",
        )
    }
}
