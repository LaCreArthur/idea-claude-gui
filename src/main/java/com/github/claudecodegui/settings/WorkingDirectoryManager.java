package com.github.claudecodegui.settings;

import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class WorkingDirectoryManager {
    private static final Logger LOG = Logger.getInstance(WorkingDirectoryManager.class);

    private final Function<Void, JsonObject> configReader;
    private final java.util.function.Consumer<JsonObject> configWriter;

    public WorkingDirectoryManager(
            Function<Void, JsonObject> configReader,
            java.util.function.Consumer<JsonObject> configWriter) {
        this.configReader = configReader;
        this.configWriter = configWriter;
    }

    public String getCustomWorkingDirectory(String projectPath) {
        JsonObject config = configReader.apply(null);

        if (!config.has("workingDirectories") || config.get("workingDirectories").isJsonNull()) {
            return null;
        }

        JsonObject workingDirs = config.getAsJsonObject("workingDirectories");

        if (workingDirs.has(projectPath) && !workingDirs.get(projectPath).isJsonNull()) {
            return workingDirs.get(projectPath).getAsString();
        }

        return null;
    }

    public void setCustomWorkingDirectory(String projectPath, String customWorkingDir) throws IOException {
        JsonObject config = configReader.apply(null);

        if (!config.has("workingDirectories")) {
            config.add("workingDirectories", new JsonObject());
        }

        JsonObject workingDirs = config.getAsJsonObject("workingDirectories");

        if (customWorkingDir == null || customWorkingDir.trim().isEmpty()) {
            workingDirs.remove(projectPath);
        } else {
            workingDirs.addProperty(projectPath, customWorkingDir.trim());
        }

        configWriter.accept(config);
        LOG.info("[WorkingDirectoryManager] Set custom working directory for " + projectPath + ": " + customWorkingDir);
    }

    public Map<String, String> getAllWorkingDirectories() {
        Map<String, String> result = new HashMap<>();
        JsonObject config = configReader.apply(null);

        if (!config.has("workingDirectories") || config.get("workingDirectories").isJsonNull()) {
            return result;
        }

        JsonObject workingDirs = config.getAsJsonObject("workingDirectories");
        for (String key : workingDirs.keySet()) {
            result.put(key, workingDirs.get(key).getAsString());
        }

        return result;
    }
}
