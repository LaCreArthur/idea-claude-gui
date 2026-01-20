import { useCallback, useEffect, useRef } from 'react';

export interface KeyboardHandlersConfig {
  editableRef: React.RefObject<HTMLDivElement | null>;
  isComposing: boolean;
  isComposingRef: React.MutableRefObject<boolean>;
  lastCompositionEndTimeRef: React.MutableRefObject<number>;
  fileCompletionIsOpen: boolean;
  commandCompletionIsOpen: boolean;
  agentCompletionIsOpen: boolean;
  fileCompletionHandleKeyDown: (e: KeyboardEvent) => boolean;
  commandCompletionHandleKeyDown: (e: KeyboardEvent) => boolean;
  agentCompletionHandleKeyDown: (e: KeyboardEvent) => boolean;
  handleSubmit: () => void;
  handleInput: (isComposingFromEvent?: boolean) => void;
  sdkStatusLoading: boolean;
  sdkInstalled: boolean;
  sendShortcut: 'enter' | 'cmdEnter';
}

export interface KeyboardHandlersReturn {
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleKeyUp: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  shiftKeyPressedRef: React.MutableRefObject<boolean>;
  submittedOnEnterRef: React.MutableRefObject<boolean>;
  completionSelectedRef: React.MutableRefObject<boolean>;
}

export function useKeyboardHandlers({
  editableRef,
  isComposing,
  isComposingRef,
  lastCompositionEndTimeRef,
  fileCompletionIsOpen,
  commandCompletionIsOpen,
  agentCompletionIsOpen,
  fileCompletionHandleKeyDown,
  commandCompletionHandleKeyDown,
  agentCompletionHandleKeyDown,
  handleSubmit,
  handleInput,
  sdkStatusLoading,
  sdkInstalled,
  sendShortcut,
}: KeyboardHandlersConfig): KeyboardHandlersReturn {
  const shiftKeyPressedRef = useRef(false);
  const submittedOnEnterRef = useRef(false);
  const completionSelectedRef = useRef(false);

  const handleMacCursorMovement = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editableRef.current) return false;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const isShift = e.shiftKey;

    if (e.key === 'Backspace' && e.metaKey) {
      e.preventDefault();

      const node = range.startContainer;
      const offset = range.startOffset;

      if (!range.collapsed) {
        document.execCommand('delete', false);
        handleInput();
        return true;
      }

      let lineStartOffset = 0;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        for (let i = offset - 1; i >= 0; i--) {
          if (text[i] === '\n') {
            lineStartOffset = i + 1;
            break;
          }
        }
      }

      if (lineStartOffset === offset) {
        return true;
      }

      const newRange = document.createRange();
      newRange.setStart(node, lineStartOffset);
      newRange.setEnd(node, offset);
      selection.removeAllRanges();
      selection.addRange(newRange);

      document.execCommand('delete', false);

      handleInput();
      return true;
    }

    if (e.key === 'ArrowLeft' && e.metaKey) {
      e.preventDefault();

      const node = range.startContainer;
      const offset = range.startOffset;

      let lineStartOffset = 0;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        for (let i = offset - 1; i >= 0; i--) {
          if (text[i] === '\n') {
            lineStartOffset = i + 1;
            break;
          }
        }
      }

      const newRange = document.createRange();
      newRange.setStart(node, lineStartOffset);

      if (isShift) {
        newRange.setEnd(range.endContainer, range.endOffset);
      } else {
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    if (e.key === 'ArrowRight' && e.metaKey) {
      e.preventDefault();

      const node = range.endContainer;
      const offset = range.endOffset;

      let lineEndOffset = node.textContent?.length || 0;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        for (let i = offset; i < text.length; i++) {
          if (text[i] === '\n') {
            lineEndOffset = i;
            break;
          }
        }
      }

      const newRange = document.createRange();

      if (isShift) {
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.setEnd(node, lineEndOffset);
      } else {
        newRange.setStart(node, lineEndOffset);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    if (e.key === 'ArrowUp' && e.metaKey) {
      e.preventDefault();

      const firstNode = editableRef.current.firstChild || editableRef.current;
      const newRange = document.createRange();

      if (isShift) {
        newRange.setStart(firstNode, 0);
        newRange.setEnd(range.endContainer, range.endOffset);
      } else {
        newRange.setStart(firstNode, 0);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    if (e.key === 'ArrowDown' && e.metaKey) {
      e.preventDefault();

      const lastNode = editableRef.current.lastChild || editableRef.current;
      const lastOffset = lastNode.nodeType === Node.TEXT_NODE
        ? (lastNode.textContent?.length || 0)
        : lastNode.childNodes.length;

      const newRange = document.createRange();

      if (isShift) {
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.setEnd(lastNode, lastOffset);
      } else {
        newRange.setStart(lastNode, lastOffset);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    return false;
  }, [editableRef, handleInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    shiftKeyPressedRef.current = e.shiftKey;

    const isIMEComposing = isComposing || e.nativeEvent.isComposing;

    const isEnterKey =
      e.key === 'Enter' ||
      (e as unknown as { keyCode?: number }).keyCode === 13 ||
      (e.nativeEvent as unknown as { keyCode?: number }).keyCode === 13 ||
      (e as unknown as { which?: number }).which === 13;

    if (handleMacCursorMovement(e)) {
      return;
    }

    const isCursorMovementKey =
      e.key === 'Home' ||
      e.key === 'End' ||
      ((e.key === 'a' || e.key === 'A') && e.ctrlKey && !e.metaKey) ||
      ((e.key === 'e' || e.key === 'E') && e.ctrlKey && !e.metaKey);

    if (isCursorMovementKey) {
      return;
    }

    if (fileCompletionIsOpen) {
      const handled = fileCompletionHandleKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          completionSelectedRef.current = true;
        }
        return;
      }
    }

    if (commandCompletionIsOpen) {
      const handled = commandCompletionHandleKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          completionSelectedRef.current = true;
        }
        return;
      }
    }

    if (agentCompletionIsOpen) {
      const handled = agentCompletionHandleKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          completionSelectedRef.current = true;
        }
        return;
      }
    }

    const isRecentlyComposing = Date.now() - lastCompositionEndTimeRef.current < 100;

    const isSendKey = sendShortcut === 'cmdEnter'
      ? (isEnterKey && (e.metaKey || e.ctrlKey) && !isIMEComposing)
      : (isEnterKey && !e.shiftKey && !isIMEComposing && !isRecentlyComposing);

    if (isSendKey) {
      e.preventDefault();
      if (sdkStatusLoading || !sdkInstalled) {
        return;
      }
      submittedOnEnterRef.current = true;
      handleSubmit();
      return;
    }

    // Shift+Enter: insert line break explicitly (JCEF doesn't handle this automatically)
    if (isEnterKey && e.shiftKey && !isIMEComposing) {
      e.preventDefault();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const br = document.createElement('br');
        range.insertNode(br);
        // Move cursor after the <br>
        range.setStartAfter(br);
        range.setEndAfter(br);
        selection.removeAllRanges();
        selection.addRange(range);
        handleInput();
      }
      return;
    }

  }, [
    isComposing,
    handleSubmit,
    handleMacCursorMovement,
    fileCompletionIsOpen,
    commandCompletionIsOpen,
    agentCompletionIsOpen,
    fileCompletionHandleKeyDown,
    commandCompletionHandleKeyDown,
    agentCompletionHandleKeyDown,
    sdkStatusLoading,
    sdkInstalled,
    sendShortcut,
    lastCompositionEndTimeRef,
  ]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const isEnterKey =
      e.key === 'Enter' ||
      (e as unknown as { keyCode?: number }).keyCode === 13 ||
      (e.nativeEvent as unknown as { keyCode?: number }).keyCode === 13 ||
      (e as unknown as { which?: number }).which === 13;

    const isSendKey = sendShortcut === 'cmdEnter'
      ? (isEnterKey && (e.metaKey || e.ctrlKey))
      : (isEnterKey && !e.shiftKey);

    if (isSendKey) {
      e.preventDefault();
      if (completionSelectedRef.current) {
        completionSelectedRef.current = false;
        return;
      }
      if (submittedOnEnterRef.current) {
        submittedOnEnterRef.current = false;
        return;
      }
    }
  }, [sendShortcut]);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;

    const nativeKeyDown = (ev: KeyboardEvent) => {
      shiftKeyPressedRef.current = ev.shiftKey;

      const isIMEProcessing = (ev as unknown as { keyCode?: number }).keyCode === 229 || ev.isComposing;
      if (isIMEProcessing) {
        isComposingRef.current = true;
      }

      const isEnterKey =
        ev.key === 'Enter' ||
        (ev as unknown as { keyCode?: number }).keyCode === 13 ||
        (ev as unknown as { which?: number }).which === 13;

      const isMacCursorMovementOrDelete =
        (ev.key === 'ArrowLeft' && ev.metaKey) ||
        (ev.key === 'ArrowRight' && ev.metaKey) ||
        (ev.key === 'ArrowUp' && ev.metaKey) ||
        (ev.key === 'ArrowDown' && ev.metaKey) ||
        (ev.key === 'Backspace' && ev.metaKey);

      if (isMacCursorMovementOrDelete) {
        return;
      }

      const isCursorMovementKey =
        ev.key === 'Home' ||
        ev.key === 'End' ||
        ((ev.key === 'a' || ev.key === 'A') && ev.ctrlKey && !ev.metaKey) ||
        ((ev.key === 'e' || ev.key === 'E') && ev.ctrlKey && !ev.metaKey);

      if (isCursorMovementKey) {
        return;
      }

      if (fileCompletionIsOpen || commandCompletionIsOpen || agentCompletionIsOpen) {
        return;
      }

      const isRecentlyComposing = Date.now() - lastCompositionEndTimeRef.current < 100;

      const shift = ev.shiftKey === true;
      const metaOrCtrl = ev.metaKey || ev.ctrlKey;
      const isSendKey = sendShortcut === 'cmdEnter'
        ? (isEnterKey && metaOrCtrl && !isComposingRef.current && !isComposing)
        : (isEnterKey && !shift && !isComposingRef.current && !isComposing && !isRecentlyComposing);

      if (isSendKey) {
        ev.preventDefault();
        submittedOnEnterRef.current = true;
        handleSubmit();
        return;
      }

      // Shift+Enter: insert line break explicitly (JCEF doesn't handle this automatically)
      if (isEnterKey && shift && !isComposingRef.current && !isComposing) {
        ev.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement('br');
          range.insertNode(br);
          // Move cursor after the <br>
          range.setStartAfter(br);
          range.setEndAfter(br);
          selection.removeAllRanges();
          selection.addRange(range);
          handleInput();
        }
      }
    };

    const nativeKeyUp = (ev: KeyboardEvent) => {
      const isEnterKey =
        ev.key === 'Enter' ||
        (ev as unknown as { keyCode?: number }).keyCode === 13 ||
        (ev as unknown as { which?: number }).which === 13;
      const shift = ev.shiftKey === true;
      const metaOrCtrl = ev.metaKey || ev.ctrlKey;

      const isSendKey = sendShortcut === 'cmdEnter'
        ? (isEnterKey && metaOrCtrl)
        : (isEnterKey && !shift);

      if (isSendKey) {
        ev.preventDefault();
        if (completionSelectedRef.current) {
          completionSelectedRef.current = false;
          return;
        }
        if (submittedOnEnterRef.current) {
          submittedOnEnterRef.current = false;
          return;
        }
      }
    };

    const nativeBeforeInput = (ev: InputEvent) => {
      const type = ev.inputType;
      if (type === 'insertParagraph') {
        if (sendShortcut === 'cmdEnter') {
          return;
        }

        if (shiftKeyPressedRef.current) {
          return;
        }

        ev.preventDefault();
        if (completionSelectedRef.current) {
          completionSelectedRef.current = false;
          return;
        }
        if (fileCompletionIsOpen || commandCompletionIsOpen || agentCompletionIsOpen) {
          return;
        }
        handleSubmit();
      }
    };

    el.addEventListener('keydown', nativeKeyDown, { capture: true });
    el.addEventListener('keyup', nativeKeyUp, { capture: true });
    el.addEventListener('beforeinput', nativeBeforeInput as EventListener, { capture: true });

    return () => {
      el.removeEventListener('keydown', nativeKeyDown, { capture: true } as EventListenerOptions);
      el.removeEventListener('keyup', nativeKeyUp, { capture: true } as EventListenerOptions);
      el.removeEventListener('beforeinput', nativeBeforeInput as EventListener, { capture: true } as EventListenerOptions);
    };
  }, [
    editableRef,
    isComposing,
    isComposingRef,
    handleSubmit,
    fileCompletionIsOpen,
    commandCompletionIsOpen,
    agentCompletionIsOpen,
    sendShortcut,
    lastCompositionEndTimeRef,
  ]);

  return {
    handleKeyDown,
    handleKeyUp,
    shiftKeyPressedRef,
    submittedOnEnterRef,
    completionSelectedRef,
  };
}
