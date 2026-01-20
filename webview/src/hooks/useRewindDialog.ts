import { useState, useCallback } from 'react';
import { rewindFiles } from '../utils/bridge';
import type { RewindRequest } from '../components/RewindDialog';

export interface UseRewindDialogReturn {
  isRewindDialogOpen: boolean;
  currentRewindRequest: RewindRequest | null;
  isRewinding: boolean;

  isRewindSelectDialogOpen: boolean;

  handleRewindConfirm: (sessionId: string, userMessageId: string) => void;
  handleRewindCancel: () => void;
  openRewindDialog: (request: RewindRequest) => void;

  openRewindSelectDialog: () => void;
  handleRewindSelectCancel: () => void;

  handleRewindResult: (success: boolean, message?: string) => void;
}

export function useRewindDialog(): UseRewindDialogReturn {
  const [isRewindDialogOpen, setIsRewindDialogOpen] = useState(false);
  const [currentRewindRequest, setCurrentRewindRequest] = useState<RewindRequest | null>(null);
  const [isRewinding, setIsRewinding] = useState(false);

  const [isRewindSelectDialogOpen, setIsRewindSelectDialogOpen] = useState(false);

  const openRewindDialog = useCallback((request: RewindRequest) => {
    setCurrentRewindRequest(request);
    setIsRewindDialogOpen(true);
  }, []);

  const handleRewindConfirm = useCallback((sessionId: string, userMessageId: string) => {
    setIsRewinding(true);
    rewindFiles(sessionId, userMessageId);
  }, []);

  const handleRewindCancel = useCallback(() => {
    if (isRewinding) {
      setIsRewinding(false);
    }
    setIsRewindDialogOpen(false);
    setCurrentRewindRequest(null);
  }, [isRewinding]);

  const openRewindSelectDialog = useCallback(() => {
    setIsRewindSelectDialogOpen(true);
  }, []);

  const handleRewindSelectCancel = useCallback(() => {
    setIsRewindSelectDialogOpen(false);
  }, []);

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
    isRewindDialogOpen,
    currentRewindRequest,
    isRewinding,
    handleRewindConfirm,
    handleRewindCancel,
    openRewindDialog,

    isRewindSelectDialogOpen,
    openRewindSelectDialog,
    handleRewindSelectCancel,

    handleRewindResult,
  };
}

export type { RewindRequest } from '../components/RewindDialog';
export type { RewindableMessage } from '../components/RewindSelectDialog';
