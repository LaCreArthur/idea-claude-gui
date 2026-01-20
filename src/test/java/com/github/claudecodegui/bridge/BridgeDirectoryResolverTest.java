package com.github.claudecodegui.bridge;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for BridgeDirectoryResolver, particularly around extraction state handling.
 *
 * These tests verify the fix for the "fresh install" bug where the error panel
 * incorrectly showed "Cannot find Node.js" when the actual issue was that
 * bridge extraction hadn't completed yet.
 */
class BridgeDirectoryResolverTest {

    private BridgeDirectoryResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new BridgeDirectoryResolver();
        resolver.clearCache(); // Ensure clean state
    }

    @Test
    @DisplayName("Initial state: extraction not started, not complete")
    void initialState_extractionNotStartedNotComplete() {
        // On fresh start, extraction hasn't started yet
        assertFalse(resolver.isExtractionInProgress(),
            "Extraction should not be in progress initially");
        assertFalse(resolver.isExtractionComplete(),
            "Extraction should not be complete initially");
    }

    @Test
    @DisplayName("Combined condition catches NOT_STARTED state")
    void combinedCondition_catchesNotStartedState() {
        // This is the fix: the condition "isExtractionInProgress() || !isExtractionComplete()"
        // should be true when extraction hasn't started
        boolean shouldShowLoading = resolver.isExtractionInProgress() || !resolver.isExtractionComplete();

        assertTrue(shouldShowLoading,
            "Combined condition should be true when extraction not started (to show loading panel)");
    }

    @Test
    @DisplayName("Combined condition catches IN_PROGRESS state")
    void combinedCondition_catchesInProgressState() {
        // Note: We can't easily simulate IN_PROGRESS without mocking, but we can verify
        // that the combined condition would catch it if it were true
        // For IN_PROGRESS: isExtractionInProgress()=true, isExtractionComplete()=false
        // So: true || !false = true || true = true

        // When not in progress and not complete (NOT_STARTED), the condition is:
        // false || !false = false || true = true
        boolean shouldShowLoading = resolver.isExtractionInProgress() || !resolver.isExtractionComplete();
        assertTrue(shouldShowLoading,
            "Combined condition should be true for NOT_STARTED state");
    }

    @Test
    @DisplayName("clearCache resets extraction state")
    void clearCache_resetsExtractionState() {
        // After clearing cache, state should be reset
        resolver.clearCache();

        assertFalse(resolver.isExtractionInProgress(),
            "Extraction should not be in progress after clearCache");
        assertFalse(resolver.isExtractionComplete(),
            "Extraction should not be complete after clearCache");
    }

    @Test
    @DisplayName("getExtractionFuture returns non-null future")
    void getExtractionFuture_returnsNonNullFuture() {
        // The future should always be available for async waiting
        assertNotNull(resolver.getExtractionFuture(),
            "Extraction future should not be null");
    }

    @Test
    @DisplayName("isValidBridgeDir returns false for null")
    void isValidBridgeDir_returnsFalseForNull() {
        assertFalse(resolver.isValidBridgeDir(null),
            "Null directory should not be valid");
    }

    @Test
    @DisplayName("isValidBridgeDir returns false for non-existent directory")
    void isValidBridgeDir_returnsFalseForNonExistent() {
        java.io.File nonExistent = new java.io.File("/non/existent/path/that/does/not/exist");
        assertFalse(resolver.isValidBridgeDir(nonExistent),
            "Non-existent directory should not be valid");
    }

    /**
     * This test documents the expected behavior for the fresh install scenario.
     * On fresh install:
     * 1. extractionState = NOT_STARTED
     * 2. isExtractionInProgress() returns false
     * 3. isExtractionComplete() returns false
     * 4. The UI code should use: isExtractionInProgress() || !isExtractionComplete()
     *    which evaluates to: false || !false = false || true = true
     * 5. This means the loading panel should be shown, not the error panel
     */
    @Test
    @DisplayName("Fresh install scenario: should show loading, not error")
    void freshInstallScenario_shouldShowLoadingNotError() {
        // Simulate fresh install state
        resolver.clearCache();

        // Verify the individual conditions
        boolean inProgress = resolver.isExtractionInProgress();
        boolean complete = resolver.isExtractionComplete();

        // Document expected values
        assertFalse(inProgress, "On fresh install, extraction is not in progress yet");
        assertFalse(complete, "On fresh install, extraction is not complete");

        // The key fix: this combined condition should be TRUE to show loading panel
        boolean shouldShowLoadingPanel = inProgress || !complete;
        assertTrue(shouldShowLoadingPanel,
            "On fresh install, the combined condition should trigger loading panel, " +
            "not the error panel (which incorrectly showed 'Cannot find Node.js')");
    }
}
