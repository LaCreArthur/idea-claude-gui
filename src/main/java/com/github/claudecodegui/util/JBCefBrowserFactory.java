package com.github.claudecodegui.util;

import com.intellij.openapi.application.ApplicationInfo;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.util.SystemInfo;
import com.intellij.ui.jcef.JBCefBrowser;

public final class JBCefBrowserFactory {

    private static final Logger LOG = Logger.getInstance(JBCefBrowserFactory.class);

    private JBCefBrowserFactory() {
    }

    public static JBCefBrowser create() {
        boolean isOffScreenRendering = determineOsrMode();
        LOG.info("Creating JBCefBrowser with OSR=" + isOffScreenRendering
                + " (platform=" + getPlatformName() + ", ideaVersion=" + getIdeaMajorVersion() + ")");

        try {
            JBCefBrowser browser = JBCefBrowser.createBuilder()
                    .setOffScreenRendering(isOffScreenRendering)
                    .build();
            LOG.info("JBCefBrowser created successfully using builder");
            return browser;
        } catch (Exception e) {
            LOG.warn("JBCefBrowser builder failed, falling back to default constructor: " + e.getMessage());
            return new JBCefBrowser();
        }
    }

    public static JBCefBrowser create(String url) {
        boolean isOffScreenRendering = determineOsrMode();
        LOG.info("Creating JBCefBrowser with URL and OSR=" + isOffScreenRendering);

        try {
            JBCefBrowser browser = JBCefBrowser.createBuilder()
                    .setOffScreenRendering(isOffScreenRendering)
                    .setUrl(url)
                    .build();
            LOG.info("JBCefBrowser created successfully with URL");
            return browser;
        } catch (Exception e) {
            LOG.warn("JBCefBrowser builder failed, falling back to default constructor: " + e.getMessage());
            JBCefBrowser browser = new JBCefBrowser();
            if (url != null && !url.isEmpty()) {
                browser.loadURL(url);
            }
            return browser;
        }
    }

    private static boolean determineOsrMode() {
        if (SystemInfo.isMac) {
            return false;
        } else if (SystemInfo.isLinux || SystemInfo.isUnix) {
            int version = getIdeaMajorVersion();
            return version >= 2023;
        } else if (SystemInfo.isWindows) {
            return false;
        }
        return false;
    }

    private static int getIdeaMajorVersion() {
        try {
            ApplicationInfo appInfo = ApplicationInfo.getInstance();
            var majorVersion = appInfo.getMajorVersion();
            return Integer.parseInt(majorVersion);
        } catch (Exception e) {
            LOG.warn("Failed to get IDEA version: " + e.getMessage());
        }
        return 0;
    }

    private static String getPlatformName() {
        if (SystemInfo.isMac) {
            return "macOS";
        } else if (SystemInfo.isLinux) {
            return "Linux";
        } else if (SystemInfo.isUnix) {
            return "Unix";
        } else if (SystemInfo.isWindows) {
            return "Windows";
        }
        return "Unknown";
    }

    public static boolean isJcefSupported() {
        try {
            return com.intellij.ui.jcef.JBCefApp.isSupported();
        } catch (Exception e) {
            LOG.warn("Failed to check JCEF support: " + e.getMessage());
            return false;
        }
    }
}
