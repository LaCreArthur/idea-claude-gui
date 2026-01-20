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
  interruptSession: () => void;
  createNewSession: () => void;
  handleConfirmNewSession: () => void;
  handleCancelNewSession: () => void;
  handleConfirmInterrupt: () => void;
  handleCancelInterrupt: () => void;
  loadHistorySession: (sessionId: string) => void;
  deleteHistorySession: (sessionId: string) => void;
  exportHistorySession: (sessionId: string, title: string) => void;
  toggleFavoriteSession: (sessionId: string) => void;
  updateHistoryTitle: (sessionId: string, newTitle: string) => void;
}

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

  const resetSessionState = useCallback(() => {
    clearMessages();
    setCurrentSessionId(null);
    setUsagePercentage(0);
    setUsageUsedTokens(0);
    setUsageMaxTokens((prev) => prev ?? 272000);
  }, [clearMessages, setCurrentSessionId, setUsagePercentage, setUsageUsedTokens, setUsageMaxTokens]);

  const interruptSession = useCallback(() => {
    sendBridgeEvent('interrupt_session');
  }, []);

  const createNewSession = useCallback(() => {
    if (loading) {
      setShowInterruptConfirm(true);
      return;
    }

    if (messages.length === 0) {
      return;
    }
    setShowNewSessionConfirm(true);
  }, [loading, messages.length, setShowInterruptConfirm, setShowNewSessionConfirm]);

  const handleConfirmNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
    sendBridgeEvent('create_new_session');
    resetSessionState();
  }, [setShowNewSessionConfirm, resetSessionState]);

  const handleCancelNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
  }, [setShowNewSessionConfirm]);

  const handleConfirmInterrupt = useCallback(() => {
    setShowInterruptConfirm(false);
    interruptSession();
    sendBridgeEvent('create_new_session');
    resetSessionState();
  }, [setShowInterruptConfirm, interruptSession, resetSessionState]);

  const handleCancelInterrupt = useCallback(() => {
    setShowInterruptConfirm(false);
  }, [setShowInterruptConfirm]);

  const loadHistorySession = useCallback((sessionId: string) => {
    sendBridgeEvent('load_session', sessionId);
    setCurrentSessionId(sessionId);
    setCurrentView('chat');
  }, [setCurrentSessionId, setCurrentView]);

  const deleteHistorySession = useCallback((sessionId: string) => {
    sendBridgeEvent('delete_session', sessionId);

    if (historyData && historyData.sessions) {
      const updatedSessions = historyData.sessions.filter(s => s.sessionId !== sessionId);
      const deletedSession = historyData.sessions.find(s => s.sessionId === sessionId);
      const updatedTotal = (historyData.total || 0) - (deletedSession?.messageCount || 0);

      setHistoryData({
        ...historyData,
        sessions: updatedSessions,
        total: updatedTotal
      });

      if (sessionId === currentSessionId) {
        clearMessages();
        setCurrentSessionId(null);
        setUsagePercentage(0);
        setUsageUsedTokens(0);
        suppressNextStatusToastRef.current = true;
        sendBridgeEvent('create_new_session');
      }

      addToast('Session deleted', 'success');
    }
  }, [historyData, currentSessionId, setHistoryData, clearMessages, setCurrentSessionId, setUsagePercentage, setUsageUsedTokens, suppressNextStatusToastRef, addToast]);

  const exportHistorySession = useCallback((sessionId: string, title: string) => {
    const exportData = JSON.stringify({ sessionId, title });
    sendBridgeEvent('export_session', exportData);
  }, []);

  const toggleFavoriteSession = useCallback((sessionId: string) => {
    sendBridgeEvent('toggle_favorite', sessionId);

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

      const session = historyData.sessions.find(s => s.sessionId === sessionId);
      if (session?.isFavorited) {
        addToast('Unfavorited', 'success');
      } else {
        addToast('Favorited', 'success');
      }
    }
  }, [historyData, setHistoryData, addToast]);

  const updateHistoryTitle = useCallback((sessionId: string, newTitle: string) => {
    const updateData = JSON.stringify({ sessionId, customTitle: newTitle });
    sendBridgeEvent('update_title', updateData);

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
