import { useState, useRef, useEffect, useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { PermissionRequest } from '../components/PermissionDialog';

export interface UsePermissionDialogReturn {
  isOpen: boolean;
  currentRequest: PermissionRequest | null;
  handleApprove: (channelId: string) => void;
  handleApproveAlways: (channelId: string) => void;
  handleSkip: (channelId: string) => void;
  queueRequest: (request: PermissionRequest) => void;
  isOpenRef: React.RefObject<boolean>;
  currentRequestRef: React.RefObject<PermissionRequest | null>;
}

export function usePermissionDialog(): UsePermissionDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<PermissionRequest | null>(null);

  const isOpenRef = useRef(false);
  const currentRequestRef = useRef<PermissionRequest | null>(null);
  const pendingRequestsRef = useRef<PermissionRequest[]>([]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    currentRequestRef.current = currentRequest;
  }, [isOpen, currentRequest]);

  const openDialog = useCallback((request: PermissionRequest) => {
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

  const queueRequest = useCallback((request: PermissionRequest) => {
    if (isOpenRef.current || currentRequestRef.current) {
      pendingRequestsRef.current.push(request);
    } else {
      openDialog(request);
    }
  }, [openDialog]);

  const handleApprove = useCallback((channelId: string) => {
    const payload = JSON.stringify({
      channelId,
      allow: true,
      remember: false,
      rejectMessage: null,
    });
    sendBridgeEvent('permission_decision', payload);
    closeDialog();
  }, [closeDialog]);

  const handleApproveAlways = useCallback((channelId: string) => {
    const payload = JSON.stringify({
      channelId,
      allow: true,
      remember: true,
      rejectMessage: null,
    });
    sendBridgeEvent('permission_decision', payload);
    closeDialog();
  }, [closeDialog]);

  const handleSkip = useCallback((channelId: string) => {
    const payload = JSON.stringify({
      channelId,
      allow: false,
      remember: false,
      rejectMessage: 'User denied the permission request',
    });
    sendBridgeEvent('permission_decision', payload);
    closeDialog();
  }, [closeDialog]);

  return {
    isOpen,
    currentRequest,
    handleApprove,
    handleApproveAlways,
    handleSkip,
    queueRequest,
    isOpenRef,
    currentRequestRef,
  };
}
