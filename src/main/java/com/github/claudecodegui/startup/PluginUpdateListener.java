package com.github.claudecodegui.startup;

import com.intellij.ide.plugins.IdeaPluginDescriptor;
import com.intellij.ide.plugins.PluginManagerCore;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.extensions.PluginId;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.startup.ProjectActivity;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * Detects plugin version changes on project open.
 * Previously cleaned up ai-bridge cache — now a no-op placeholder
 * kept for future use (e.g., migration logic between versions).
 */
public class PluginUpdateListener implements ProjectActivity {

    private static final Logger LOG = Logger.getInstance(PluginUpdateListener.class);
    private static final String VERSION_KEY = "claude.code.last.plugin.version";
    private static final String PLUGIN_ID = "com.lacrearthur.idea-claude-gui";

    @Nullable
    @Override
    public Object execute(@NotNull Project project, @NotNull Continuation<? super Unit> continuation) {
        try {
            IdeaPluginDescriptor descriptor = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID));
            if (descriptor == null) return Unit.INSTANCE;

            String currentVersion = descriptor.getVersion();
            PropertiesComponent props = PropertiesComponent.getInstance();
            String lastVersion = props.getValue(VERSION_KEY);

            if (lastVersion != null && !lastVersion.equals(currentVersion)) {
                LOG.info("[PluginUpdateListener] Plugin updated: " + lastVersion + " -> " + currentVersion);
            }

            props.setValue(VERSION_KEY, currentVersion);
        } catch (Exception e) {
            LOG.warn("[PluginUpdateListener] Failed to check version: " + e.getMessage());
        }
        return Unit.INSTANCE;
    }
}
