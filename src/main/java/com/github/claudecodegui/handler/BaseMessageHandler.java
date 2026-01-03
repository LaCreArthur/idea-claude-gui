package com.github.claudecodegui.handler;

/**
 * Base class for message handlers.
 * Provides common utility methods.
 */
public abstract class BaseMessageHandler implements MessageHandler {

    protected final HandlerContext context;

    public BaseMessageHandler(HandlerContext context) {
        this.context = context;
    }

    /**
     * Call a JavaScript function.
     */
    protected void callJavaScript(String functionName, String... args) {
        context.callJavaScript(functionName, args);
    }

    /**
     * Escape a JavaScript string.
     */
    protected String escapeJs(String str) {
        return context.escapeJs(str);
    }

    /**
     * Execute JavaScript on the EDT thread.
     */
    protected void executeJavaScript(String jsCode) {
        context.executeJavaScriptOnEDT(jsCode);
    }

    /**
     * Check if message type matches.
     */
    protected boolean matchesType(String type, String... supportedTypes) {
        for (String supported : supportedTypes) {
            if (supported.equals(type)) {
                return true;
            }
        }
        return false;
    }
}
