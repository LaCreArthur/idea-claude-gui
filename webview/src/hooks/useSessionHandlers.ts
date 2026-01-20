import { useCallback } from 'react';
import { sendBridgeEvent } from '../utils/bridge';
import type { ClaudeMessage, HistoryData } from '../types';

export interface SessionResetOptions {
  clearMessages: () => void;
  setCurrentSessionId: (id: string | null) => void;
  setUsagePercentage: (val: number) => void;
  setUsageUsedTokens: (val: number) => void;
  setUsageMaxTokens: (fn: (prev: number | undefined) => number | undefined) => void;
}

export interface UseSessionHandlersParams {
  loading: boolean;
  messages: ClaudeMessage[];
  currentSessionId: string | null;
  historyData: HistoryData | null;
  setShowNewSessionConfirm: (show: boolean) => void;
  setShowInterruptConfirm: (show: boolean) => void;
  setHistoryData: (data: HistoryData | null) => void;
  setCurrentView: (view: 'chat' | 'history' | 'settings') => void;
  suppressNextStatusToastRef: React.RefObject<boolean>;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  resetOptions: SessionResetOptions;
}

export interface UseSessionHandlersReturn {
  /** Interrupt the current session */
  interruptSession: () => void;
  /** Start creating a new session (may show confirmation dialogs) */
  createNewSession: () => void;
  /** Confirm creating a new session */
  handleConfirmNewSession: () => void;
  /** Cancel creating a new session */
  handleCancelNewSession: () => void;
  /** Confirm interrupting and creating new session */
  handleConfirmInterrupt: () => void;
  /** Cancel interrupt confirmation */
  handleCancelInterrupt: () => void;
  /** Load a session from history */
  loadHistorySession: (sessionId: string) => void;
  /** Delete a session from history */
  deleteHistorySession: (sessionId: string) => void;
  /** Export a session to file */
  exportHistorySession: (sessionId: string, title: string) => void;
  /** Toggle favorite status of a session */
  toggleFavoriteSession: (sessionId: string) => void;
  /** Update the title of a session */
  updateHistoryTitle: (sessionId: string, newTitle: string) => void;
}

/**
 * Custom hook to manage session-related handlers.
 * Extracts session management logic from App.tsx for better organization.
 */
export function useSessionHandlers(params: UseSessionHandlersParams): UseSessionHandlersReturn {
  const {
    loading,
    messages,
    currentSessionId,
    historyData,
    setShowNewSessionConfirm,
    setShowInterruptConfirm,
    setHistoryData,
    setCurrentView,
    suppressNextStatusToastRef,
    addToast,
    resetOptions,
  } = params;

  const {
    clearMessages,
    setCurrentSessionId,
    setUsagePercentage,
    setUsageUsedTokens,
    setUsageMaxTokens,
  } = resetOptions;

  /** Reset session state to defaults */
  const resetSessionState = useCallback(() => {
    clearMessages();
    setCurrentSessionId(null);
    setUsagePercentage(0);
    setUsageUsedTokens(0);
    setUsageMaxTokens((prev) => prev ?? 272000);
  }, [clearMessages, setCurrentSessionId, setUsagePercentage, setUsageUsedTokens, setUsageMaxTokens]);

  /** Interrupt the current session */
  const interruptSession = useCallback(() => {
    sendBridgeEvent('interrupt_session');
  }, []);

  /** Start creating a new session (may show confirmation dialogs) */
  const createNewSession = useCallback(() => {
    // If conversation is in progress, show interrupt confirmation
    if (loading) {
      setShowInterruptConfirm(true);
      return;
    }

    if (messages.length === 0) {
      // Current session is empty, can be reused
      return;
    }
    setShowNewSessionConfirm(true);
  }, [loading, messages.length, setShowInterruptConfirm, setShowNewSessionConfirm]);

  /** Confirm creating a new session */
  const handleConfirmNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
    sendBridgeEvent('create_new_session');
    resetSessionState();
    // Toast is shown by backend when session is actually created
  }, [setShowNewSessionConfirm, resetSessionState]);

  /** Cancel creating a new session */
  const handleCancelNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
  }, [setShowNewSessionConfirm]);

  /** Confirm interrupting and creating new session */
  const handleConfirmInterrupt = useCallback(() => {
    setShowInterruptConfirm(false);
    // Interrupt current conversation
    interruptSession();
    // Create new session directly
    sendBridgeEvent('create_new_session');
    resetSessionState();
    // Toast is shown by backend when session is actually created
  }, [setShowInterruptConfirm, interruptSession, resetSessionState]);

  /** Cancel interrupt confirmation */
  const handleCancelInterrupt = useCallback(() => {
    setShowInterruptConfirm(false);
  }, [setShowInterruptConfirm]);

  /** Load a session from history */
  const loadHistorySession = useCallback((sessionId: string) => {
    sendBridgeEvent('load_session', sessionId);
    setCurrentSessionId(sessionId);
    setCurrentView('chat');
  }, [setCurrentSessionId, setCurrentView]);

  /** Delete a session from history */
  const deleteHistorySession = useCallback((sessionId: string) => {
    // Send delete request to backend
    sendBridgeEvent('delete_session', sessionId);

    // Immediately update frontend state
    if (historyData && historyData.sessions) {
      const updatedSessions = historyData.sessions.filter(s => s.sessionId !== sessionId);
      const deletedSession = historyData.sessions.find(s => s.sessionId === sessionId);
      const updatedTotal = (historyData.total || 0) - (deletedSession?.messageCount || 0);

      setHistoryData({
        ...historyData,
        sessions: updatedSessions,
        total: updatedTotal
      });

      // If deleting current session, clear messages and reset state
      if (sessionId === currentSessionId) {
        clearMessages();
        setCurrentSessionId(null);
        setUsagePercentage(0);
        setUsageUsedTokens(0);
        // Suppress next status toast from auto-created session
        suppressNextStatusToastRef.current = true;
        sendBridgeEvent('create_new_session');
      }

      addToast('Session deleted', 'success');
    }
  }, [historyData, currentSessionId, setHistoryData, clearMessages, setCurrentSessionId, setUsagePercentage, setUsageUsedTokens, suppressNextStatusToastRef, addToast]);

  /** Export a session to file */
  const exportHistorySession = useCallback((sessionId: string, title: string) => {
    const exportData = JSON.stringify({ sessionId, title });
    sendBridgeEvent('export_session', exportData);
  }, []);

  /** Toggle favorite status of a session */
  const toggleFavoriteSession = useCallback((sessionId: string) => {
    // Send favorite toggle request to backend
    sendBridgeEvent('toggle_favorite', sessionId);

    // Immediately update frontend state
    if (historyData && historyData.sessions) {
      const updatedSessions = historyData.sessions.map(session => {
        if (session.sessionId === sessionId) {
          const isFavorited = !session.isFavorited;
          return {
            ...session,
            isFavorited,
            favoritedAt: isFavorited ? Date.now() : undefined
          };
        }
        return session;
      });

      setHistoryData({
        ...historyData,
        sessions: updatedSessions
      });

      // Show toast
      const session = historyData.sessions.find(s => s.sessionId === sessionId);
      if (session?.isFavorited) {
        addToast('Unfavorited', 'success');
      } else {
        addToast('Favorited', 'success');
      }
    }
  }, [historyData, setHistoryData, addToast]);

  /** Update the title of a session */
  const updateHistoryTitle = useCallback((sessionId: string, newTitle: string) => {
    // Send update request to backend
    const updateData = JSON.stringify({ sessionId, customTitle: newTitle });
    sendBridgeEvent('update_title', updateData);

    // Immediately update frontend state
    if (historyData && historyData.sessions) {
      const updatedSessions = historyData.sessions.map(session => {
        if (session.sessionId === sessionId) {
          return {
            ...session,
            title: newTitle
          };
        }
        return session;
      });

      setHistoryData({
        ...historyData,
        sessions: updatedSessions
      });

      addToast('Title updated', 'success');
    }
  }, [historyData, setHistoryData, addToast]);

  return {
    interruptSession,
    createNewSession,
    handleConfirmNewSession,
    handleCancelNewSession,
    handleConfirmInterrupt,
    handleCancelInterrupt,
    loadHistorySession,
    deleteHistorySession,
    exportHistorySession,
    toggleFavoriteSession,
    updateHistoryTitle,
  };
}
