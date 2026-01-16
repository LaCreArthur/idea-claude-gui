package com.github.claudecodegui;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SkillService {
    private static final Logger LOG = Logger.getInstance(SkillService.class);
    private static final Gson gson = new Gson();

    private static final String CONFIG_DIR_NAME = ".claude-gui";
    private static final String SKILLS_DIR_NAME = "skills";
    private static final String GLOBAL_DIR_NAME = "global";

    private static final Pattern FRONTMATTER_PATTERN = Pattern.compile("^---\\s*\\n([\\s\\S]*?)\\n---");
    private static final Pattern DESCRIPTION_PATTERN = Pattern.compile("description:\\s*(.+?)(?:\\n[a-z-]+:|$)", Pattern.DOTALL);

    public static String getGlobalSkillsDir() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, ".claude", "skills").toString();
    }

    public static String getLocalSkillsDir(String workspaceRoot) {
        if (workspaceRoot == null || workspaceRoot.isEmpty()) {
            return null;
        }
        return Paths.get(workspaceRoot, ".claude", "skills").toString();
    }

    private static String getManagementRootDir() {
        String homeDir = System.getProperty("user.home");
        return Paths.get(homeDir, CONFIG_DIR_NAME, SKILLS_DIR_NAME).toString();
    }

    public static String getGlobalManagementDir() {
        return Paths.get(getManagementRootDir(), GLOBAL_DIR_NAME).toString();
    }

    public static String getLocalManagementDir(String workspaceRoot) {
        if (workspaceRoot == null || workspaceRoot.isEmpty()) {
            return null;
        }
        String projectName = Paths.get(workspaceRoot).getFileName().toString();
        String pathHash = Integer.toHexString(workspaceRoot.hashCode());
        String safeDirName = projectName + "_" + pathHash;
        return Paths.get(getManagementRootDir(), safeDirName).toString();
    }

    private static boolean ensureDirectoryExists(String dirPath) {
        if (dirPath == null) return false;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            boolean created = dir.mkdirs();
            if (created) {
                LOG.info("[Skills] 创建目录: " + dirPath);
            }
            return created;
        }
        return true;
    }

    public static JsonObject getAllSkills(String workspaceRoot) {
        JsonObject result = new JsonObject();
        result.add("global", getAllSkillsByScope("global", workspaceRoot));
        result.add("local", getAllSkillsByScope("local", workspaceRoot));
        return result;
    }

    public static JsonObject getAllSkillsByScope(String scope, String workspaceRoot) {
        JsonObject allSkills = new JsonObject();

        String activeDir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);
        if (activeDir != null) {
            JsonObject activeSkills = scanSkillsDirectory(activeDir, scope, true);
            for (String key : activeSkills.keySet()) {
                allSkills.add(key, activeSkills.get(key));
            }
        }

        String managementDir = "global".equals(scope) ? getGlobalManagementDir() : getLocalManagementDir(workspaceRoot);
        if (managementDir != null) {
            JsonObject disabledSkills = scanSkillsDirectory(managementDir, scope, false);
            for (String key : disabledSkills.keySet()) {
                allSkills.add(key, disabledSkills.get(key));
            }
        }

        return allSkills;
    }

    public static JsonObject getSkillsByScope(String scope, String workspaceRoot) {
        String dir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);
        if (dir == null) {
            LOG.warn("[Skills] 无法获取 " + scope + " Skills 目录");
            return new JsonObject();
        }
        return scanSkillsDirectory(dir, scope, true);
    }

    private static JsonObject scanSkillsDirectory(String dirPath, String scope, boolean enabled) {
        JsonObject skills = new JsonObject();
        File dir = new File(dirPath);

        if (!dir.exists()) {
            LOG.info("[Skills] " + scope + " Skills 目录不存在: " + dirPath);
            return skills;
        }

        File[] entries = dir.listFiles();
        if (entries == null) {
            return skills;
        }

        for (File entry : entries) {
            if (entry.getName().startsWith(".")) {
                continue;
            }

            String type = entry.isDirectory() ? "directory" : "file";
            String id = scope + "-" + entry.getName() + (enabled ? "" : "-disabled");
            String description = extractDescription(entry.getAbsolutePath(), entry.isDirectory());

            JsonObject skill = new JsonObject();
            skill.addProperty("id", id);
            skill.addProperty("name", entry.getName());
            skill.addProperty("type", type);
            skill.addProperty("scope", scope);
            skill.addProperty("path", entry.getAbsolutePath());
            skill.addProperty("enabled", enabled);
            if (description != null) {
                skill.addProperty("description", description);
            }

            try {
                BasicFileAttributes attrs = Files.readAttributes(entry.toPath(), BasicFileAttributes.class);
                skill.addProperty("createdAt", attrs.creationTime().toString());
                skill.addProperty("modifiedAt", attrs.lastModifiedTime().toString());
            } catch (IOException e) {
                LOG.warn("[Skills] 读取文件属性失败: " + entry.getAbsolutePath());
            }

            skills.add(id, skill);
        }

        LOG.info("[Skills] 从 " + scope + " 目录获取到 " + skills.size() + " 个 Skills (enabled=" + enabled + "): " + dirPath);
        return skills;
    }

    private static String extractDescription(String skillPath, boolean isDirectory) {
        try {
            String mdPath;
            if (isDirectory) {
                File skillMd = new File(skillPath, "skill.md");
                if (!skillMd.exists()) {
                    skillMd = new File(skillPath, "SKILL.md");
                }
                if (!skillMd.exists()) {
                    return null;
                }
                mdPath = skillMd.getAbsolutePath();
            } else {
                if (!skillPath.toLowerCase().endsWith(".md")) {
                    return null;
                }
                mdPath = skillPath;
            }

            String content = Files.readString(Path.of(mdPath), StandardCharsets.UTF_8);

            Matcher frontmatterMatcher = FRONTMATTER_PATTERN.matcher(content);
            if (frontmatterMatcher.find()) {
                String frontmatter = frontmatterMatcher.group(1);
                Matcher descMatcher = DESCRIPTION_PATTERN.matcher(frontmatter);
                if (descMatcher.find()) {
                    return descMatcher.group(1).trim();
                }
            }

            return null;
        } catch (IOException e) {
            LOG.warn("[Skills] 提取 description 失败: " + e.getMessage());
            return null;
        }
    }

    public static JsonObject importSkills(List<String> sourcePaths, String scope, String workspaceRoot) {
        JsonObject result = new JsonObject();
        JsonArray imported = new JsonArray();
        JsonArray errors = new JsonArray();

        String targetDir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);
        if (targetDir == null) {
            result.addProperty("success", false);
            result.addProperty("error", "无法获取 " + scope + " Skills 目录");
            return result;
        }

        File targetDirFile = new File(targetDir);
        if (!targetDirFile.exists()) {
            if (!targetDirFile.mkdirs()) {
                result.addProperty("success", false);
                result.addProperty("error", "无法创建 Skills 目录: " + targetDir);
                return result;
            }
            LOG.info("[Skills] 创建 " + scope + " Skills 目录: " + targetDir);
        }

        for (String sourcePath : sourcePaths) {
            File source = new File(sourcePath);
            if (!source.exists()) {
                JsonObject err = new JsonObject();
                err.addProperty("path", sourcePath);
                err.addProperty("error", "源路径不存在");
                errors.add(err);
                continue;
            }

            String name = source.getName();
            File targetPath = new File(targetDir, name);

            if (targetPath.exists()) {
                JsonObject err = new JsonObject();
                err.addProperty("path", sourcePath);
                err.addProperty("error", "已存在同名 Skill: " + name);
                errors.add(err);
                continue;
            }

            try {
                if (source.isDirectory()) {
                    copyDirectory(source.toPath(), targetPath.toPath());
                } else {
                    Files.copy(source.toPath(), targetPath.toPath());
                }

                String type = source.isDirectory() ? "directory" : "file";
                String id = scope + "-" + name;
                String description = extractDescription(targetPath.getAbsolutePath(), source.isDirectory());

                JsonObject skill = new JsonObject();
                skill.addProperty("id", id);
                skill.addProperty("name", name);
                skill.addProperty("type", type);
                skill.addProperty("scope", scope);
                skill.addProperty("path", targetPath.getAbsolutePath());
                if (description != null) {
                    skill.addProperty("description", description);
                }

                imported.add(skill);
                LOG.info("[Skills] 成功导入 " + scope + " Skill: " + name);

            } catch (IOException e) {
                JsonObject err = new JsonObject();
                err.addProperty("path", sourcePath);
                err.addProperty("error", "复制失败: " + e.getMessage());
                errors.add(err);
                LOG.error("[Skills] 导入 Skill 失败: " + e.getMessage());
            }
        }

        result.addProperty("success", errors.size() == 0 || imported.size() > 0);
        result.addProperty("count", imported.size());
        result.addProperty("total", sourcePaths.size());
        result.add("imported", imported);
        if (errors.size() > 0) {
            result.add("errors", errors);
        }

        return result;
    }

    public static JsonObject deleteSkill(String name, String scope, boolean enabled, String workspaceRoot) {
        JsonObject result = new JsonObject();

        String dir;
        if (enabled) {
            dir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);
        } else {
            dir = "global".equals(scope) ? getGlobalManagementDir() : getLocalManagementDir(workspaceRoot);
        }

        if (dir == null) {
            result.addProperty("success", false);
            result.addProperty("error", "无法获取 " + scope + " Skills 目录");
            return result;
        }

        File targetPath = new File(dir, name);

        if (!targetPath.exists()) {
            result.addProperty("success", false);
            result.addProperty("error", "Skill 不存在: " + name);
            return result;
        }

        try {
            if (targetPath.isDirectory()) {
                deleteDirectory(targetPath.toPath());
            } else {
                Files.delete(targetPath.toPath());
            }
            result.addProperty("success", true);
            LOG.info("[Skills] 成功删除 " + scope + " Skill: " + name + " (enabled=" + enabled + ")");
        } catch (IOException e) {
            result.addProperty("success", false);
            result.addProperty("error", "删除失败: " + e.getMessage());
            LOG.error("[Skills] 删除 Skill 失败: " + e.getMessage());
        }

        return result;
    }

    public static JsonObject deleteSkill(String id, String scope, String workspaceRoot) {
        String name = id.replace(scope + "-", "");
        boolean enabled = true;
        if (name.endsWith("-disabled")) {
            name = name.substring(0, name.length() - "-disabled".length());
            enabled = false;
        }
        return deleteSkill(name, scope, enabled, workspaceRoot);
    }

    public static JsonObject enableSkill(String name, String scope, String workspaceRoot) {
        JsonObject result = new JsonObject();

        String sourceDir = "global".equals(scope) ? getGlobalManagementDir() : getLocalManagementDir(workspaceRoot);
        String targetDir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);

        if (sourceDir == null || targetDir == null) {
            result.addProperty("success", false);
            result.addProperty("error", "无法获取 " + scope + " Skills 目录");
            return result;
        }

        File source = new File(sourceDir, name);
        File target = new File(targetDir, name);

        if (!source.exists()) {
            result.addProperty("success", false);
            result.addProperty("error", "Skill 不存在于管理目录: " + name);
            return result;
        }

        if (target.exists()) {
            result.addProperty("success", false);
            result.addProperty("error", "使用中目录已存在同名 Skill: " + name);
            result.addProperty("conflict", true);
            return result;
        }

        if (!ensureDirectoryExists(targetDir)) {
            result.addProperty("success", false);
            result.addProperty("error", "无法创建目标目录: " + targetDir);
            return result;
        }

        try {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
            result.addProperty("success", true);
            result.addProperty("name", name);
            result.addProperty("scope", scope);
            result.addProperty("enabled", true);
            result.addProperty("path", target.getAbsolutePath());
            LOG.info("[Skills] 成功启用 " + scope + " Skill: " + name);
        } catch (IOException e) {
            try {
                if (source.isDirectory()) {
                    copyDirectory(source.toPath(), target.toPath());
                    deleteDirectory(source.toPath());
                } else {
                    Files.copy(source.toPath(), target.toPath());
                    Files.delete(source.toPath());
                }
                result.addProperty("success", true);
                result.addProperty("name", name);
                result.addProperty("scope", scope);
                result.addProperty("enabled", true);
                result.addProperty("path", target.getAbsolutePath());
                LOG.info("[Skills] 成功启用 " + scope + " Skill (copy+delete): " + name);
            } catch (IOException e2) {
                result.addProperty("success", false);
                result.addProperty("error", "移动失败: " + e2.getMessage());
                LOG.error("[Skills] 启用 Skill 失败: " + e2.getMessage());
            }
        }

        return result;
    }

    public static JsonObject disableSkill(String name, String scope, String workspaceRoot) {
        JsonObject result = new JsonObject();

        String sourceDir = "global".equals(scope) ? getGlobalSkillsDir() : getLocalSkillsDir(workspaceRoot);
        String targetDir = "global".equals(scope) ? getGlobalManagementDir() : getLocalManagementDir(workspaceRoot);

        if (sourceDir == null || targetDir == null) {
            result.addProperty("success", false);
            result.addProperty("error", "无法获取 " + scope + " Skills 目录");
            return result;
        }

        File source = new File(sourceDir, name);
        File target = new File(targetDir, name);

        if (!source.exists()) {
            result.addProperty("success", false);
            result.addProperty("error", "Skill 不存在于使用中目录: " + name);
            return result;
        }

        if (target.exists()) {
            result.addProperty("success", false);
            result.addProperty("error", "管理目录已存在同名 Skill: " + name);
            result.addProperty("conflict", true);
            return result;
        }

        if (!ensureDirectoryExists(targetDir)) {
            result.addProperty("success", false);
            result.addProperty("error", "无法创建目标目录: " + targetDir);
            return result;
        }

        try {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
            result.addProperty("success", true);
            result.addProperty("name", name);
            result.addProperty("scope", scope);
            result.addProperty("enabled", false);
            result.addProperty("path", target.getAbsolutePath());
            LOG.info("[Skills] 成功停用 " + scope + " Skill: " + name);
        } catch (IOException e) {
            try {
                if (source.isDirectory()) {
                    copyDirectory(source.toPath(), target.toPath());
                    deleteDirectory(source.toPath());
                } else {
                    Files.copy(source.toPath(), target.toPath());
                    Files.delete(source.toPath());
                }
                result.addProperty("success", true);
                result.addProperty("name", name);
                result.addProperty("scope", scope);
                result.addProperty("enabled", false);
                result.addProperty("path", target.getAbsolutePath());
                LOG.info("[Skills] 成功停用 " + scope + " Skill (copy+delete): " + name);
            } catch (IOException e2) {
                result.addProperty("success", false);
                result.addProperty("error", "移动失败: " + e2.getMessage());
                LOG.error("[Skills] 停用 Skill 失败: " + e2.getMessage());
            }
        }

        return result;
    }

    public static JsonObject toggleSkill(String name, String scope, boolean currentEnabled, String workspaceRoot) {
        if (currentEnabled) {
            return disableSkill(name, scope, workspaceRoot);
        } else {
            return enableSkill(name, scope, workspaceRoot);
        }
    }

    private static void copyDirectory(Path source, Path target) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Path targetDir = target.resolve(source.relativize(dir));
                Files.createDirectories(targetDir);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Path targetFile = target.resolve(source.relativize(file));
                Files.copy(file, targetFile, StandardCopyOption.REPLACE_EXISTING);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static void deleteDirectory(Path dir) throws IOException {
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }
}
