package com.github.claudecodegui.handler;

import java.util.ArrayList;
import java.util.List;

/**
 * Message Dispatcher.
 * Responsible for dispatching messages to the appropriate Handler for processing.
 */
public class MessageDispatcher {

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
            if (handler.handle(type, content)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if any handler supports the specified message type.
     */
    public boolean hasHandlerFor(String type) {
        for (MessageHandler handler : handlers) {
            for (String supported : handler.getSupportedTypes()) {
                if (supported.equals(type)) {
                    return true;
                }
            }
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
