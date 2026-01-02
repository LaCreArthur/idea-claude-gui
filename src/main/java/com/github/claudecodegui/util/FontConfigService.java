package com.github.claudecodegui.util;

import com.intellij.openapi.editor.colors.EditorColorsManager;
import com.intellij.openapi.editor.colors.EditorColorsScheme;
import com.intellij.openapi.editor.colors.FontPreferences;
import com.intellij.openapi.diagnostic.Logger;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Font Configuration Service
 * Retrieves editor font configuration from IDEA and provides it to Webview
 */
public class FontConfigService {

    private static final Logger LOG = Logger.getInstance(FontConfigService.class);

    /**
     * Get IDEA editor font configuration
     *
     * @return JsonObject containing font configuration
     */
    public static JsonObject getEditorFontConfig() {
        JsonObject config = new JsonObject();

        try {
            EditorColorsScheme scheme = EditorColorsManager.getInstance().getGlobalScheme();

            if (scheme != null) {
                // Get font preferences, including primary font and fallback fonts
                FontPreferences fontPreferences = scheme.getFontPreferences();

                // Primary font name
                String fontName = scheme.getEditorFontName();
                int fontSize = scheme.getEditorFontSize();
                float lineSpacing = scheme.getLineSpacing();

                config.addProperty("fontFamily", fontName);
                config.addProperty("fontSize", fontSize);
                config.addProperty("lineSpacing", lineSpacing);

                // Get fallback font list
                List<String> effectiveFontFamilies = fontPreferences.getEffectiveFontFamilies();
                JsonArray fallbackFonts = new JsonArray();

                // Skip the first (primary font), add remaining fallback fonts
                for (int i = 1; i < effectiveFontFamilies.size(); i++) {
                    fallbackFonts.add(effectiveFontFamilies.get(i));
                }
                config.add("fallbackFonts", fallbackFonts);

                LOG.info("[FontConfig] Retrieved IDEA font configuration: fontFamily=" + fontName
                        + ", fontSize=" + fontSize
                        + ", lineSpacing=" + lineSpacing
                        + ", fallbackFonts=" + fallbackFonts);
            } else {
                // Use default values
                config.addProperty("fontFamily", "JetBrains Mono");
                config.addProperty("fontSize", 14);
                config.addProperty("lineSpacing", 1.2f);
                config.add("fallbackFonts", new JsonArray());
                LOG.warn("[FontConfig] Unable to get EditorColorsScheme, using default values");
            }
        } catch (Exception e) {
            // Use default values on exception
            config.addProperty("fontFamily", "JetBrains Mono");
            config.addProperty("fontSize", 14);
            config.addProperty("lineSpacing", 1.2f);
            config.add("fallbackFonts", new JsonArray());
            LOG.error("[FontConfig] Failed to get font configuration: " + e.getMessage(), e);
        }

        return config;
    }

    /**
     * Get font configuration as JSON string
     *
     * @return JSON string
     */
    public static String getEditorFontConfigJson() {
        return getEditorFontConfig().toString();
    }

    /**
     * Get editor font name
     *
     * @return Font name
     */
    public static String getEditorFontName() {
        try {
            EditorColorsScheme scheme = EditorColorsManager.getInstance().getGlobalScheme();
            if (scheme != null) {
                return scheme.getEditorFontName();
            }
        } catch (Exception e) {
            LOG.error("[FontConfig] Failed to get font name: " + e.getMessage());
        }
        return "JetBrains Mono";
    }

    /**
     * Get editor font size
     *
     * @return Font size
     */
    public static int getEditorFontSize() {
        try {
            EditorColorsScheme scheme = EditorColorsManager.getInstance().getGlobalScheme();
            if (scheme != null) {
                return scheme.getEditorFontSize();
            }
        } catch (Exception e) {
            LOG.error("[FontConfig] Failed to get font size: " + e.getMessage());
        }
        return 14;
    }

    /**
     * Get editor line spacing
     *
     * @return Line spacing
     */
    public static float getEditorLineSpacing() {
        try {
            EditorColorsScheme scheme = EditorColorsManager.getInstance().getGlobalScheme();
            if (scheme != null) {
                return scheme.getLineSpacing();
            }
        } catch (Exception e) {
            LOG.error("[FontConfig] Failed to get line spacing: " + e.getMessage());
        }
        return 1.2f;
    }
}
