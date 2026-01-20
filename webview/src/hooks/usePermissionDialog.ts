import { useState, useRef, useEffect, useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { PermissionRequest } from '../components/PermissionDialog';

export interface UsePermissionDialogReturn {
  /** Whether the permission dialog is currently open */
  isOpen: boolean;
  /** The current permission request being displayed */
  currentRequest: PermissionRequest | null;
  /** Handle approval (allow once) */
  handleApprove: (channelId: string) => void;
  /** Handle approval with remember (always allow) */
  handleApproveAlways: (channelId: string) => void;
  /** Handle denial (skip/reject) */
  handleSkip: (channelId: string) => void;
  /** Queue a new permission request (called from window.showPermissionDialog) */
  queueRequest: (request: PermissionRequest) => void;
  /** Refs for checking state in callbacks (avoids stale closure issues) */
  isOpenRef: React.RefObject<boolean>;
  currentRequestRef: React.RefObject<PermissionRequest | null>;
}

/**
 * Custom hook to manage permission dialog state and handlers.
 * Handles queueing multiple permission requests and processing them one at a time.
 */
export function usePermissionDialog(): UsePermissionDialogReturn {
  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<PermissionRequest | null>(null);

  // Refs for synchronous access in callbacks (avoids stale closure issues)
  const isOpenRef = useRef(false);
  const currentRequestRef = useRef<PermissionRequest | null>(null);
  const pendingRequestsRef = useRef<PermissionRequest[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen;
    currentRequestRef.current = currentRequest;
  }, [isOpen, currentRequest]);

  // Open dialog with a specific request
  const openDialog = useCallback((request: PermissionRequest) => {
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

  // Queue a new permission request
  const queueRequest = useCallback((request: PermissionRequest) => {
    if (isOpenRef.current || currentRequestRef.current) {
      // Dialog is busy, queue the request
      pendingRequestsRef.current.push(request);
    } else {
      // Dialog is free, open immediately
      openDialog(request);
    }
  }, [openDialog]);

  // Handle approval (allow once)
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

  // Handle approval with remember (always allow)
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

  // Handle denial (skip/reject)
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
