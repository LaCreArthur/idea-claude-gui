import { useCallback } from 'react';
import type { TriggerQuery, DropdownPosition } from '../types';

function textEndsWithNewline(text: string | null): boolean {
  return text !== null && text.length > 0 && text.endsWith('\n');
}

export function getRectAtCharOffset(
  element: HTMLElement,
  charOffset: number
): DOMRect | null {
  let position = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;
  let endsWithNewline = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const len = text.length;
      if (position + len >= charOffset) {
        targetNode = node;
        targetOffset = charOffset - position;
        return true;
      }
      position += len;
      endsWithNewline = textEndsWithNewline(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'br') {
        if (position + 1 >= charOffset) {
          targetNode = el;
          targetOffset = 0;
          return true;
        }
        position += 1;
        endsWithNewline = true;
        return false;
      }

      if (tagName === 'div' || tagName === 'p') {
        if (position > 0 && !endsWithNewline) {
          if (position + 1 >= charOffset) {
            targetNode = el;
            targetOffset = 0;
            return true;
          }
          position += 1;
          endsWithNewline = true;
        }

        for (const child of Array.from(el.childNodes)) {
          if (walk(child)) return true;
        }
        return false;
      }

      if (el.classList.contains('file-tag')) {
        const filePath = el.getAttribute('data-file-path') || '';
        const tagLength = filePath.length + 1;

        if (position + tagLength >= charOffset) {
          targetNode = el;
          targetOffset = 0;
          return true;
        }
        position += tagLength;
        endsWithNewline = false;
      } else {
        for (const child of Array.from(node.childNodes)) {
          if (walk(child)) return true;
        }
      }
    }
    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walk(child)) break;
  }

  if (targetNode) {
    const range = document.createRange();
    try {
      const node: Node = targetNode;
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        range.setStart(textNode, Math.max(0, Math.min(targetOffset, textNode.textContent?.length ?? 0)));
        range.collapse(true);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        range.selectNodeContents(node as HTMLElement);
        range.collapse(false);
      }
      return range.getBoundingClientRect();
    } catch {
      return null;
    }
  }

  if (element.lastChild) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range.getBoundingClientRect();
  }

  return element.getBoundingClientRect();
}

export function setCursorAtCharOffset(
  element: HTMLElement,
  charOffset: number
): void {
  let position = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;
  let endsWithNewline = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const len = text.length;
      if (position + len >= charOffset) {
        targetNode = node;
        targetOffset = charOffset - position;
        return true;
      }
      position += len;
      endsWithNewline = textEndsWithNewline(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'br') {
        if (position + 1 >= charOffset) {
          targetNode = el;
          targetOffset = 0;
          return true;
        }
        position += 1;
        endsWithNewline = true;
        return false;
      }

      if (tagName === 'div' || tagName === 'p') {
        if (position > 0 && !endsWithNewline) {
          if (position + 1 >= charOffset) {
            targetNode = el;
            targetOffset = 0;
            return true;
          }
          position += 1;
          endsWithNewline = true;
        }

        for (const child of Array.from(el.childNodes)) {
          if (walk(child)) return true;
        }
        return false;
      }

      if (el.classList.contains('file-tag')) {
        const filePath = el.getAttribute('data-file-path') || '';
        const tagLength = filePath.length + 1;

        if (position + tagLength >= charOffset) {
          targetNode = el.nextSibling || el.parentNode;
          targetOffset = el.nextSibling ? 0 : Array.from(el.parentNode?.childNodes || []).indexOf(el) + 1;
          return true;
        }
        position += tagLength;
        endsWithNewline = false;
      } else {
        for (const child of Array.from(node.childNodes)) {
          if (walk(child)) return true;
        }
      }
    }
    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walk(child)) break;
  }

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  try {
    if (targetNode) {
      const node = targetNode as Node;
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        range.setStart(textNode, Math.max(0, Math.min(targetOffset, textNode.textContent?.length ?? 0)));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (targetOffset > 0 && el.childNodes.length >= targetOffset) {
          range.setStartAfter(el.childNodes[targetOffset - 1]);
        } else {
          range.setStart(el, 0);
        }
      }
    } else {
      if (element.lastChild) {
        range.setStartAfter(element.lastChild);
      } else {
        range.setStart(element, 0);
      }
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
  }
}

function isPositionInFileTag(element: HTMLElement, textPosition: number): boolean {
  let position = 0;
  let inFileTag = false;
  let endsWithNewline = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const len = text.length;
      if (position + len > textPosition) {
        return true;
      }
      position += len;
      endsWithNewline = textEndsWithNewline(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'br') {
        if (position + 1 > textPosition) {
          return true;
        }
        position += 1;
        endsWithNewline = true;
        return false;
      }

      if (tagName === 'div' || tagName === 'p') {
        if (position > 0 && !endsWithNewline) {
          if (position + 1 > textPosition) {
            return true;
          }
          position += 1;
          endsWithNewline = true;
        }

        for (const child of Array.from(el.childNodes)) {
          if (walk(child)) return true;
        }
        return false;
      }

      if (el.classList.contains('file-tag')) {
        const filePath = el.getAttribute('data-file-path') || '';
        const tagLength = filePath.length + 1;

        if (position <= textPosition && textPosition < position + tagLength) {
          inFileTag = true;
          return true;
        }
        position += tagLength;
        endsWithNewline = false;
      } else {
        for (const child of Array.from(node.childNodes)) {
          if (walk(child)) return true;
        }
      }
    }
    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walk(child)) break;
  }

  return inFileTag;
}

function detectAtTrigger(text: string, cursorPosition: number, element?: HTMLElement): TriggerQuery | null {
  let start = cursorPosition - 1;
  while (start >= 0) {
    const char = text[start];
    if (char === ' ' || char === '\n' || char === '\t') {
      return null;
    }
    if (char === '@') {
      if (element && isPositionInFileTag(element, start)) {
        start--;
        continue;
      }

      const query = text.slice(start + 1, cursorPosition);
      return {
        trigger: '@',
        query,
        start,
        end: cursorPosition,
      };
    }
    start--;
  }
  return null;
}

function detectSlashTrigger(text: string, cursorPosition: number): TriggerQuery | null {
  let start = cursorPosition - 1;
  while (start >= 0) {
    const char = text[start];

    if (char === ' ' || char === '\t') {
      return null;
    }
    if (char === '\n') {
      return null;
    }

    if (char === '/') {
      const isLineStart = start === 0 || text[start - 1] === '\n';
      if (isLineStart) {
        const query = text.slice(start + 1, cursorPosition);
        return {
          trigger: '/',
          query,
          start,
          end: cursorPosition,
        };
      }
      return null;
    }
    start--;
  }
  return null;
}

function detectHashTrigger(text: string, cursorPosition: number): TriggerQuery | null {
  let start = cursorPosition - 1;
  while (start >= 0) {
    const char = text[start];

    if (char === ' ' || char === '\t') {
      return null;
    }
    if (char === '\n') {
      return null;
    }

    if (char === '#') {
      const isLineStart = start === 0 || text[start - 1] === '\n';
      if (isLineStart) {
        const query = text.slice(start + 1, cursorPosition);
        return {
          trigger: '#',
          query,
          start,
          end: cursorPosition,
        };
      }
      return null;
    }
    start--;
  }
  return null;
}

export function useTriggerDetection() {
  const detectTrigger = useCallback((
    text: string,
    cursorPosition: number,
    element?: HTMLElement
  ): TriggerQuery | null => {
    const atTrigger = detectAtTrigger(text, cursorPosition, element);
    if (atTrigger) return atTrigger;

    const slashTrigger = detectSlashTrigger(text, cursorPosition);
    if (slashTrigger) return slashTrigger;

    const hashTrigger = detectHashTrigger(text, cursorPosition);
    if (hashTrigger) return hashTrigger;

    return null;
  }, []);

  const getTriggerPosition = useCallback((
    element: HTMLElement,
    triggerStart: number
  ): DropdownPosition | null => {
    const rect = getRectAtCharOffset(element, triggerStart);
    if (!rect) return null;

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const getCursorPosition = useCallback((element: HTMLElement): number => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);

    let position = 0;
    let found = false;
    let endsWithNewline = false;

    const walk = (node: Node): boolean => {
      if (found) return true;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (range.endContainer === node) {
          position += range.endOffset;
          found = true;
          return true;
        }
        position += text.length;
        endsWithNewline = textEndsWithNewline(text);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'br') {
          if (range.endContainer === el || (range.endContainer === element && el === element.childNodes[range.endOffset - 1])) {
            found = true;
            return true;
          }
          position += 1;
          endsWithNewline = true;
          return false;
        }

        if (tagName === 'div' || tagName === 'p') {
          if (position > 0 && !endsWithNewline) {
            position += 1;
            endsWithNewline = true;
          }

          if (range.endContainer === el) {
            const children = Array.from(el.childNodes);
            for (let i = 0; i < range.endOffset && i < children.length; i++) {
              const child = children[i];
              if (child.nodeType === Node.TEXT_NODE) {
                position += child.textContent?.length || 0;
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as HTMLElement;
                const childTag = childEl.tagName.toLowerCase();
                if (childTag === 'br') {
                  position += 1;
                } else if (childEl.classList.contains('file-tag')) {
                  const filePath = childEl.getAttribute('data-file-path') || '';
                  position += filePath.length + 1;
                } else {
                  position += childEl.textContent?.length || 0;
                }
              }
            }
            found = true;
            return true;
          }

          for (const child of Array.from(el.childNodes)) {
            if (walk(child)) return true;
          }
          return false;
        }

        if (el.classList.contains('file-tag')) {
          const filePath = el.getAttribute('data-file-path') || '';
          const tagLength = filePath.length + 1;

          if (el.contains(range.endContainer)) {
            position += tagLength;
            found = true;
            return true;
          }
          position += tagLength;
          endsWithNewline = false;
        } else {
          if (range.endContainer === el) {
            const children = Array.from(el.childNodes);
            for (let i = 0; i < range.endOffset && i < children.length; i++) {
              const child = children[i];
              if (child.nodeType === Node.TEXT_NODE) {
                position += child.textContent?.length || 0;
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as HTMLElement;
                const childTag = childEl.tagName.toLowerCase();
                if (childTag === 'br') {
                  position += 1;
                } else if (childEl.classList.contains('file-tag')) {
                  const filePath = childEl.getAttribute('data-file-path') || '';
                  position += filePath.length + 1;
                } else {
                  position += childEl.textContent?.length || 0;
                }
              }
            }
            found = true;
            return true;
          }
          for (const child of Array.from(node.childNodes)) {
            if (walk(child)) return true;
          }
        }
      }
      return false;
    };

    for (const child of Array.from(element.childNodes)) {
      if (walk(child)) break;
    }

    return position;
  }, []);

  return {
    detectTrigger,
    getTriggerPosition,
    getCursorPosition,
  };
}

export default useTriggerDetection;
