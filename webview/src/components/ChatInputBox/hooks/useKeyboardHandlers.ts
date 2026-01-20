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

/**
 * useKeyboardHandlers - Extract keyboard handling logic from ChatInputBox
 * Handles:
 * - Mac-style cursor movement (Cmd+Arrow keys)
 * - Enter/Shift+Enter for submit/newline
 * - Completion menu keyboard navigation
 * - Native event listeners for JCEF/IME compatibility
 */
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

  /**
   * Handle Mac-style cursor movement, text selection, and delete operations
   */
  const handleMacCursorMovement = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editableRef.current) return false;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const isShift = e.shiftKey;

    // Cmd + Backspace: Delete from cursor to line start
    if (e.key === 'Backspace' && e.metaKey) {
      e.preventDefault();

      const node = range.startContainer;
      const offset = range.startOffset;

      // If there's selected content, use execCommand to delete (supports undo)
      if (!range.collapsed) {
        document.execCommand('delete', false);
        handleInput();
        return true;
      }

      // No selection, select from cursor to line start, then delete
      let lineStartOffset = 0;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        // Search backward for newline
        for (let i = offset - 1; i >= 0; i--) {
          if (text[i] === '\n') {
            lineStartOffset = i + 1;
            break;
          }
        }
      }

      // If cursor is already at line start, do nothing
      if (lineStartOffset === offset) {
        return true;
      }

      // Select from line start to cursor
      const newRange = document.createRange();
      newRange.setStart(node, lineStartOffset);
      newRange.setEnd(node, offset);
      selection.removeAllRanges();
      selection.addRange(newRange);

      // Delete selection (supports undo)
      document.execCommand('delete', false);

      handleInput();
      return true;
    }

    // Cmd + Left Arrow: Move to line start (or select to line start)
    if (e.key === 'ArrowLeft' && e.metaKey) {
      e.preventDefault();

      const node = range.startContainer;
      const offset = range.startOffset;

      // Find line start
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
        // Shift: Select to line start
        newRange.setEnd(range.endContainer, range.endOffset);
      } else {
        // No Shift: Move cursor to line start
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    // Cmd + Right Arrow: Move to line end (or select to line end)
    if (e.key === 'ArrowRight' && e.metaKey) {
      e.preventDefault();

      const node = range.endContainer;
      const offset = range.endOffset;

      // Find line end
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
        // Shift: Select to line end
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.setEnd(node, lineEndOffset);
      } else {
        // No Shift: Move cursor to line end
        newRange.setStart(node, lineEndOffset);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    // Cmd + Up Arrow: Move to text start (or select to start)
    if (e.key === 'ArrowUp' && e.metaKey) {
      e.preventDefault();

      const firstNode = editableRef.current.firstChild || editableRef.current;
      const newRange = document.createRange();

      if (isShift) {
        // Shift: Select to start
        newRange.setStart(firstNode, 0);
        newRange.setEnd(range.endContainer, range.endOffset);
      } else {
        // No Shift: Move cursor to start
        newRange.setStart(firstNode, 0);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    // Cmd + Down Arrow: Move to text end (or select to end)
    if (e.key === 'ArrowDown' && e.metaKey) {
      e.preventDefault();

      const lastNode = editableRef.current.lastChild || editableRef.current;
      const lastOffset = lastNode.nodeType === Node.TEXT_NODE
        ? (lastNode.textContent?.length || 0)
        : lastNode.childNodes.length;

      const newRange = document.createRange();

      if (isShift) {
        // Shift: Select to end
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.setEnd(lastNode, lastOffset);
      } else {
        // No Shift: Move cursor to end
        newRange.setStart(lastNode, lastOffset);
        newRange.collapse(true);
      }

      selection.removeAllRanges();
      selection.addRange(newRange);
      return true;
    }

    return false;
  }, [editableRef, handleInput]);

  /**
   * Handle keyboard events (React event handler)
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Track Shift key state for Shift+Enter newline handling in beforeinput
    shiftKeyPressedRef.current = e.shiftKey;

    // Detect IME composition state
    // keyCode 229 is the special code during IME input
    const isIMEComposing = isComposing || e.nativeEvent.isComposing;

    const isEnterKey =
      e.key === 'Enter' ||
      (e as unknown as { keyCode?: number }).keyCode === 13 ||
      (e.nativeEvent as unknown as { keyCode?: number }).keyCode === 13 ||
      (e as unknown as { which?: number }).which === 13;

    // Handle Mac-style cursor movement and text selection first
    if (handleMacCursorMovement(e)) {
      return;
    }

    // Allow other cursor movement shortcuts (Home/End/Ctrl+A/Ctrl+E)
    const isCursorMovementKey =
      e.key === 'Home' ||
      e.key === 'End' ||
      ((e.key === 'a' || e.key === 'A') && e.ctrlKey && !e.metaKey) ||
      ((e.key === 'e' || e.key === 'E') && e.ctrlKey && !e.metaKey);

    if (isCursorMovementKey) {
      // Allow default cursor movement behavior
      return;
    }

    // Handle completion menu keyboard events first
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

    // Check if composition just ended (prevent IME confirmation triggering send)
    const isRecentlyComposing = Date.now() - lastCompositionEndTimeRef.current < 100;

    // Determine send behavior based on sendShortcut setting
    // sendShortcut === 'enter': Enter sends, Shift+Enter creates newline
    // sendShortcut === 'cmdEnter': Cmd/Ctrl+Enter sends, Enter creates newline
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

    // For cmdEnter mode, allow normal Enter to create newline (default behavior)
    // For enter mode, Shift+Enter creates newline (default behavior)
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

  /**
   * Handle key up events (React event handler)
   */
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
      // If just selected item in completion menu, don't send
      if (completionSelectedRef.current) {
        completionSelectedRef.current = false;
        return;
      }
      if (submittedOnEnterRef.current) {
        submittedOnEnterRef.current = false;
        return;
      }
      // Don't handle send in keyup, let keydown handle it
    }
  }, [sendShortcut]);

  // Native event listeners for JCEF/IME compatibility
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;

    const nativeKeyDown = (ev: KeyboardEvent) => {
      // Track Shift key state
      shiftKeyPressedRef.current = ev.shiftKey;

      // Detect IME input: keyCode 229 means IME is processing
      const isIMEProcessing = (ev as unknown as { keyCode?: number }).keyCode === 229 || ev.isComposing;
      if (isIMEProcessing) {
        isComposingRef.current = true;
      }

      const isEnterKey =
        ev.key === 'Enter' ||
        (ev as unknown as { keyCode?: number }).keyCode === 13 ||
        (ev as unknown as { which?: number }).which === 13;

      // Mac-style shortcuts (already handled in React events)
      const isMacCursorMovementOrDelete =
        (ev.key === 'ArrowLeft' && ev.metaKey) ||
        (ev.key === 'ArrowRight' && ev.metaKey) ||
        (ev.key === 'ArrowUp' && ev.metaKey) ||
        (ev.key === 'ArrowDown' && ev.metaKey) ||
        (ev.key === 'Backspace' && ev.metaKey);

      if (isMacCursorMovementOrDelete) {
        return;
      }

      // Allow cursor movement shortcuts
      const isCursorMovementKey =
        ev.key === 'Home' ||
        ev.key === 'End' ||
        ((ev.key === 'a' || ev.key === 'A') && ev.ctrlKey && !ev.metaKey) ||
        ((ev.key === 'e' || ev.key === 'E') && ev.ctrlKey && !ev.metaKey);

      if (isCursorMovementKey) {
        return;
      }

      // Skip if completion menu is open (React handler handles it)
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
        // For cmdEnter mode, allow normal Enter to create newline
        if (sendShortcut === 'cmdEnter') {
          return;
        }

        // For enter mode: Shift+Enter should insert newline
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
