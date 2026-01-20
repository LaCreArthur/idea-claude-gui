package com.github.claudecodegui.settings;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

public class SkillManager {
    private static final Logger LOG = Logger.getInstance(SkillManager.class);

    private final Function<Void, JsonObject> configReader;
    private final java.util.function.Consumer<JsonObject> configWriter;
    private final ClaudeSettingsManager claudeSettingsManager;

    public SkillManager(
            Function<Void, JsonObject> configReader,
            java.util.function.Consumer<JsonObject> configWriter,
            ClaudeSettingsManager claudeSettingsManager) {
        this.configReader = configReader;
        this.configWriter = configWriter;
        this.claudeSettingsManager = claudeSettingsManager;
    }

    public List<JsonObject> getSkills() {
        List<JsonObject> result = new ArrayList<>();
        JsonObject config = configReader.apply(null);

        if (!config.has("skills")) {
            return result;
        }

        JsonObject skills = config.getAsJsonObject("skills");
        for (String key : skills.keySet()) {
            JsonObject skill = skills.getAsJsonObject(key);
            if (!skill.has("id")) {
                skill.addProperty("id", key);
            }
            result.add(skill);
        }

        LOG.info("[SkillManager] Loaded " + result.size() + " skills");
        return result;
    }

    public void upsertSkill(JsonObject skill) throws IOException {
        if (!skill.has("id")) {
            throw new IllegalArgumentException("Skill must have an id");
        }

        String id = skill.get("id").getAsString();

        Map<String, Object> validation = validateSkill(skill);
        if (!(boolean) validation.get("valid")) {
            @SuppressWarnings("unchecked")
            List<String> errors = (List<String>) validation.get("errors");
            throw new IllegalArgumentException("Invalid skill configuration: " + String.join(", ", errors));
        }

        JsonObject config = configReader.apply(null);

        if (!config.has("skills")) {
            config.add("skills", new JsonObject());
        }

        JsonObject skills = config.getAsJsonObject("skills");

        skills.add(id, skill);

        configWriter.accept(config);

        syncSkillsToClaudeSettings();

        LOG.info("[SkillManager] Upserted skill: " + id);
    }

    public boolean deleteSkill(String id) throws IOException {
        JsonObject config = configReader.apply(null);

        if (!config.has("skills")) {
            LOG.info("[SkillManager] No skills found");
            return false;
        }

        JsonObject skills = config.getAsJsonObject("skills");
        if (!skills.has(id)) {
            LOG.info("[SkillManager] Skill not found: " + id);
            return false;
        }

        skills.remove(id);

        configWriter.accept(config);

        syncSkillsToClaudeSettings();

        LOG.info("[SkillManager] Deleted skill: " + id);
        return true;
    }

    public Map<String, Object> validateSkill(JsonObject skill) {
        List<String> errors = new ArrayList<>();

        if (!skill.has("id") || skill.get("id").isJsonNull() ||
                skill.get("id").getAsString().trim().isEmpty()) {
            errors.add("Skill ID cannot be empty");
        } else {
            String id = skill.get("id").getAsString();
            if (!id.matches("^[a-z0-9-]+$")) {
                errors.add("Skill ID must be hyphen-case (lowercase letters, numbers, and hyphens only)");
            }
        }

        if (!skill.has("name") || skill.get("name").isJsonNull() ||
                skill.get("name").getAsString().trim().isEmpty()) {
            errors.add("Skill name cannot be empty");
        }

        if (!skill.has("path") || skill.get("path").isJsonNull() ||
                skill.get("path").getAsString().trim().isEmpty()) {
            errors.add("Skill path cannot be empty");
        }

        if (skill.has("type") && !skill.get("type").isJsonNull()) {
            String type = skill.get("type").getAsString();
            if (!"local".equals(type)) {
                errors.add("Unsupported skill type: " + type + " (only 'local' is supported)");
            }
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("valid", errors.isEmpty());
        result.put("errors", errors);
        return result;
    }

    public void syncSkillsToClaudeSettings() throws IOException {
        List<JsonObject> skills = getSkills();

        JsonArray plugins = new JsonArray();
        for (JsonObject skill : skills) {
            boolean enabled = !skill.has("enabled") || skill.get("enabled").isJsonNull() ||
                    skill.get("enabled").getAsBoolean();
            if (!enabled) {
                continue;
            }

            JsonObject plugin = new JsonObject();
            plugin.addProperty("type", "local");
            plugin.addProperty("path", skill.get("path").getAsString());
            plugins.add(plugin);
        }

        claudeSettingsManager.syncSkillsToClaudeSettings(plugins);

        LOG.info("[SkillManager] Synced " + plugins.size() + " enabled skills to Claude settings");
    }
}
