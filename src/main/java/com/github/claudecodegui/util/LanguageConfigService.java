package com.github.claudecodegui.util;

import com.intellij.openapi.diagnostic.Logger;
import com.google.gson.JsonObject;
import com.intellij.openapi.util.registry.Registry;

/**
 * Language Configuration Service
 * Detects IntelliJ IDEA's language setting and provides it to the webview for auto-locale selection
 */
public class LanguageConfigService {

    private static final Logger LOG = Logger.getInstance(LanguageConfigService.class);

    /**
     * Get IDEA's current language/locale setting
     *
     * @return Language code (e.g., "en", "zh", "ja", "es", "fr", "hi")
     */
    public static String getIdeLanguage() {
        try {
            // Try to read IDE language from registry
            String ideLocale = Registry.get("ide.i18n.locale").asString();
            
            if (ideLocale != null && !ideLocale.isEmpty()) {
                // Convert IDE locale to our supported language codes
                String languageCode = mapIdeLocaleToLanguageCode(ideLocale);
                LOG.info("[LanguageConfig] Detected IDE locale: " + ideLocale + " -> " + languageCode);
                return languageCode;
            }
        } catch (Exception e) {
            LOG.warn("[LanguageConfig] Failed to read IDE locale from registry: " + e.getMessage());
        }

        // Fallback: Try system locale
        try {
            String systemLocale = System.getProperty("user.language");
            if (systemLocale != null && !systemLocale.isEmpty()) {
                String languageCode = mapIdeLocaleToLanguageCode(systemLocale);
                LOG.info("[LanguageConfig] Using system locale: " + systemLocale + " -> " + languageCode);
                return languageCode;
            }
        } catch (Exception e) {
            LOG.warn("[LanguageConfig] Failed to read system locale: " + e.getMessage());
        }

        // Default to English
        LOG.info("[LanguageConfig] Using default language: en");
        return "en";
    }

    /**
     * Map IDE locale string to our supported language codes
     * Supported locales: en, zh, zh-TW, es, fr, hi, ja
     *
     * @param ideLocale IDE locale string (e.g., "en_US", "zh_CN", "zh_TW", "ja_JP")
     * @return Mapped language code
     */
    private static String mapIdeLocaleToLanguageCode(String ideLocale) {
        if (ideLocale == null || ideLocale.isEmpty()) {
            return "en";
        }

        String locale = ideLocale.toLowerCase();

        // Chinese (Simplified)
        if (locale.startsWith("zh_cn") || locale.equals("zh")) {
            return "zh";
        }

        // Chinese (Traditional)
        if (locale.startsWith("zh_tw") || locale.startsWith("zh_hk")) {
            return "zh-TW";
        }

        // Japanese
        if (locale.startsWith("ja")) {
            return "ja";
        }

        // Spanish
        if (locale.startsWith("es")) {
            return "es";
        }

        // French
        if (locale.startsWith("fr")) {
            return "fr";
        }

        // Hindi
        if (locale.startsWith("hi")) {
            return "hi";
        }

        // English (default)
        if (locale.startsWith("en")) {
            return "en";
        }

        // Fallback to English for unsupported locales
        return "en";
    }

    /**
     * Get language configuration as JSON object
     *
     * @return JsonObject containing language code
     */
    public static JsonObject getLanguageConfig() {
        JsonObject config = new JsonObject();
        config.addProperty("language", getIdeLanguage());
        return config;
    }

    /**
     * Get language configuration as JSON string
     *
     * @return JSON string
     */
    public static String getLanguageConfigJson() {
        return getLanguageConfig().toString();
    }
}
