package com.github.claudecodegui.config;

import java.util.concurrent.TimeUnit;

public class TimeoutConfig {

    public static final long QUICK_OPERATION_TIMEOUT = 30;
    public static final TimeUnit QUICK_OPERATION_UNIT = TimeUnit.SECONDS;

    private TimeoutConfig() {
    }
}
