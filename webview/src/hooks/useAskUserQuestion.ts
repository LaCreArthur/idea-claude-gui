import { useState, useRef, useEffect, useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { AskUserQuestionRequest } from '../components/AskUserQuestionDialog';

export interface UseAskUserQuestionReturn {
  /** Whether the ask user question dialog is currently open */
  isOpen: boolean;
  /** The current ask user question request being displayed */
  currentRequest: AskUserQuestionRequest | null;
  /** Handle submit with answers */
  handleSubmit: (requestId: string, answers: Record<string, string>) => void;
  /** Handle cancel */
  handleCancel: (requestId: string) => void;
  /** Queue a new ask user question request (called from window.showAskUserQuestionDialog) */
  queueRequest: (request: AskUserQuestionRequest) => void;
  /** Refs for checking state in callbacks (avoids stale closure issues) */
  isOpenRef: React.RefObject<boolean>;
  currentRequestRef: React.RefObject<AskUserQuestionRequest | null>;
}

/**
 * Custom hook to manage ask user question dialog state and handlers.
 * Handles queueing multiple requests and processing them one at a time.
 */
export function useAskUserQuestion(): UseAskUserQuestionReturn {
  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<AskUserQuestionRequest | null>(null);

  // Refs for synchronous access in callbacks (avoids stale closure issues)
  const isOpenRef = useRef(false);
  const currentRequestRef = useRef<AskUserQuestionRequest | null>(null);
  const pendingRequestsRef = useRef<AskUserQuestionRequest[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen;
    currentRequestRef.current = currentRequest;
  }, [isOpen, currentRequest]);

  // Open dialog with a specific request
  const openDialog = useCallback((request: AskUserQuestionRequest) => {
    currentRequestRef.current = request;
    isOpenRef.current = true;
    setCurrentRequest(request);
    setIsOpen(true);
  }, []);

  // Close dialog and clear current request
  const closeDialog = useCallback(() => {
    isOpenRef.current = false;
    currentRequestRef.current = null;
    setIsOpen(false);
    setCurrentRequest(null);
  }, []);

  // Process next pending request when dialog closes
  useEffect(() => {
    if (isOpen) return;
    if (currentRequest) return;

    const next = pendingRequestsRef.current.shift();
    if (next) {
      openDialog(next);
    }
  }, [isOpen, currentRequest, openDialog]);

  // Queue a new ask user question request
  const queueRequest = useCallback((request: AskUserQuestionRequest) => {
    if (isOpenRef.current || currentRequestRef.current) {
      // Dialog is busy, queue the request
      pendingRequestsRef.current.push(request);
    } else {
      // Dialog is free, open immediately
      openDialog(request);
    }
  }, [openDialog]);

  // Handle submit with answers
  const handleSubmit = useCallback((requestId: string, answers: Record<string, string>) => {
    const payload = JSON.stringify({
      requestId,
      answers,
    });
    sendBridgeEvent('ask_user_question_response', payload);
    closeDialog();
  }, [closeDialog]);

  // Handle cancel
  const handleCancel = useCallback((requestId: string) => {
    // Send cancelled flag to indicate user cancelled
    const payload = JSON.stringify({
      requestId,
      cancelled: true,
    });
    sendBridgeEvent('ask_user_question_response', payload);
    closeDialog();
  }, [closeDialog]);

  return {
    isOpen,
    currentRequest,
    handleSubmit,
    handleCancel,
    queueRequest,
    isOpenRef,
    currentRequestRef,
  };
}
