package com.github.claudecodegui.dependency;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public enum SdkDefinition {

    CLAUDE_SDK(
        "claude-sdk",
        "Claude Code SDK",
        "@anthropic-ai/claude-agent-sdk",
        "^0.2.3",
        Arrays.asList("@anthropic-ai/sdk", "@anthropic-ai/bedrock-sdk"),
        "Claude AI SDK with Agent SDK and Bedrock support."
    );

    private final String id;
    private final String displayName;
    private final String npmPackage;
    private final String version;
    private final List<String> dependencies;
    private final String description;

    SdkDefinition(String id, String displayName, String npmPackage, String version,
                  List<String> dependencies, String description) {
        this.id = id;
        this.displayName = displayName;
        this.npmPackage = npmPackage;
        this.version = version;
        this.dependencies = dependencies;
        this.description = description;
    }

    public String getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getNpmPackage() {
        return npmPackage;
    }

    public String getVersion() {
        return version;
    }

    public List<String> getDependencies() {
        return dependencies;
    }

    public String getDescription() {
        return description;
    }

    public String getFullPackageSpec() {
        return npmPackage + "@" + version;
    }

    public List<String> getAllPackages() {
        if (dependencies.isEmpty()) {
            return Collections.singletonList(getFullPackageSpec());
        }
        java.util.ArrayList<String> all = new java.util.ArrayList<>();
        all.add(getFullPackageSpec());
        all.addAll(dependencies);
        return all;
    }

    public static SdkDefinition fromId(String id) {
        for (SdkDefinition sdk : values()) {
            if (sdk.getId().equals(id)) {
                return sdk;
            }
        }
        return null;
    }

    public static SdkDefinition fromProvider(String provider) {
        if ("claude".equalsIgnoreCase(provider)) {
            return CLAUDE_SDK;
        }
        return null;
    }
}
