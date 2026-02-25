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

export const ChatInputBox = ({
  isLoading = false,
  selectedModel = 'claude-sonnet-4-6',
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
  sdkInstalled = true,
  sdkStatusLoading = false,
  onInstallSdk,
  authConfigured = true,
  authStatusLoading = false,
  onConfigureAuth,
  addToast,
}: ChatInputBoxProps) => {
  const placeholder = placeholderProp ?? '@reference files, shift + enter for new line';

  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const attachments = externalAttachments ?? internalAttachments;

  const containerRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const justRenderedTagRef = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);
  const compositionTimeoutRef = useRef<number | null>(null);
  const lastCompositionEndTimeRef = useRef<number>(0);

  const closeCompletionsRef = useRef<{ file: () => void; command: () => void } | null>(null);

  const { detectTrigger, getTriggerPosition, getCursorPosition } = useTriggerDetection();

  const getTextContent = useCallback(() => {
    if (!editableRef.current) return '';

    let text = '';

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();

        if (tagName === 'br') {
          text += '\n';
        } else if (tagName === 'div' || tagName === 'p') {
          if (text.length > 0 && !text.endsWith('\n')) {
            text += '\n';
          }
          node.childNodes.forEach(walk);
        } else if (element.classList.contains('file-tag')) {
          const filePath = element.getAttribute('data-file-path') || '';
          text += `@${filePath}`;
        } else {
          node.childNodes.forEach(walk);
        }
      }
    };

    editableRef.current.childNodes.forEach(walk);

    if (text.endsWith('\n') && editableRef.current.childNodes.length > 0) {
      const lastChild = editableRef.current.lastChild;
      if (lastChild?.nodeType !== Node.ELEMENT_NODE ||
          (lastChild as HTMLElement).tagName?.toLowerCase() !== 'br') {
        text = text.slice(0, -1);
      }
    }

    return text;
  }, []);

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

  const fileCompletion = useCompletionDropdown<FileItem>({
    trigger: '@',
    provider: fileReferenceProvider,
    toDropdownItem: fileToDropdownItem,
    onSelect: (file, query) => {
      if (!editableRef.current || !query) return;

      const text = getTextContent();
      const path = file.absolutePath || file.path;
      const replacement = file.type === 'directory' ? `@${path}` : `@${path} `;
      const newText = fileCompletion.replaceText(text, replacement, query);

      if (file.absolutePath) {
        pathMappingRef.current.set(file.name, file.absolutePath);
        pathMappingRef.current.set(file.path, file.absolutePath);
        pathMappingRef.current.set(file.absolutePath, file.absolutePath);
      }

      editableRef.current.innerText = newText;

      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      handleInput();

      setTimeout(() => {
        renderFileTags();
      }, 0);
    },
  });

  const commandCompletion = useCompletionDropdown<CommandItem>({
    trigger: '/',
    provider: slashCommandProvider,
    toDropdownItem: commandToDropdownItem,
    onSelect: (command, query) => {
      if (!editableRef.current || !query) return;

      const text = getTextContent();
      const replacement = `${command.label} `;
      const newText = commandCompletion.replaceText(text, replacement, query);

      editableRef.current.innerText = newText;

      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      handleInput();
    },
  });

  const agentCompletion = useCompletionDropdown<AgentItem>({
    trigger: '#',
    provider: agentProvider,
    toDropdownItem: agentToDropdownItem,
    onSelect: (agent, query) => {
      if (agent.id === '__loading__' || agent.id === '__empty__' || agent.id === '__empty_state__') return;

      if (agent.id === '__create_new__') {
        onOpenAgentSettings?.();
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

      onAgentSelect?.({ id: agent.id, name: agent.name, prompt: agent.prompt });

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
    },
  });

  closeCompletionsRef.current = {
    file: fileCompletion.close,
    command: commandCompletion.close,
  };

  const { tooltip, handleMouseOver, handleMouseLeave } = useTooltip();

  const clearInput = useCallback(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
      editableRef.current.style.height = 'auto';
      setHasContent(false);
      onInput?.('');
    }
  }, [onInput]);

  const adjustHeight = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
  }, []);

  const detectAndTriggerCompletion = useCallback(() => {
    if (!editableRef.current) return;

    if (isComposing) {
      return;
    }

    if (justRenderedTagRef.current) {
      justRenderedTagRef.current = false;
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    const text = getTextContent();
    const cursorPos = getCursorPosition(editableRef.current);

    const hasAtSymbol = text.includes('@');
    const hasSlashSymbol = text.includes('/');
    const hasHashSymbol = text.includes('#');

    if (!hasAtSymbol && !hasSlashSymbol && !hasHashSymbol) {
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    const trigger = detectTrigger(text, cursorPos, editableRef.current);

    if (!trigger) {
      fileCompletion.close();
      commandCompletion.close();
      agentCompletion.close();
      return;
    }

    const position = getTriggerPosition(editableRef.current, trigger.start);
    if (!position) return;

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

  const debouncedDetectCompletion = useMemo(
    () => debounce(detectAndTriggerCompletion, 150),
    [detectAndTriggerCompletion]
  );

  const handleInput = useCallback((isComposingFromEvent?: boolean) => {
    const isCurrentlyComposing = isComposingFromEvent ?? isComposingRef.current ?? isComposing;

    const text = getTextContent();
    const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    const isEmpty = !cleanText.trim();

    if (isEmpty && editableRef.current) {
      editableRef.current.innerHTML = '';
    }

    adjustHeight();

    if (!isCurrentlyComposing) {
      debouncedDetectCompletion();
      setHasContent(!isEmpty);
    } else if (isEmpty) {
      setHasContent(false);
    }

    onInput?.(isEmpty ? '' : text);
  }, [getTextContent, adjustHeight, debouncedDetectCompletion, onInput, isComposing]);

  const handleSubmit = useCallback(() => {
    const content = getTextContent();
    const cleanContent = content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    if (sdkStatusLoading) {
      addToast?.('Checking SDK status...', 'info');
      return;
    }

    if (!sdkInstalled) {
      addToast?.(`Claude Code SDK is not installed. Please install the SDK to start chatting. Go to Install`, 'warning');
      onInstallSdk?.();
      return;
    }

    if (!authConfigured) {
      addToast?.('Not authenticated. Run "claude login" in terminal or configure an API key.', 'warning');
      onConfigureAuth?.();
      return;
    }

    if (!cleanContent && attachments.length === 0) {
      return;
    }
    if (isLoading) {
      return;
    }

    fileCompletion.close();
    commandCompletion.close();
    agentCompletion.close();

    onSubmit?.(content, attachments.length > 0 ? attachments : undefined);

    clearInput();

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

  useEffect(() => {
    if (value === undefined) return;
    if (!editableRef.current) return;

    if (isComposingRef.current) return;

    const currentText = getTextContent();
    if (currentText !== value) {
      editableRef.current.innerText = value;
      setHasContent(!!value.trim());
      adjustHeight();

      if (value) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [value, getTextContent, adjustHeight]);

  const handleCompositionStart = useCallback(() => {
    if (compositionTimeoutRef.current) {
      clearTimeout(compositionTimeoutRef.current);
      compositionTimeoutRef.current = null;
    }
    isComposingRef.current = true;
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    lastCompositionEndTimeRef.current = Date.now();
    isComposingRef.current = false;
    setIsComposing(false);
    compositionTimeoutRef.current = window.setTimeout(() => {
      isComposingRef.current = false;
      setIsComposing(false);
      compositionTimeoutRef.current = null;
      handleInput();
      setTimeout(() => {
        renderFileTags();
      }, 0);
    }, 40);
  }, [handleInput, renderFileTags]);

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

  const handleModeSelect = useCallback((mode: PermissionMode) => {
    onModeSelect?.(mode);
  }, [onModeSelect]);

  const handleModelSelect = useCallback((modelId: string) => {
    onModelSelect?.(modelId);
  }, [onModelSelect]);

  const focusInput = useCallback(() => {
    editableRef.current?.focus();
  }, []);

  useEffect(() => {
    (window as any).handleFilePathFromJava = (filePath: string) => {
      if (!editableRef.current) return;

      const absolutePath = filePath.trim();
      const fileName = absolutePath.split(/[/\\]/).pop() || absolutePath;

      pathMappingRef.current.set(fileName, absolutePath);
      pathMappingRef.current.set(absolutePath, absolutePath);

      const pathToInsert = (filePath.startsWith('@') ? filePath : `@${filePath}`) + ' ';

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(pathToInsert);
        range.insertNode(textNode);

        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        const textNode = document.createTextNode(pathToInsert);
        editableRef.current.appendChild(textNode);

        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      fileCompletion.close();
      commandCompletion.close();

      const newText = getTextContent();
      setHasContent(!!newText.trim());
      adjustHeight();
      onInput?.(newText);

      setTimeout(() => {
        renderFileTags();
      }, 50);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      handleKeyDownForTagRendering(e);
    };

    if (editableRef.current) {
      editableRef.current.addEventListener('keydown', handleKeyDown);
    }

    focusInput();

    return () => {
      if (editableRef.current) {
        editableRef.current.removeEventListener('keydown', handleKeyDown);
      }
      delete (window as any).handleFilePathFromJava;
      delete (window as any).insertCodeSnippetAtCursor;
    };
  }, [focusInput, handlePaste, handleDrop, handleDragOver, getTextContent, handleKeyDownForTagRendering, renderFileTags, fileCompletion, commandCompletion, adjustHeight, onInput]);

  useEffect(() => {
    (window as any).insertCodeSnippetAtCursor = (selectionInfo: string) => {
      if (!editableRef.current) return;

      editableRef.current.focus();

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(selectionInfo + ' ');
        range.insertNode(textNode);

        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        const textNode = document.createTextNode(selectionInfo + ' ');
        editableRef.current.appendChild(textNode);

        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      const newText = getTextContent();
      setHasContent(!!newText.trim());
      adjustHeight();
      onInput?.(newText);

      setTimeout(() => {
        renderFileTags();
        editableRef.current?.focus();
      }, 50);
    };

    return () => {
      delete (window as any).insertCodeSnippetAtCursor;
    };
  }, [getTextContent, renderFileTags, adjustHeight, onInput]);

  return (
    <div className="chat-input-box" onClick={focusInput} ref={containerRef}>
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

      {sdkInstalled && !sdkStatusLoading && (authStatusLoading || !authConfigured) && (
        <div className={`sdk-warning-bar auth-warning-bar ${authStatusLoading ? 'sdk-loading' : ''}`}>
          <span className={`codicon ${authStatusLoading ? 'codicon-loading codicon-modifier-spin' : 'codicon-warning'}`} />
          <span className="sdk-warning-text">
            {authStatusLoading
              ? 'Checking authentication...'
              : 'Not authenticated. Run "claude login" in terminal or configure an API key.'}
          </span>
          {!authStatusLoading && (
            <button className="sdk-install-btn" onClick={(e) => {
              e.stopPropagation();
              onConfigureAuth?.();
            }}>
              Configure
            </button>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />
      )}

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
            handleInput((e.nativeEvent as InputEvent).isComposing);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBeforeInput={(e) => {
            const inputType = (e.nativeEvent as unknown as { inputType?: string }).inputType;
            if (inputType === 'insertParagraph') {
              if (sendShortcut === 'cmdEnter') {
                return;
              }
              if (shiftKeyPressedRef.current) {
                return;
              }
              e.preventDefault();
              if (completionSelectedRef.current) {
                completionSelectedRef.current = false;
                return;
              }
              if (fileCompletion.isOpen || commandCompletion.isOpen || agentCompletion.isOpen) {
                return;
              }
              if (!isLoading && !isComposing) {
                handleSubmit();
              }
            }
            if (
              (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') &&
              isComposing
            ) {
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

      {tooltip && tooltip.visible && (
        <div
          className={`tooltip-popup ${tooltip.isBar ? 'tooltip-bar' : ''}`}
          style={{
            top: `${tooltip.top}px`,
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
