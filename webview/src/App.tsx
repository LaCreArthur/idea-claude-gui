import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import HistoryView from './components/history/HistoryView';
import SettingsView from './components/settings';
import { BlinkingLogo } from './components/BlinkingLogo';
import { AnimatedText } from './components/AnimatedText';
import type { SettingsTab } from './components/settings/SettingsSidebar';
import ConfirmDialog from './components/ConfirmDialog';
import PermissionDialog from './components/PermissionDialog';
import AskUserQuestionDialog from './components/AskUserQuestionDialog';
import { usePermissionDialog } from './hooks/usePermissionDialog';
import { useAskUserQuestion } from './hooks/useAskUserQuestion';
import RewindDialog from './components/RewindDialog';
import RewindSelectDialog from './components/RewindSelectDialog';
import { useRewindDialog } from './hooks/useRewindDialog';
import { useRewindLogic } from './hooks/useRewindLogic';
import { useStreamingState } from './hooks/useStreamingState';
import { useStreamingCallbacks } from './hooks/useStreamingCallbacks';
import { useProviderConfig } from './hooks/useProviderConfig';
import { useSessionHandlers } from './hooks/useSessionHandlers';
import { useChatHandlers } from './hooks/useChatHandlers';
import { useSettingsCallbacks } from './hooks/useSettingsCallbacks';
import { useMessageCallbacks } from './hooks/useMessageCallbacks';
import { ChatInputBox } from './components/ChatInputBox';
import { CLAUDE_MODELS, type PermissionMode, type SelectedAgent } from './components/ChatInputBox/types';
import { MessageItem } from './components/MessageItem';
import { BackIcon } from './components/Icons';
import { ToastContainer, type ToastMessage } from './components/Toast';
import WaitingIndicator from './components/WaitingIndicator';
import { ScrollControl } from './components/ScrollControl';
import { APP_VERSION } from './version/version';
import { sendBridgeEvent } from './utils/bridge';
import { getContentBlocks } from './utils/messageUtils';
import type {
  ClaudeMessage,
  HistoryData,
} from './types';

type ViewMode = 'chat' | 'history' | 'settings';

const DEFAULT_STATUS = 'ready';

const App = () => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [_status, setStatus] = useState(DEFAULT_STATUS); // Internal state, displayed via toast
  const [loading, setLoading] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [currentView, setCurrentView] = useState<ViewMode>('chat');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [showInterruptConfirm, setShowInterruptConfirm] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // 输入框草稿内容（页面切换时保持）
  const [draftInput, setDraftInput] = useState('');
  // 标志位：是否抑制下一次 updateStatus 触发的 toast（用于删除当前会话后自动创建新会话的场景）
  const suppressNextStatusToastRef = useRef(false);

  // Permission dialog hook
  const {
    isOpen: permissionDialogOpen,
    currentRequest: currentPermissionRequest,
    handleApprove: handlePermissionApprove,
    handleApproveAlways: handlePermissionApproveAlways,
    handleSkip: handlePermissionSkip,
    queueRequest: queuePermissionRequest,
  } = usePermissionDialog();

  // AskUserQuestion dialog hook
  const {
    isOpen: askUserQuestionDialogOpen,
    currentRequest: currentAskUserQuestionRequest,
    handleSubmit: handleAskUserQuestionSubmit,
    handleCancel: handleAskUserQuestionCancel,
    queueRequest: queueAskUserQuestionRequest,
  } = useAskUserQuestion();

  // Rewind dialog hook
  const {
    isRewindDialogOpen,
    currentRewindRequest,
    isRewinding,
    isRewindSelectDialogOpen,
    handleRewindConfirm,
    handleRewindCancel,
    openRewindDialog,
    openRewindSelectDialog,
    handleRewindSelectCancel,
    handleRewindResult,
  } = useRewindDialog();

  // Streaming state hook
  const {
    streamingActive,
    setStreamingActive,
    streamingContentRef,
    isStreamingRef,
    useBackendStreamingRenderRef,
    streamingTextSegmentsRef,
    activeTextSegmentIndexRef,
    streamingThinkingSegmentsRef,
    activeThinkingSegmentIndexRef,
    seenToolUseCountRef,
    streamingMessageIndexRef,
    contentUpdateTimeoutRef,
    thinkingUpdateTimeoutRef,
    lastContentUpdateRef,
    lastThinkingUpdateRef,
    isAutoScrollingRef,
    autoExpandedThinkingKeysRef,
  } = useStreamingState();

  // Provider/model configuration hook
  const {
    currentProvider,
    setCurrentProvider,
    selectedClaudeModel,
    setSelectedClaudeModel,
    claudePermissionMode,
    setClaudePermissionMode,
    permissionMode,
    setPermissionMode,
    activeProviderConfig,
    setActiveProviderConfig,
    claudeSettingsAlwaysThinkingEnabled,
    setClaudeSettingsAlwaysThinkingEnabled,
    currentProviderRef,
    syncActiveProviderModelMapping,
  } = useProviderConfig();

  // ChatInputBox 相关状态
  const [usagePercentage, setUsagePercentage] = useState(0);
  const [usageUsedTokens, setUsageUsedTokens] = useState<number | undefined>(undefined);
  const [usageMaxTokens, setUsageMaxTokens] = useState<number | undefined>(undefined);
  const [, setProviderConfigVersion] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  // 🔧 流式传输开关状态（同步设置页面）
  const [streamingEnabledSetting, setStreamingEnabledSetting] = useState(false);
  // 发送快捷键设置
  const [sendShortcut, setSendShortcut] = useState<'enter' | 'cmdEnter'>('enter');

  // 🔧 SDK 安装状态（用于在未安装时禁止提问）
  const [sdkStatus, setSdkStatus] = useState<Record<string, { installed?: boolean; status?: string }>>({});
  const [sdkStatusLoaded, setSdkStatusLoaded] = useState(false); // 标记 SDK 状态是否已从后端加载

  // Context state (active file and selection) - 保留用于 ContextBar 显示
  const [contextInfo, setContextInfo] = useState<{ file: string; startLine?: number; endLine?: number; raw: string } | null>(null);

  // Current selected model (Claude only)
  const selectedModel = selectedClaudeModel;

  // 🔧 根据当前提供商判断对应的 SDK 是否已安装
  const currentSdkInstalled = (() => {
    // 状态未加载时，返回 false（显示加载中或未安装提示）
    if (!sdkStatusLoaded) return false;
    // Provider -> SDK mapping (Claude only)
    const sdkId = 'claude-sdk';
    const status = sdkStatus[sdkId];
    // Check status field (priority) or installed field
    return status?.status === 'installed' || status?.installed === true;
  })();

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputAreaRef = useRef<HTMLDivElement | null>(null);
  // 追踪用户是否在底部（用于判断是否需要自动滚动）
  const isUserAtBottomRef = useRef(true);
  // 追踪上次按下 ESC 的时间（用于双击 ESC 快捷键）
  const lastEscPressTimeRef = useRef<number>(0);

  // 初始化主题和字体缩放
  useEffect(() => {
    // 初始化主题
    const savedTheme = localStorage.getItem('theme');
    const theme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    // 初始化字体缩放
    const savedLevel = localStorage.getItem('fontSizeLevel');
    const level = savedLevel ? parseInt(savedLevel, 10) : 3; // 默认档位 3 (100%)
    const fontSizeLevel = (level >= 1 && level <= 6) ? level : 3;

    // 将档位映射到缩放比例
    const fontSizeMap: Record<number, number> = {
      1: 0.8,   // 80%
      2: 0.9,   // 90%
      3: 1.0,   // 100% (默认)
      4: 1.1,   // 110%
      5: 1.2,   // 120%
      6: 1.4,   // 140%
    };
    const scale = fontSizeMap[fontSizeLevel] || 1.0;
    document.documentElement.style.setProperty('--font-scale', scale.toString());
  }, []);

  // Initialize E2E test bridge if in test mode (set by Java when claude.test.mode=true)
  useEffect(() => {
    if (!window.__testMode) return;

    console.log('[TEST_MODE] Initializing test bridge in React');

    window.__testBridge = {
      getMessageLog: () => window.__testMessageLog || [],

      clearLog: () => {
        window.__testMessageLog = [];
      },

      waitForMessage: (typePrefix: string, timeoutMs = 10000) =>
        new Promise((resolve, reject) => {
          const startTime = Date.now();
          const check = () => {
            const log = window.__testMessageLog || [];
            const found = log.find((e) => e.msg.startsWith(typePrefix));
            if (found) {
              resolve(found.msg);
            } else if (Date.now() - startTime > timeoutMs) {
              reject(new Error(`Timeout waiting for message: ${typePrefix}`));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        }),

      waitForCondition: (predicate: (msg: string) => boolean, timeoutMs = 10000) =>
        new Promise((resolve, reject) => {
          const startTime = Date.now();
          const check = () => {
            const log = window.__testMessageLog || [];
            const found = log.find((e) => predicate(e.msg));
            if (found) {
              resolve(found.msg);
            } else if (Date.now() - startTime > timeoutMs) {
              reject(new Error('Timeout waiting for condition'));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        }),
    };

    console.log('[TEST_MODE] Test bridge initialized');
  }, []);

  // 从 LocalStorage 加载模型选择状态，并同步到后端
  // Load model selection state from LocalStorage and sync to backend
  useEffect(() => {
    try {
      const saved = localStorage.getItem('model-selection-state');
      let restoredClaudeModel = CLAUDE_MODELS[0].id;
      const initialPermissionMode: PermissionMode = 'default';

      if (saved) {
        const state = JSON.parse(saved);

        // Restore Claude model if valid
        if (CLAUDE_MODELS.find(m => m.id === state.claudeModel)) {
          restoredClaudeModel = state.claudeModel;
          setSelectedClaudeModel(state.claudeModel);
        }
      }

      setPermissionMode(initialPermissionMode);

      // Sync model state to backend on init
      let syncRetryCount = 0;
      const MAX_SYNC_RETRIES = 30;

      const syncToBackend = () => {
        if (window.sendToJava) {
          sendBridgeEvent('set_provider', 'claude');
          sendBridgeEvent('set_model', restoredClaudeModel);
          sendBridgeEvent('set_mode', initialPermissionMode);
        } else {
          syncRetryCount++;
          if (syncRetryCount < MAX_SYNC_RETRIES) {
            setTimeout(syncToBackend, 100);
          } else {
            console.warn('[Frontend] Failed to sync model state to backend: bridge not available after', MAX_SYNC_RETRIES, 'retries');
          }
        }
      };
      setTimeout(syncToBackend, 200);
    } catch (error) {
      console.error('Failed to load model selection state:', error);
    }
  }, []);

  // Save model selection state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('model-selection-state', JSON.stringify({
        provider: currentProvider,
        claudeModel: selectedClaudeModel,
      }));
    } catch (error) {
      console.error('Failed to save model selection state:', error);
    }
  }, [currentProvider, selectedClaudeModel]);

  // 加载选中的智能体
  useEffect(() => {
    let retryCount = 0;
    const MAX_RETRIES = 10; // 减少到10次，总共1秒
    let timeoutId: number | undefined;

    const loadSelectedAgent = () => {
      if (window.sendToJava) {
        sendBridgeEvent('get_selected_agent');
      } else {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          timeoutId = window.setTimeout(loadSelectedAgent, 100);
        } else {
          console.warn('[Frontend] Failed to load selected agent: bridge not available after', MAX_RETRIES, 'retries');
          // 即使加载失败，也不影响其他功能的使用
        }
      }
    };

    timeoutId = window.setTimeout(loadSelectedAgent, 200); // 减少初始延迟到200ms

    return () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Toast helper functions
  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    // Don't show toast for default status
    if (message === DEFAULT_STATUS || !message) return;

    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Session handlers hook
  const sessionHandlers = useSessionHandlers({
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
    resetOptions: {
      clearMessages: () => setMessages([]),
      setCurrentSessionId,
      setUsagePercentage,
      setUsageUsedTokens,
      setUsageMaxTokens,
    },
  });

  const {
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
  } = sessionHandlers;

  // Chat handlers hook
  const {
    handleSubmit,
    handleModeSelect,
    handleModelSelect,
    handleProviderSelect,
    handleAgentSelect,
    handleToggleThinking,
    handleStreamingEnabledChange,
    handleSendShortcutChange,
  } = useChatHandlers({
    loading,
    sdkStatusLoaded,
    currentSdkInstalled,
    currentProvider,
    selectedClaudeModel,
    claudePermissionMode,
    activeProviderConfig,
    selectedAgent,
    messagesContainerRef,
    isUserAtBottomRef,
    setMessages,
    setLoading,
    setLoadingStartTime,
    setCurrentView,
    setSettingsInitialTab,
    setCurrentProvider,
    setSelectedClaudeModel,
    setPermissionMode,
    setClaudePermissionMode,
    setSelectedAgent,
    setActiveProviderConfig,
    setClaudeSettingsAlwaysThinkingEnabled,
    setStreamingEnabledSetting,
    setSendShortcut,
    addToast,
  });

  // Streaming callbacks hook (sets up window.onStreamStart, onContentDelta, etc.)
  useStreamingCallbacks({
    streamingContentRef,
    isStreamingRef,
    useBackendStreamingRenderRef,
    streamingTextSegmentsRef,
    activeTextSegmentIndexRef,
    streamingThinkingSegmentsRef,
    activeThinkingSegmentIndexRef,
    seenToolUseCountRef,
    streamingMessageIndexRef,
    contentUpdateTimeoutRef,
    thinkingUpdateTimeoutRef,
    lastContentUpdateRef,
    lastThinkingUpdateRef,
    autoExpandedThinkingKeysRef,
    currentProviderRef,
    setMessages,
    setStreamingActive,
    setExpandedThinking,
    setIsThinking,
    isUserAtBottomRef,
  });

  // Settings callbacks hook (SDK status, usage, mode, model, provider, streaming)
  useSettingsCallbacks({
    setSdkStatus,
    setSdkStatusLoaded,
    setUsagePercentage,
    setUsageUsedTokens,
    setUsageMaxTokens,
    setPermissionMode,
    setClaudePermissionMode,
    setSelectedClaudeModel,
    syncActiveProviderModelMapping,
    setProviderConfigVersion,
    setActiveProviderConfig,
    setClaudeSettingsAlwaysThinkingEnabled,
    setStreamingEnabledSetting,
    setSendShortcut,
  });

  // Message callbacks hook (updateMessages, updateStatus, dialog callbacks, agent callbacks, etc.)
  useMessageCallbacks({
    streamingContentRef,
    isStreamingRef,
    useBackendStreamingRenderRef,
    streamingTextSegmentsRef,
    activeTextSegmentIndexRef,
    streamingThinkingSegmentsRef,
    activeThinkingSegmentIndexRef,
    seenToolUseCountRef,
    streamingMessageIndexRef,
    suppressNextStatusToastRef,
    isUserAtBottomRef,
    messagesContainerRef,
    setMessages,
    setStatus,
    setLoading,
    setLoadingStartTime,
    setIsThinking,
    setHistoryData,
    setCurrentSessionId,
    setContextInfo,
    setSelectedAgent,
    queuePermissionRequest,
    queueAskUserQuestionRequest,
    addToast,
  });

  // Rewind logic hook (mergedMessages, rewindable messages, rewind actions)
  const {
    mergedMessages,
    rewindableMessages,
    handleRewindSelect,
    findToolResult,
    sessionTitle,
  } = useRewindLogic({
    messages,
    currentProvider,
    currentSessionId,
    openRewindDialog,
    handleRewindSelectCancel,
    addToast,
  });

  // Rewind result callback (separate useEffect because it depends on handleRewindResult)
  useEffect(() => {
    window.onRewindResult = (json: string) => {
      try {
        const result = JSON.parse(json);
        handleRewindResult(result.success, result.message);
      } catch (error) {
        console.error('[Frontend] Failed to parse rewind result:', error);
        handleRewindResult(false, 'Failed to parse result');
      }
    };
  }, [handleRewindResult]);

  useEffect(() => {
    if (currentView !== 'history') {
      return;
    }

    let historyRetryCount = 0;
    const MAX_HISTORY_RETRIES = 30; // 最多重试30次（3秒）
    let currentTimer: number | null = null;

    const requestHistoryData = () => {
      if (window.sendToJava) {
        // 传递 provider 参数给后端
        sendBridgeEvent('load_history_data', currentProvider);
      } else {
        historyRetryCount++;
        if (historyRetryCount < MAX_HISTORY_RETRIES) {
          currentTimer = setTimeout(requestHistoryData, 100);
        } else {
          console.warn('[Frontend] Failed to load history data: bridge not available after', MAX_HISTORY_RETRIES, 'retries');
        }
      }
    };

    currentTimer = setTimeout(requestHistoryData, 50);

    return () => {
      if (currentTimer) {
        clearTimeout(currentTimer);
      }
    };
  }, [currentView, currentProvider]); // 添加 currentProvider 依赖，provider 切换时自动刷新历史记录

  // 监听滚动事件，检测用户是否在底部
  // 原理：如果用户向上滚动查看历史，就标记为"不在底部"，不再自动滚动
  // 依赖 currentView 是因为视图切换时容器会重新挂载，需要重新绑定监听器
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 🔧 如果正在自动滚动，跳过判断（防止快速流式输出时误判）
      if (isAutoScrollingRef.current) return;
      // 计算距离底部的距离
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      // 如果距离底部小于 100 像素，认为用户在底部
      isUserAtBottomRef.current = distanceFromBottom < 100;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentView]);

  const scrollToBottom = useCallback(() => {
    const endElement = messagesEndRef.current;
    if (endElement) {
      isAutoScrollingRef.current = true;
      try {
        endElement.scrollIntoView({ block: 'end', behavior: 'auto' });
      } catch {
        endElement.scrollIntoView(false);
      }
      requestAnimationFrame(() => {
        isAutoScrollingRef.current = false;
      });
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    isAutoScrollingRef.current = true;
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }, []);

  // 🔧 自动滚动：用户在底部时，跟随最新内容（包括流式/展开思考块/加载指示器等导致的高度变化）
  useLayoutEffect(() => {
    if (currentView !== 'chat') return;
    if (!isUserAtBottomRef.current) return;
    scrollToBottom();
  }, [currentView, messages, expandedThinking, loading, streamingActive, scrollToBottom]);

  // 切换回聊天视图时，自动滚动到底部
  useEffect(() => {
    if (currentView === 'chat') {
      // 使用 setTimeout 确保视图完全渲染后再滚动
      const timer = setTimeout(() => {
        scrollToBottom();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentView, scrollToBottom]);

  // 双击 ESC 快捷键打开回滚弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // 如果有其他弹窗打开，不处理双击 ESC
      if (permissionDialogOpen || askUserQuestionDialogOpen || isRewindDialogOpen || isRewindSelectDialogOpen) {
        return;
      }

      // 只在 claude provider 且有消息时才触发
      if (currentProvider !== 'claude' || messages.length === 0) {
        return;
      }

      const now = Date.now();
      const timeSinceLastEsc = now - lastEscPressTimeRef.current;

      // 如果两次 ESC 间隔小于 400ms，触发回滚弹窗
      if (timeSinceLastEsc < 400) {
        e.preventDefault();
        openRewindSelectDialog();
        lastEscPressTimeRef.current = 0; // 重置，避免连续触发
      } else {
        lastEscPressTimeRef.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProvider, messages.length, permissionDialogOpen, askUserQuestionDialogOpen, isRewindDialogOpen, isRewindSelectDialogOpen, openRewindSelectDialog]);

  const toggleThinking = (messageIndex: number, blockIndex: number) => {
    const key = `${messageIndex}_${blockIndex}`;
    setExpandedThinking((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Claude 流式：思考块在输出中自动展开，输出结束自动折叠（见 onStreamEnd）
  useEffect(() => {
    if (currentProvider !== 'claude') return;
    if (!streamingActive) return;

    let lastAssistantIdx = -1;
    for (let i = mergedMessages.length - 1; i >= 0; i -= 1) {
      if (mergedMessages[i]?.type === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx < 0) return;

    const blocks = getContentBlocks(mergedMessages[lastAssistantIdx]);
    if (!Array.isArray(blocks) || blocks.length === 0) return;

    const keysToOpen: string[] = [];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      if (blocks[blockIndex]?.type === 'thinking') {
        keysToOpen.push(`${lastAssistantIdx}_${blockIndex}`);
      }
    }
    if (keysToOpen.length === 0) return;

    setExpandedThinking((prevExpanded) => {
      let changed = false;
      const next = { ...prevExpanded };
      for (const key of keysToOpen) {
        if (!next[key]) {
          next[key] = true;
          autoExpandedThinkingKeysRef.current.add(key);
          changed = true;
        }
      }
      return changed ? next : prevExpanded;
    });
  }, [currentProvider, mergedMessages, streamingActive]);

  return (
    <>
      <style>{`
        .version-tag {
          position: absolute;
          top: -2px;
          left: 100%;
          margin-left: 10px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.5);
          color: #ddd6fe;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.15);
          backdrop-filter: blur(4px);
          z-index: 10;
        }
        
        [data-theme="light"] .version-tag {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: #6d28d9;
          box-shadow: none;
          backdrop-filter: none;
        }
      `}</style>
      <ToastContainer messages={toasts} onDismiss={dismissToast} />
      {currentView !== 'settings' && (
        <div className="header">
          <div className="header-left">
            {currentView === 'history' ? (
              <button className="back-button" onClick={() => setCurrentView('chat')} data-tooltip={'Back'}>
                <BackIcon /> {'Back'}
              </button>
            ) : (
              <div
                className="session-title"
                style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  paddingLeft: '8px',
                }}
              >
                {sessionTitle}
              </div>
            )}
          </div>
          <div className="header-right">
            {currentView === 'chat' && (
              <>
                <button className="icon-button" onClick={createNewSession} data-tooltip={'New Session'}>
                  <span className="codicon codicon-plus" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => sendBridgeEvent('create_new_tab')}
                  data-tooltip={'New Tab'}
                >
                  <span className="codicon codicon-split-horizontal" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setCurrentView('history')}
                  data-tooltip={'History'}
                >
                  <span className="codicon codicon-history" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => {
                    setSettingsInitialTab(undefined);
                    setCurrentView('settings');
                  }}
                  data-tooltip={'Settings'}
                >
                  <span className="codicon codicon-settings-gear" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {currentView === 'settings' ? (
        <SettingsView
          onClose={() => setCurrentView('chat')}
          initialTab={settingsInitialTab}
          currentProvider={currentProvider}
          streamingEnabled={streamingEnabledSetting}
          onStreamingEnabledChange={handleStreamingEnabledChange}
          sendShortcut={sendShortcut}
          onSendShortcutChange={handleSendShortcutChange}
        />
      ) : currentView === 'chat' ? (
        <>
          <div className="messages-container" ref={messagesContainerRef}>
          {messages.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#555',
                gap: '16px',
              }}
            >
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <BlinkingLogo provider={currentProvider} onProviderChange={handleProviderSelect} />
                <span className="version-tag">
                  v{APP_VERSION}
                </span>
              </div>
              <div>
                <AnimatedText text={'Send message to Claude Code'} />
              </div>
            </div>
          )}

          {mergedMessages.map((message, messageIndex) => (
            <MessageItem
              key={messageIndex}
              message={message}
              messageIndex={messageIndex}
              mergedMessagesLength={mergedMessages.length}
              streamingActive={streamingActive}
              isThinking={isThinking}
              expandedThinking={expandedThinking}
              onToggleThinking={toggleThinking}
              findToolResult={findToolResult}
            />
          ))}

          {/* Thinking indicator */}
          {/* {isThinking && !hasThinkingBlockInLastMessage && (
            <div className="message assistant">
              <div className="thinking-status">
                <span className="thinking-status-icon">🤔</span>
                <span className="thinking-status-text">{'Thinking'}</span>
              </div>
            </div>
          )} */}

          {/* Loading indicator */}
          {loading && <WaitingIndicator startTime={loadingStartTime ?? undefined} />}
          <div ref={messagesEndRef} />
        </div>

        {/* 滚动控制按钮 */}
        <ScrollControl containerRef={messagesContainerRef} inputAreaRef={inputAreaRef} />
      </>
      ) : (
        <HistoryView
          historyData={historyData}
          onLoadSession={loadHistorySession}
          onDeleteSession={deleteHistorySession}
          onExportSession={exportHistorySession}
          onToggleFavorite={toggleFavoriteSession}
          onUpdateTitle={updateHistoryTitle}
        />
      )}

      {currentView === 'chat' && (
        <div className="input-area" ref={inputAreaRef}>
          <ChatInputBox
            isLoading={loading}
            selectedModel={selectedModel}
            permissionMode={permissionMode}
            currentProvider={currentProvider}
            usagePercentage={usagePercentage}
            usageUsedTokens={usageUsedTokens}
            usageMaxTokens={usageMaxTokens}
            showUsage={true}
            alwaysThinkingEnabled={activeProviderConfig?.settingsConfig?.alwaysThinkingEnabled ?? claudeSettingsAlwaysThinkingEnabled}
            placeholder={'@reference files, shift + enter for new line'}
            sdkInstalled={currentSdkInstalled}
            sdkStatusLoading={!sdkStatusLoaded}
            onInstallSdk={() => {
              setSettingsInitialTab('dependencies');
              setCurrentView('settings');
            }}
            value={draftInput}
            onInput={setDraftInput}
            onSubmit={handleSubmit}
            onStop={interruptSession}
            onModeSelect={handleModeSelect}
            onModelSelect={handleModelSelect}
            onProviderSelect={handleProviderSelect}
            onToggleThinking={handleToggleThinking}
            streamingEnabled={streamingEnabledSetting}
            onStreamingEnabledChange={handleStreamingEnabledChange}
            sendShortcut={sendShortcut}
            selectedAgent={selectedAgent}
            onAgentSelect={handleAgentSelect}
            activeFile={contextInfo?.file}
            selectedLines={contextInfo?.startLine !== undefined && contextInfo?.endLine !== undefined
              ? (contextInfo.startLine === contextInfo.endLine
                  ? `L${contextInfo.startLine}`
                  : `L${contextInfo.startLine}-${contextInfo.endLine}`)
              : undefined}
            onClearContext={() => setContextInfo(null)}
            onOpenAgentSettings={() => {
              setSettingsInitialTab('agents');
              setCurrentView('settings');
            }}
            hasMessages={messages.length > 0}
            onRewind={openRewindSelectDialog}
            addToast={addToast}
          />
        </div>
      )}

      <div id="image-preview-root" />

      <ConfirmDialog
        isOpen={showNewSessionConfirm}
        title={'Create New Session'}
        message={'Current session has messages. Are you sure you want to create a new session?'}
        confirmText={'Confirm'}
        cancelText={'Cancel'}
        onConfirm={handleConfirmNewSession}
        onCancel={handleCancelNewSession}
      />

      <ConfirmDialog
        isOpen={showInterruptConfirm}
        title={'Create New Session'}
        message={'A conversation is in progress. Creating a new session will interrupt it. Continue?'}
        confirmText={'Confirm'}
        cancelText={'Cancel'}
        onConfirm={handleConfirmInterrupt}
        onCancel={handleCancelInterrupt}
      />

      <PermissionDialog
        isOpen={permissionDialogOpen}
        request={currentPermissionRequest}
        onApprove={handlePermissionApprove}
        onSkip={handlePermissionSkip}
        onApproveAlways={handlePermissionApproveAlways}
      />

      <AskUserQuestionDialog
        isOpen={askUserQuestionDialogOpen}
        request={currentAskUserQuestionRequest}
        onSubmit={handleAskUserQuestionSubmit}
        onCancel={handleAskUserQuestionCancel}
      />

      <RewindSelectDialog
        isOpen={isRewindSelectDialogOpen}
        rewindableMessages={rewindableMessages}
        onSelect={handleRewindSelect}
        onCancel={handleRewindSelectCancel}
      />

      <RewindDialog
        isOpen={isRewindDialogOpen}
        request={currentRewindRequest}
        isLoading={isRewinding}
        onConfirm={handleRewindConfirm}
        onCancel={handleRewindCancel}
      />
    </>
  );
};

export default App;
