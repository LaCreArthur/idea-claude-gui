import { useCallback, useMemo, useRef } from 'react';
import { getFileIcon } from '../../../utils/fileIcons';
import { icon_folder } from '../../../utils/icons';
import { setCursorAtCharOffset } from './useTriggerDetection';

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

export interface UseFileTagRenderingOptions {
  editableRef: React.RefObject<HTMLDivElement | null>;
  getTextContent: () => string;
  getCursorPosition: (element: HTMLElement) => number;
  closeCompletionsRef: React.MutableRefObject<{ file: () => void; command: () => void } | null>;
  justRenderedTagRef: React.MutableRefObject<boolean>;
}

export interface UseFileTagRenderingReturn {
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  escapeHtmlAttr: (str: string) => string;
  renderFileTags: () => void;
  debouncedRenderFileTags: () => void;
  handleKeyDownForTagRendering: (e: KeyboardEvent) => void;
}

export function useFileTagRendering({
  editableRef,
  getTextContent,
  getCursorPosition,
  closeCompletionsRef,
  justRenderedTagRef,
}: UseFileTagRenderingOptions): UseFileTagRenderingReturn {
  const pathMappingRef = useRef<Map<string, string>>(new Map());

  const escapeHtmlAttr = useCallback((str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, []);

  const renderFileTags = useCallback(() => {
    if (!editableRef.current) return;

    const fileRefRegex = /@([^\s@]+?)(\s|$)/g;

    const currentText = getTextContent();
    const matches = Array.from(currentText.matchAll(fileRefRegex));

    if (matches.length === 0) {
      return;
    }

    let hasUnrenderedReferences = false;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.includes('@')) {
          hasUnrenderedReferences = true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (!element.classList.contains('file-tag')) {
          node.childNodes.forEach(walk);
        }
      }
    };
    editableRef.current.childNodes.forEach(walk);

    if (!hasUnrenderedReferences) {
      return;
    }

    const savedCursorPos = getCursorPosition(editableRef.current);

    let newHTML = '';
    let lastIndex = 0;

    matches.forEach((match) => {
      const fullMatch = match[0];
      const filePath = match[1];
      const matchIndex = match.index || 0;

      if (matchIndex > lastIndex) {
        const textBefore = currentText.substring(lastIndex, matchIndex);
        newHTML += textBefore;
      }

      const hashIndex = filePath.indexOf('#');
      const pureFilePath = hashIndex !== -1 ? filePath.substring(0, hashIndex) : filePath;

      const pureFileName = pureFilePath.split(/[/\\]/).pop() || pureFilePath;

      const isValidReference =
        pathMappingRef.current.has(pureFilePath) ||
        pathMappingRef.current.has(pureFileName) ||
        pathMappingRef.current.has(filePath);

      if (!isValidReference) {
        newHTML += fullMatch;
        lastIndex = matchIndex + fullMatch.length;
        return;
      }

      const displayFileName = filePath.split(/[/\\]/).pop() || filePath;

      const isDirectory = !pureFileName.includes('.');

      let iconSvg = '';
      if (isDirectory) {
        iconSvg = icon_folder;
      } else {
        const extension = pureFileName.indexOf('.') !== -1 ? pureFileName.split('.').pop() : '';
        iconSvg = getFileIcon(extension, pureFileName);
      }

      const escapedPath = escapeHtmlAttr(filePath);

      const fullPath =
        pathMappingRef.current.get(pureFilePath) ||
        pathMappingRef.current.get(pureFileName) ||
        filePath;
      const escapedFullPath = escapeHtmlAttr(fullPath);

      newHTML += `<span class="file-tag has-tooltip" contenteditable="false" data-file-path="${escapedPath}" data-tooltip="${escapedFullPath}">`;
      newHTML += `<span class="file-tag-icon">${iconSvg}</span>`;
      newHTML += `<span class="file-tag-text">${displayFileName}</span>`;
      newHTML += `<span class="file-tag-close">×</span>`;
      newHTML += `</span>`;

      newHTML += ' ';

      lastIndex = matchIndex + fullMatch.length;
    });

    if (lastIndex < currentText.length) {
      newHTML += currentText.substring(lastIndex);
    }

    justRenderedTagRef.current = true;
    closeCompletionsRef.current?.file();
    closeCompletionsRef.current?.command();

    editableRef.current.innerHTML = newHTML;

    const tags = editableRef.current.querySelectorAll('.file-tag-close');
    tags.forEach((closeBtn) => {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = (e.target as HTMLElement).closest('.file-tag');
        if (tag) {
          tag.remove();
        }
      });
    });

    setCursorAtCharOffset(editableRef.current, savedCursorPos);

    setTimeout(() => {
      justRenderedTagRef.current = false;
    }, 0);
  }, [editableRef, getTextContent, getCursorPosition, closeCompletionsRef, escapeHtmlAttr, justRenderedTagRef]);

  const debouncedRenderFileTags = useMemo(
    () => debounce(renderFileTags, 300),
    [renderFileTags]
  );

  const handleKeyDownForTagRendering = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ') {
      debouncedRenderFileTags();
    }
  }, [debouncedRenderFileTags]);

  return {
    pathMappingRef,
    escapeHtmlAttr,
    renderFileTags,
    debouncedRenderFileTags,
    handleKeyDownForTagRendering,
  };
}
