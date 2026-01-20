import { useState, useCallback } from 'react';
import { rewindFiles } from '../utils/bridge';
import type { RewindRequest } from '../components/RewindDialog';

export interface UseRewindDialogReturn {
  // Rewind confirmation dialog state
  isRewindDialogOpen: boolean;
  currentRewindRequest: RewindRequest | null;
  isRewinding: boolean;

  // Rewind select dialog state
  isRewindSelectDialogOpen: boolean;

  // Confirmation dialog handlers
  handleRewindConfirm: (sessionId: string, userMessageId: string) => void;
  handleRewindCancel: () => void;
  openRewindDialog: (request: RewindRequest) => void;

  // Select dialog handlers
  openRewindSelectDialog: () => void;
  handleRewindSelectCancel: () => void;

  // Handle rewind result from Java callback
  handleRewindResult: (success: boolean, message?: string) => void;
}

/**
 * Custom hook to manage rewind dialog state and handlers.
 *
 * The rewind feature has two dialogs:
 * 1. RewindSelectDialog - Choose which message to rewind to (lists rewindable messages)
 * 2. RewindDialog - Confirm the rewind operation
 *
 * This hook manages the state for both dialogs but leaves the rewindable messages
 * computation to the parent component (since it depends on message list state).
 */
export function useRewindDialog(): UseRewindDialogReturn {
  // Rewind confirmation dialog state
  const [isRewindDialogOpen, setIsRewindDialogOpen] = useState(false);
  const [currentRewindRequest, setCurrentRewindRequest] = useState<RewindRequest | null>(null);
  const [isRewinding, setIsRewinding] = useState(false);

  // Rewind select dialog state
  const [isRewindSelectDialogOpen, setIsRewindSelectDialogOpen] = useState(false);

  // Open the confirmation dialog with a specific request
  const openRewindDialog = useCallback((request: RewindRequest) => {
    setCurrentRewindRequest(request);
    setIsRewindDialogOpen(true);
  }, []);

  // Confirm and execute the rewind
  const handleRewindConfirm = useCallback((sessionId: string, userMessageId: string) => {
    setIsRewinding(true);
    rewindFiles(sessionId, userMessageId);
  }, []);

  // Cancel/close the confirmation dialog
  const handleRewindCancel = useCallback(() => {
    // Allow cancel even while rewinding (user can dismiss the dialog)
    if (isRewinding) {
      setIsRewinding(false);
    }
    setIsRewindDialogOpen(false);
    setCurrentRewindRequest(null);
  }, [isRewinding]);

  // Open the select dialog
  const openRewindSelectDialog = useCallback(() => {
    setIsRewindSelectDialogOpen(true);
  }, []);

  // Close the select dialog
  const handleRewindSelectCancel = useCallback(() => {
    setIsRewindSelectDialogOpen(false);
  }, []);

  // Handle rewind result from Java callback (window.onRewindResult)
  const handleRewindResult = useCallback((success: boolean, message?: string) => {
    setIsRewinding(false);
    setIsRewindDialogOpen(false);
    setCurrentRewindRequest(null);

    if (success) {
      window.addToast?.('Rewind successful', 'success');
    } else {
      window.addToast?.(message || 'Failed to restore files', 'error');
    }
  }, []);

  return {
    // Confirmation dialog
    isRewindDialogOpen,
    currentRewindRequest,
    isRewinding,
    handleRewindConfirm,
    handleRewindCancel,
    openRewindDialog,

    // Select dialog
    isRewindSelectDialogOpen,
    openRewindSelectDialog,
    handleRewindSelectCancel,

    // Result handler
    handleRewindResult,
  };
}

// Re-export types for convenience
export type { RewindRequest } from '../components/RewindDialog';
export type { RewindableMessage } from '../components/RewindSelectDialog';
