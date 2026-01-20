import { useState, useRef, useEffect, useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { AskUserQuestionRequest } from '../components/AskUserQuestionDialog';

export interface UseAskUserQuestionReturn {
  isOpen: boolean;
  currentRequest: AskUserQuestionRequest | null;
  handleSubmit: (requestId: string, answers: Record<string, string>) => void;
  handleCancel: (requestId: string) => void;
  queueRequest: (request: AskUserQuestionRequest) => void;
  isOpenRef: React.RefObject<boolean>;
  currentRequestRef: React.RefObject<AskUserQuestionRequest | null>;
}

export function useAskUserQuestion(): UseAskUserQuestionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<AskUserQuestionRequest | null>(null);

  const isOpenRef = useRef(false);
  const currentRequestRef = useRef<AskUserQuestionRequest | null>(null);
  const pendingRequestsRef = useRef<AskUserQuestionRequest[]>([]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    currentRequestRef.current = currentRequest;
  }, [isOpen, currentRequest]);

  const openDialog = useCallback((request: AskUserQuestionRequest) => {
    currentRequestRef.current = request;
    isOpenRef.current = true;
    setCurrentRequest(request);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    isOpenRef.current = false;
    currentRequestRef.current = null;
    setIsOpen(false);
    setCurrentRequest(null);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    if (currentRequest) return;

    const next = pendingRequestsRef.current.shift();
    if (next) {
      openDialog(next);
    }
  }, [isOpen, currentRequest, openDialog]);

  const queueRequest = useCallback((request: AskUserQuestionRequest) => {
    if (isOpenRef.current || currentRequestRef.current) {
      pendingRequestsRef.current.push(request);
    } else {
      openDialog(request);
    }
  }, [openDialog]);

  const handleSubmit = useCallback((requestId: string, answers: Record<string, string>) => {
    const payload = JSON.stringify({
      requestId,
      answers,
    });
    sendBridgeEvent('ask_user_question_response', payload);
    closeDialog();
  }, [closeDialog]);

  const handleCancel = useCallback((requestId: string) => {
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
