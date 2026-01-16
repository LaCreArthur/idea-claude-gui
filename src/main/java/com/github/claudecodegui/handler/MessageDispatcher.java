package com.github.claudecodegui.handler;

import com.intellij.openapi.diagnostic.Logger;
import java.util.ArrayList;
import java.util.List;

/**
 * Message Dispatcher.
 * Responsible for dispatching messages to the appropriate Handler for processing.
 */
public class MessageDispatcher {

    private static final Logger LOG = Logger.getInstance(MessageDispatcher.class);
    private static final boolean TRACE_ENABLED = Boolean.getBoolean("claude.test.trace");

    private final List<MessageHandler> handlers = new ArrayList<>();

    /**
     * Register a message handler.
     */
    public void registerHandler(MessageHandler handler) {
        handlers.add(handler);
    }

    /**
     * Dispatch message to the appropriate handler.
     * @param type message type
     * @param content message content
     * @return true if message was handled, false if no handler could process this message
     */
    public boolean dispatch(String type, String content) {
        for (MessageHandler handler : handlers) {
            if (TRACE_ENABLED) {
                LOG.info("[TEST_TRACE] Trying: " + handler.getClass().getSimpleName() + " for type: " + type);
            }
            if (handler.handle(type, content)) {
                if (TRACE_ENABLED) {
                    LOG.info("[TEST_TRACE] Handled by: " + handler.getClass().getSimpleName());
                }
                return true;
            }
        }
        if (TRACE_ENABLED) {
            LOG.info("[TEST_TRACE] No handler found for type: " + type);
        }
        return false;
    }

    /**
     * Get the count of all registered handlers.
     */
    public int getHandlerCount() {
        return handlers.size();
    }

    /**
     * Clear all handlers.
     */
    public void clear() {
        handlers.clear();
    }
}
