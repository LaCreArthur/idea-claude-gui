package com.github.claudecodegui.ui;

import com.github.claudecodegui.ClaudeSession;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.Alarm;

import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Supplier;

/**
 * Handles streaming message update coalescing for ClaudeChatWindow.
 * Batches rapid message updates to reduce UI thrashing during streaming.
 */
public class StreamingMessageHandler {
    private static final Logger LOG = Logger.getInstance(StreamingMessageHandler.class);
    private static final int STREAM_MESSAGE_UPDATE_INTERVAL_MS = 50;

    private final Object lock = new Object();
    private final Alarm alarm = new Alarm(Alarm.ThreadToUse.SWING_THREAD);

    private volatile boolean streamActive = false;
    private volatile boolean updateScheduled = false;
    private volatile long lastUpdateAtMs = 0L;
    private volatile long updateSequence = 0L;
    private volatile List<ClaudeSession.Message> pendingMessages = null;
    private volatile List<ClaudeSession.Message> lastMessagesSnapshot = null;

    private final Supplier<Boolean> disposedChecker;
    private final BiConsumer<List<ClaudeSession.Message>, Long> messageSender;

    /**
     * Creates a StreamingMessageHandler.
     *
     * @param disposedChecker Supplier that returns true if the parent is disposed
     * @param messageSender Consumer that sends messages to the webview (messages, sequence)
     */
    public StreamingMessageHandler(
            Supplier<Boolean> disposedChecker,
            BiConsumer<List<ClaudeSession.Message>, Long> messageSender) {
        this.disposedChecker = disposedChecker;
        this.messageSender = messageSender;
    }

    /**
     * Sets whether streaming is currently active.
     */
    public void setStreamActive(boolean active) {
        this.streamActive = active;
    }

    /**
     * Returns whether streaming is currently active.
     */
    public boolean isStreamActive() {
        return streamActive;
    }

    /**
     * Enqueues a message update. Updates are coalesced and sent at throttled intervals.
     */
    public void enqueueUpdate(List<ClaudeSession.Message> messages) {
        if (disposedChecker.get()) {
            return;
        }
        synchronized (lock) {
            pendingMessages = messages;
        }
        scheduleUpdatePush();
    }

    /**
     * Schedules the next update push with throttling.
     */
    private void scheduleUpdatePush() {
        if (disposedChecker.get()) {
            return;
        }

        final int delayMs;
        final long sequence;
        synchronized (lock) {
            if (updateScheduled) {
                return;
            }
            long elapsed = System.currentTimeMillis() - lastUpdateAtMs;
            delayMs = (int) Math.max(0L, STREAM_MESSAGE_UPDATE_INTERVAL_MS - elapsed);
            updateScheduled = true;
            sequence = ++updateSequence;
        }

        alarm.addRequest(() -> {
            final List<ClaudeSession.Message> snapshot;
            synchronized (lock) {
                updateScheduled = false;
                lastUpdateAtMs = System.currentTimeMillis();
                snapshot = pendingMessages;
                pendingMessages = null;
            }

            if (disposedChecker.get()) {
                return;
            }

            if (snapshot != null) {
                messageSender.accept(snapshot, sequence);
            }

            boolean hasPending;
            synchronized (lock) {
                hasPending = pendingMessages != null;
            }
            if (hasPending && !disposedChecker.get()) {
                scheduleUpdatePush();
            }
        }, delayMs);
    }

    /**
     * Flushes any pending message updates immediately.
     *
     * @param afterFlush Runnable to execute on EDT after flush completes (may be null)
     */
    public void flushUpdates(Runnable afterFlush) {
        if (disposedChecker.get()) {
            if (afterFlush != null) {
                ApplicationManager.getApplication().invokeLater(afterFlush);
            }
            return;
        }

        final List<ClaudeSession.Message> snapshot;
        final long sequence;
        synchronized (lock) {
            alarm.cancelAllRequests();
            updateScheduled = false;
            snapshot = pendingMessages != null ? pendingMessages : lastMessagesSnapshot;
            pendingMessages = null;
            sequence = ++updateSequence;
        }

        if (snapshot == null) {
            if (afterFlush != null) {
                ApplicationManager.getApplication().invokeLater(afterFlush);
            }
            return;
        }

        // Send the message; the sender is responsible for calling afterFlush
        sendWithCallback(snapshot, sequence, afterFlush);
    }

    /**
     * Sends messages with an optional callback after completion.
     */
    private void sendWithCallback(List<ClaudeSession.Message> messages, long sequence, Runnable afterFlush) {
        // Store snapshot for potential reuse
        synchronized (lock) {
            lastMessagesSnapshot = messages;
        }

        // The messageSender doesn't support callbacks, so we handle it here
        messageSender.accept(messages, sequence);

        if (afterFlush != null) {
            // Schedule callback on EDT after a brief delay to allow message processing
            ApplicationManager.getApplication().invokeLater(afterFlush);
        }
    }

    /**
     * Checks if a sequence number is still current.
     */
    public boolean isSequenceCurrent(long sequence) {
        synchronized (lock) {
            return sequence == updateSequence;
        }
    }

    /**
     * Disposes resources.
     */
    public void dispose() {
        synchronized (lock) {
            alarm.cancelAllRequests();
            pendingMessages = null;
            lastMessagesSnapshot = null;
        }
    }
}
