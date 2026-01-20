import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatInputBoxProps, CommandItem, FileItem, PermissionMode, Attachment } from './types';
import { ButtonArea } from './ButtonArea';
import { AttachmentList } from './AttachmentList';
import { ContextBar } from './ContextBar';
import { CompletionDropdown } from './Dropdown';
import { useCompletionDropdown, useTriggerDetection, useKeyboardHandlers, useAttachmentManagement, useFileTagRendering, useTooltip } from './hooks';
import {
  commandToDropdownItem,
  fileReferenceProvider,
  fileToDropdownItem,
  slashCommandProvider,
  agentProvider,
  agentToDropdownItem,
  type AgentItem,
} from './providers';
import './styles.css';

// Debounce utility function
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * ChatInputBox - 聊天输入框组件
 * 使用 contenteditable div 实现，支持自动高度调整、IME 处理、@ 文件引用、/ 斜杠命令
 */
export const ChatInputBox = ({
  isLoading = false,
  selectedModel = 'claude-sonnet-4-5',
  permissionMode = 'default',
  currentProvider = 'claude',
  usagePercentage = 0,
  usageUsedTokens,
  usageMaxTokens,
  showUsage = true,
  attachments: externalAttachments,
  placeholder: placeholderProp,
  disabled = false,
  value,
  onSubmit,
  onStop,
  onInput,
  onAddAttachment,
  onRemoveAttachment,
  onModeSelect,
  onModelSelect,
  onProviderSelect,
  activeFile,
  selectedLines,
  onClearContext,
  alwaysThinkingEnabled,
  onToggleThinking,
  streamingEnabled,
  onStreamingEnabledChange,
  sendShortcut = 'enter',
  selectedAgent,
  onAgentSelect,
  onOpenAgentSettings,
  hasMessages,
  onRewind,
  sdkInstalled = true, // 默认为 true，避免初始状态时禁用输入框
  sdkStatusLoading = false, // SDK 状态是否正在加载
  onInstallSdk,
  addToast,
}: ChatInputBoxProps) => {
  const placeholder = placeholderProp ?? '@reference files, shift + enter for new line';

  // Internal attachments state (if not provided externally)
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const attachments = externalAttachments ?? internalAttachments;

  // 输入框引用和状态
  const containerRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const justRenderedTagRef = useRef(false); // 标记是否刚刚渲染了文件标签
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false); // 同步的 IME 状态 ref，比 React state 更快响应
  const [hasContent, setHasContent] = useState(false);
  const compositionTimeoutRef = useRef<number | null>(null);
  const lastCompositionEndTimeRef = useRef<number>(0);

  // Ref for completion close functions (set after completion hooks are created)
  const closeCompletionsRef = useRef<{ file: () => void; command: () => void } | null>(null);

  // 触发检测 Hook
  const { detectTrigger, getTriggerPosition, getCursorPosition } = useTriggerDetection();

  /**
   * 获取输入框纯文本内容（优化版，带缓存）
   * 保留用户输入的原始格式，包括换行符和空白字符
   */
  const getTextContent = useCallback(() => {
    if (!editableRef.current) return '';

    // 从 DOM 中提取纯文本，包括文件标签的原始引用格式
    let text = '';

    // 使用递归遍历，但遇到 file-tag 时只读取 data-file-path 并不再深入
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();

        // 处理换行元素
        if (tagName === 'br') {
          text += '\n';
        } else if (tagName === 'div' || tagName === 'p') {
          // div 和 p 元素前添加换行（如果不是第一个元素）
          if (text.length > 0 && !text.endsWith('\n')) {
            text += '\n';
          }
          node.childNodes.forEach(walk);
        } else if (element.classList.contains('file-tag')) {
          const filePath = element.getAttribute('data-file-path') || '';
          text += `@${filePath}`;
          // 不遍历 file-tag 的子节点，避免重复读取文件名和关闭按钮文本
        } else {
          // 继续遍历子节点
          node.childNodes.forEach(walk);
        }
      }
    };

    editableRef.current.childNodes.forEach(walk);

    // 只移除 JCEF 环境可能添加的末尾单个换行符（不影响用户输入的换行）
    // 如果末尾有多个换行，只移除最后一个（JCEF 添加的）
    if (text.endsWith('\n') && editableRef.current.childNodes.length > 0) {
      const lastChild = editableRef.current.lastChild;
      // 只有当最后一个节点不是 br 标签时，才移除末尾换行（说明是 JCEF 添加的）
      if (lastChild?.nodeType !== Node.ELEMENT_NODE ||
          (lastChild as HTMLElement).tagName?.toLowerCase() !== 'br') {
        text = text.slice(0, -1);
      }
    }

    return text;
  }, []);

  // File tag rendering hook
  const {
    pathMappingRef,
    renderFileTags,
    handleKeyDownForTagRendering,
  } = useFileTagRendering({
    editableRef,
    getTextContent,
    getCursorPosition,
    closeCompletionsRef,
    justRenderedTagRef,
  });

  // 文件引用补全 Hook
  const fileCompletion = useCompletionDropdown<FileItem>({
    trigger: '@',
    provider: fileReferenceProvider,
    toDropdownItem: fileToDropdownItem,
    onSelect: (file, query) => {
      if (!editableRef.current || !query) return;

      const text = getTextContent();
      // 优先使用绝对路径，如果没有则使用相对路径
      const path = file.absolutePath || file.path;
      // 文件夹不加空格（方便继续输入路径），文件加空格
      const replacement = file.type === 'directory' ? `@${path}` : `@${path} `;
      const newText = fileCompletion.replaceText(text, replacement, query);

      // 记录路径映射：文件名 -> 完整路径，用于 tooltip 显示
      if (file.absolutePath) {
        // 记录多个可能的 key：文件名、相对路径、绝对路径
        pathMappingRef.current.set(file.name, file.absolutePath);
        pathMappingRef.current.set(file.path, file.absolutePath);
        pathMappingRef.current.set(file.absolutePath, file.absolutePath);
      }

      // 更新输入框内容
      editableRef.current.innerText = newText;

      // 设置光标到插入文本末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      handleInput();

      // 立即尝试渲染文件标签（不需要用户手动输入空格）
      // 使用 setTimeout 确保 DOM 更新和光标位置已就绪
      setTimeout(() => {
        renderFileTags();
      }, 0);
    },
  });

  // 斜杠命令补全 Hook
  const commandCompletion = useCompletionDropdown<CommandItem>({
    trigger: '/',
    provider: slashCommandProvider,
    toDropdownItem: commandToDropdownItem,
    onSelect: (command, query) => {
      if (!editableRef.current || !query) return;

      const text = getTextContent();
      const replacement = `${command.label} `;
      const newText = commandCompletion.replaceText(text, replacement, query);

      // 更新输入框内容
      editableRef.current.innerText = newText;

      // 设置光标到插入文本末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      handleInput();
    },
  });

  // 智能体选择补全 Hook (行首 # 触发)
  const agentCompletion = useCompletionDropdown<AgentItem>({
    trigger: '#',
    provider: agentProvider,
    toDropdownItem: agentToDropdownItem,
    onSelect: (agent, query) => {
      // 跳过加载中和空状态的特殊项
      if (agent.id === '__loading__' || agent.id === '__empty__' || agent.id === '__empty_state__') return;

      // 处理创建智能体
      if (agent.id === '__create_new__') {
        onOpenAgentSettings?.();
        // 清除输入框中的 # 触发文本
        if (editableRef.current && query) {
          const text = getTextContent();
          const newText = agentCompletion.replaceText(text, '', query);
          editableRef.current.innerText = newText;
          
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
          
          handleInput();
        }
        return;
      }

      // 选择智能体：不插入文本，而是调用 onAgentSelect 回调
      onAgentSelect?.({ id: agent.id, name: agent.name, prompt: agent.prompt });

      // 清除输入框中的 # 触发文本
      if (editableRef.current && query) {
        const text = getTextContent();
        const newText = agentCompletion.replaceText(text, '', query);
        editableRef.current.innerText = newText;

        // 设置光标位置
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        handleInput();
      }
    },
  });

  // Set close completions ref after hooks are created
  closeCompletionsRef.current = {
    file: fileCompletion.close,
    command: commandCompletion.close,
  };

  // Tooltip hook
  const { tooltip, handleMouseOver, handleMouseLeave } = useTooltip();

  /**
   * 清空输入框
   */
  const clearInput = useCallback(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
      editableRef.current.style.height = 'auto';
      setHasContent(false);
      // Notify parent component that input is cleared
      onInput?.('');
    }
  }, [onInput]);

  /**
   * 调整输入框高度
   * 改动说明：不再手动计算和限制高度，而是让 contenteditable 元素自然撑开（height: auto），
   * 并由外层容器 (.input-editable-wrapper) 通过 max-height 和 overflow-y 来控制滚动。
   * 这样可以避免"外层容器滚动 + 内层元素滚动"导致的双滚动条问题。
   */
  const adjustHeight = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;

    // 确保高度为自动，由内容撑开
    el.style.height = 'auto';
    // 隐藏内层滚动条，完全依赖外层容器滚动
    el.style.overflowY = 'hidden';
  }, []);

  /**
   * 检测并处理补全触发（优化：只在输入 @ 或 / 或 # 时才启动检测）
   */
  const detectAndTriggerCompletion = useCallback(() => {
    if (!editableRef.current) return;

    // 组合输入期间不进行补全检测，避免干扰 IME 上屏和下划线状态
    if (isComposing) {
      return;
    }

    // 如果刚刚渲染了文件标签,跳过这次补全检测
    if (justRenderedTagRef.current) {
      justRenderedTagRef.current = false;
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    const text = getTextContent();
    const cursorPos = getCursorPosition(editableRef.current);

    // 优化：快速检查文本中是否包含触发字符，如果没有则直接返回
    const hasAtSymbol = text.includes('@');
    const hasSlashSymbol = text.includes('/');
    const hasHashSymbol = text.includes('#');

    if (!hasAtSymbol && !hasSlashSymbol && !hasHashSymbol) {
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    // 传递 element 参数以便 detectTrigger 可以跳过文件标签
    const trigger = detectTrigger(text, cursorPos, editableRef.current);

    // 关闭当前打开的补全
    if (!trigger) {
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    // 获取触发位置
    const position = getTriggerPosition(editableRef.current, trigger.start);
    if (!position) return;

    // 根据触发符号打开对应的补全
    if (trigger.trigger === '@') {
      commandCompletion.close();
      agentCompletion.close();
      if (!fileCompletion.isOpen) {
        fileCompletion.open(position, trigger);
        fileCompletion.updateQuery(trigger);
      } else {
        fileCompletion.updateQuery(trigger);
      }
    } else if (trigger.trigger === '/') {
      fileCompletion.close();
      agentCompletion.close();
      if (!commandCompletion.isOpen) {
        commandCompletion.open(position, trigger);
        commandCompletion.updateQuery(trigger);
      } else {
        commandCompletion.updateQuery(trigger);
      }
    } else if (trigger.trigger === '#') {
      fileCompletion.close();
      commandCompletion.close();
      if (!agentCompletion.isOpen) {
        agentCompletion.open(position, trigger);
        agentCompletion.updateQuery(trigger);
      } else {
        agentCompletion.updateQuery(trigger);
      }
    }
  }, [
    getTextContent,
    getCursorPosition,
    detectTrigger,
    getTriggerPosition,
    fileCompletion,
    commandCompletion,
    agentCompletion,
    isComposing,
  ]);

  // 创建防抖版本的 detectAndTriggerCompletion（延迟 150ms）
  const debouncedDetectCompletion = useMemo(
    () => debounce(detectAndTriggerCompletion, 150),
    [detectAndTriggerCompletion]
  );

  /**
   * 处理输入事件（优化版：使用防抖减少性能开销）
   * @param isComposingFromEvent - 从原生事件中获取的 isComposing 状态（优先级更高）
   */
  const handleInput = useCallback((isComposingFromEvent?: boolean) => {
    // 使用多重检查确保正确检测 IME 状态：
    // 1. 原生事件的 isComposing（最准确，可在 compositionStart 之前检测）
    // 2. isComposingRef（同步的 ref，比 React state 更快）
    // 3. React state isComposing（作为后备）
    const isCurrentlyComposing = isComposingFromEvent ?? isComposingRef.current ?? isComposing;

    const text = getTextContent();
    // 移除零宽字符和其他不可见字符后再检查是否为空，确保在只剩零宽字符时能正确显示 placeholder
    const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    const isEmpty = !cleanText.trim();
    
    // setHasContent(!isEmpty); // 移到下方处理，避免 IME 干扰

    // 如果内容为空，清空 innerHTML 以确保 :empty 伪类生效（显示 placeholder）
    if (isEmpty && editableRef.current) {
      editableRef.current.innerHTML = '';
    }

    // 调整高度
    adjustHeight();

    // 组合输入期间不触发补全检测，待组合结束后统一处理
    // 同时也控制 hasContent 状态更新，避免在 IME 开始时(false->true)触发重渲染
    if (!isCurrentlyComposing) {
      debouncedDetectCompletion();
      setHasContent(!isEmpty);
    } else if (isEmpty) {
      setHasContent(false);
    }

    // 通知父组件
    // 如果判定为空（只有零宽字符），传递空字符串给父组件，防止父组件回传脏数据导致 DOM 重置从而隐藏 placeholder
    onInput?.(isEmpty ? '' : text);
  }, [getTextContent, adjustHeight, debouncedDetectCompletion, onInput, isComposing]);

  /**
   * 处理提交
   * 保留用户输入的原始格式（空格、换行、缩进等）
   */
  const handleSubmit = useCallback(() => {
    const content = getTextContent();
    // Remove zero-width spaces and other invisible characters
    const cleanContent = content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    if (sdkStatusLoading) {
      // SDK 状态加载中，不允许发送
      addToast?.('Checking SDK status...', 'info');
      return;
    }

    if (!sdkInstalled) {
      // 提示用户去下载依赖包
      addToast?.(`Claude Code SDK is not installed. Please install the SDK to start chatting. Go to Install`, 'warning');
      onInstallSdk?.();
      return;
    }

    // 只在判断是否为空时使用 trim，不修改实际发送的内容
    if (!cleanContent && attachments.length === 0) {
      return;
    }
    if (isLoading) {
      return;
    }

    // 关闭补全菜单
    fileCompletion.close();
    commandCompletion.close();
    agentCompletion.close();

    onSubmit?.(content, attachments.length > 0 ? attachments : undefined);

    // 清空输入框
    clearInput();

    // 如果使用内部附件状态，也清空附件
    if (externalAttachments === undefined) {
      setInternalAttachments([]);
    }
  }, [
    getTextContent,
    attachments,
    isLoading,
    onSubmit,
    clearInput,
    externalAttachments,
    fileCompletion,
    commandCompletion,
    agentCompletion,
    sdkStatusLoading,
    sdkInstalled,
    onInstallSdk,
    addToast,
    currentProvider,
  ]);

  // Keyboard handling hook (extracted from ChatInputBox)
  const {
    handleKeyDown,
    handleKeyUp,
    shiftKeyPressedRef,
    completionSelectedRef,
  } = useKeyboardHandlers({
    editableRef,
    isComposing,
    isComposingRef,
    lastCompositionEndTimeRef,
    fileCompletionIsOpen: fileCompletion.isOpen,
    commandCompletionIsOpen: commandCompletion.isOpen,
    agentCompletionIsOpen: agentCompletion.isOpen,
    fileCompletionHandleKeyDown: fileCompletion.handleKeyDown,
    commandCompletionHandleKeyDown: commandCompletion.handleKeyDown,
    agentCompletionHandleKeyDown: agentCompletion.handleKeyDown,
    handleSubmit,
    handleInput,
    sdkStatusLoading,
    sdkInstalled,
    sendShortcut,
  });

  // 受控模式：当外部 value 改变时更新输入框内容
  useEffect(() => {
    if (value === undefined) return;
    if (!editableRef.current) return;

    // 如果正在组合输入，不要更新 DOM，否则会打断 IME，导致重复输入（如 ni -> nni）
    if (isComposingRef.current) return;

    const currentText = getTextContent();
    // 仅当外部值与当前值不同时更新，避免光标跳动
    if (currentText !== value) {
      editableRef.current.innerText = value;
      setHasContent(!!value.trim());
      adjustHeight();

      // 将光标移到末尾
      if (value) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false); // false = 折叠到末尾
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [value, getTextContent, adjustHeight]);

  /**
   * 处理 IME 组合开始
   */
  const handleCompositionStart = useCallback(() => {
    // 清除之前的超时
    if (compositionTimeoutRef.current) {
      clearTimeout(compositionTimeoutRef.current);
      compositionTimeoutRef.current = null;
    }
    // 同时更新 ref 和 state，ref 是同步的，state 是异步的
    isComposingRef.current = true;
    setIsComposing(true);
  }, []);

  /**
   * 处理 IME 组合结束
   */
  const handleCompositionEnd = useCallback(() => {
    lastCompositionEndTimeRef.current = Date.now();
    // 同时更新 ref 和 state
    isComposingRef.current = false;
    setIsComposing(false);
    // 增加稍长的延迟以确保低性能环境下 DOM/IME 状态稳定
    compositionTimeoutRef.current = window.setTimeout(() => {
      isComposingRef.current = false;
      setIsComposing(false);
      compositionTimeoutRef.current = null;
      // 组合结束后，强制同步一次输入状态并触发文件标签渲染，清理可能残留的上屏字符/下划线
      handleInput();
      // 使用微小延迟确保 DOM 已更新
      setTimeout(() => {
        renderFileTags();
      }, 0);
    }, 40);
  }, [handleInput, renderFileTags]);

  // Attachment management hook
  const {
    handlePaste,
    handleDragOver,
    handleDrop,
    handleAddAttachment,
    handleRemoveAttachment,
  } = useAttachmentManagement({
    externalAttachments,
    onAddAttachment,
    onRemoveAttachment,
    pathMappingRef,
    editableRef,
    getTextContent,
    renderFileTags,
    handleInput,
    adjustHeight,
    onInput,
    fileCompletionClose: fileCompletion.close,
    commandCompletionClose: commandCompletion.close,
    setInternalAttachments,
  });

  /**
   * 处理模式选择
   */
  const handleModeSelect = useCallback((mode: PermissionMode) => {
    onModeSelect?.(mode);
  }, [onModeSelect]);

  /**
   * 处理模型选择
   */
  const handleModelSelect = useCallback((modelId: string) => {
    onModelSelect?.(modelId);
  }, [onModelSelect]);

  /**
   * 聚焦输入框
   */
  const focusInput = useCallback(() => {
    editableRef.current?.focus();
  }, []);

  // 初始化时聚焦和注册全局函数
  useEffect(() => {
    // 注册全局函数以接收 Java 传递的文件路径
    (window as any).handleFilePathFromJava = (filePath: string) => {
      if (!editableRef.current) return;

      // 提取文件路径并添加到路径映射中
      const absolutePath = filePath.trim();
      const fileName = absolutePath.split(/[/\\]/).pop() || absolutePath;

      // 将路径添加到 pathMappingRef，使其成为"有效引用"
      pathMappingRef.current.set(fileName, absolutePath);
      pathMappingRef.current.set(absolutePath, absolutePath);

      // 插入文件路径到输入框（自动添加 @ 前缀），并添加空格以触发渲染
      const pathToInsert = (filePath.startsWith('@') ? filePath : `@${filePath}`) + ' ';

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current.contains(selection.anchorNode)) {
        // 光标在输入框内，在光标位置插入
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(pathToInsert);
        range.insertNode(textNode);

        // 将光标移到插入文本后
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // 光标不在输入框内，追加到末尾
        // 使用 appendChild 而不是 innerText，避免破坏已有的文件标签
        const textNode = document.createTextNode(pathToInsert);
        editableRef.current.appendChild(textNode);

        // 将光标移到末尾
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      // 关闭补全菜单
      fileCompletion.close();
      commandCompletion.close();

      // 直接触发状态更新，不调用 handleInput（避免重新检测补全）
      const newText = getTextContent();
      setHasContent(!!newText.trim());
      adjustHeight();
      onInput?.(newText);

      // 立即渲染文件标签
      setTimeout(() => {
        renderFileTags();
      }, 50);
    };

    // 添加空格键监听以触发文件标签渲染
    const handleKeyDown = (e: KeyboardEvent) => {
      handleKeyDownForTagRendering(e);
    };

    if (editableRef.current) {
      editableRef.current.addEventListener('keydown', handleKeyDown);
    }

    focusInput();

    // 清理函数
    return () => {
      if (editableRef.current) {
        editableRef.current.removeEventListener('keydown', handleKeyDown);
      }
      delete (window as any).handleFilePathFromJava;
      delete (window as any).insertCodeSnippetAtCursor;
    };
  }, [focusInput, handlePaste, handleDrop, handleDragOver, getTextContent, handleKeyDownForTagRendering, renderFileTags, fileCompletion, commandCompletion, adjustHeight, onInput]);

  // 注册全局方法：在光标位置插入代码片段
  useEffect(() => {
    (window as any).insertCodeSnippetAtCursor = (selectionInfo: string) => {
      if (!editableRef.current) return;

      // 确保输入框有焦点
      editableRef.current.focus();

      // 在光标位置插入文本
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current.contains(selection.anchorNode)) {
        // 光标在输入框内，在光标位置插入
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(selectionInfo + ' ');
        range.insertNode(textNode);

        // 将光标移到插入文本后
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // 光标不在输入框内，追加到末尾
        const textNode = document.createTextNode(selectionInfo + ' ');
        editableRef.current.appendChild(textNode);

        // 将光标移到末尾
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      // 触发状态更新
      const newText = getTextContent();
      setHasContent(!!newText.trim());
      adjustHeight();
      onInput?.(newText);

      // 立即渲染文件标签
      setTimeout(() => {
        renderFileTags();
        // 渲染后重新聚焦
        editableRef.current?.focus();
      }, 50);
    };

    return () => {
      delete (window as any).insertCodeSnippetAtCursor;
    };
  }, [getTextContent, renderFileTags, adjustHeight, onInput]);

  return (
    <div className="chat-input-box" onClick={focusInput} ref={containerRef}>
      {/* 🔧 SDK 状态加载中或未安装时的提示条 */}
      {(sdkStatusLoading || !sdkInstalled) && (
        <div className={`sdk-warning-bar ${sdkStatusLoading ? 'sdk-loading' : ''}`}>
          <span className={`codicon ${sdkStatusLoading ? 'codicon-loading codicon-modifier-spin' : 'codicon-warning'}`} />
          <span className="sdk-warning-text">
            {sdkStatusLoading
              ? 'Checking SDK status...'
              : 'Claude Code SDK is not installed. Please install the SDK to start chatting.'}
          </span>
          {!sdkStatusLoading && (
            <button className="sdk-install-btn" onClick={(e) => {
              e.stopPropagation();
              onInstallSdk?.();
            }}>
              Go to Install
            </button>
          )}
        </div>
      )}

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />
      )}

      {/* 上下文展示条 (Top Control Bar) */}
      <ContextBar
        activeFile={activeFile}
        selectedLines={selectedLines}
        percentage={usagePercentage}
        usedTokens={usageUsedTokens}
        maxTokens={usageMaxTokens}
        showUsage={showUsage}
        onClearFile={onClearContext}
        onAddAttachment={handleAddAttachment}
        selectedAgent={selectedAgent}
        onClearAgent={() => onAgentSelect?.(null)}
        currentProvider={currentProvider}
        hasMessages={hasMessages}
        onRewind={onRewind}
      />

      {/* 输入区域 */}
      <div
        className="input-editable-wrapper"
        onMouseOver={handleMouseOver}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={editableRef}
          className="input-editable"
          contentEditable={!disabled}
          data-placeholder={placeholder}
          onInput={(e) => {
            // 传递原生事件的 isComposing 状态，这比 React 状态更准确
            // 可以正确捕获 compositionStart 之前的输入
            handleInput((e.nativeEvent as InputEvent).isComposing);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBeforeInput={(e) => {
            const inputType = (e.nativeEvent as unknown as { inputType?: string }).inputType;
            if (inputType === 'insertParagraph') {
              // For cmdEnter mode, allow normal Enter to insert newline
              if (sendShortcut === 'cmdEnter') {
                return;
              }
              // For enter mode: Shift+Enter should insert newline (allow default behavior)
              if (shiftKeyPressedRef.current) {
                return;
              }
              e.preventDefault();
              // 如果刚刚在补全菜单中用回车选择了项目，则不发送消息
              if (completionSelectedRef.current) {
                completionSelectedRef.current = false;
                return;
              }
              // 补全菜单打开时不发送消息
              if (fileCompletion.isOpen || commandCompletion.isOpen || agentCompletion.isOpen) {
                return;
              }
              // 只有在非加载状态且非输入法组合状态时才允许提交
              if (!isLoading && !isComposing) {
                handleSubmit();
              }
            }
            // 组合输入期间删除按键可能导致最后一个字残留，拦截并在下一周期强制同步
            if (
              (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') &&
              isComposing
            ) {
              // 让浏览器先执行默认删除，再在下一轮事件循环同步内容
              setTimeout(() => {
                handleInput();
              }, 0);
            }
          }}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          suppressContentEditableWarning
        />
      </div>

      {/* 底部按钮区域 */}
      <ButtonArea
        disabled={disabled || isLoading}
        hasInputContent={hasContent || attachments.length > 0}
        isLoading={isLoading}
        selectedModel={selectedModel}
        permissionMode={permissionMode}
        currentProvider={currentProvider}
        onSubmit={handleSubmit}
        onStop={onStop}
        onModeSelect={handleModeSelect}
        onModelSelect={handleModelSelect}
        onProviderSelect={onProviderSelect}
        alwaysThinkingEnabled={alwaysThinkingEnabled}
        onToggleThinking={onToggleThinking}
        streamingEnabled={streamingEnabled}
        onStreamingEnabledChange={onStreamingEnabledChange}
        selectedAgent={selectedAgent}
        onAgentSelect={(agent) => onAgentSelect?.(agent)}
        onOpenAgentSettings={onOpenAgentSettings}
        onClearAgent={() => onAgentSelect?.(null)}
      />

      {/* @ 文件引用下拉菜单 */}
      <CompletionDropdown
        isVisible={fileCompletion.isOpen}
        position={fileCompletion.position}
        items={fileCompletion.items}
        selectedIndex={fileCompletion.activeIndex}
        loading={fileCompletion.loading}
        emptyText="No matching files"
        onClose={fileCompletion.close}
        onSelect={(_, index) => fileCompletion.selectIndex(index)}
        onMouseEnter={fileCompletion.handleMouseEnter}
      />

      {/* / 斜杠命令下拉菜单 */}
      <CompletionDropdown
        isVisible={commandCompletion.isOpen}
        position={commandCompletion.position}
        width={450}
        items={commandCompletion.items}
        selectedIndex={commandCompletion.activeIndex}
        loading={commandCompletion.loading}
        emptyText="No matching commands"
        onClose={commandCompletion.close}
        onSelect={(_, index) => commandCompletion.selectIndex(index)}
        onMouseEnter={commandCompletion.handleMouseEnter}
      />

      {/* # 智能体选择下拉菜单 */}
      <CompletionDropdown
        isVisible={agentCompletion.isOpen}
        position={agentCompletion.position}
        width={350}
        items={agentCompletion.items}
        selectedIndex={agentCompletion.activeIndex}
        loading={agentCompletion.loading}
        emptyText="No available agents"
        onClose={agentCompletion.close}
        onSelect={(_, index) => agentCompletion.selectIndex(index)}
        onMouseEnter={agentCompletion.handleMouseEnter}
      />

      {/* 悬浮提示 Tooltip (使用 Portal 或 Fixed 定位以突破 overflow 限制) */}
      {tooltip && tooltip.visible && (
        <div
          className={`tooltip-popup ${tooltip.isBar ? 'tooltip-bar' : ''}`}
          style={{
            top: `${tooltip.top}px`, // 直接使用计算好的 top，不再在这里减
            left: `${tooltip.left}px`,
            width: tooltip.width ? `${tooltip.width}px` : undefined,
            // @ts-ignore
            '--tooltip-tx': tooltip.tx || '-50%',
            // @ts-ignore
            '--arrow-left': tooltip.arrowLeft || '50%',
          }}
        >
          {tooltip.text}
        </div>
      )}

    </div>
  );
};

export default ChatInputBox;
