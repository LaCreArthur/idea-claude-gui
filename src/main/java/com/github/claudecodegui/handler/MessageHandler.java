package com.github.claudecodegui.handler;

public interface MessageHandler {

    boolean handle(String type, String content);

    String[] getSupportedTypes();
}
