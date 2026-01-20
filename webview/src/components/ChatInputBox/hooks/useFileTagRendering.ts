import { useCallback, useMemo, useRef } from 'react';
import { getFileIcon } from '../../../utils/fileIcons';
import { icon_folder } from '../../../utils/icons';
import { setCursorAtCharOffset } from './useTriggerDetection';

/**
 * Debounce utility function
 */
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
  /** Ref to close functions - allows setting after completion hooks are created */
  closeCompletionsRef: React.MutableRefObject<{ file: () => void; command: () => void } | null>;
  justRenderedTagRef: React.MutableRefObject<boolean>;
}

export interface UseFileTagRenderingReturn {
  /** Path mapping: stores filename/relative path -> full absolute path */
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  /** Escape HTML attribute values */
  escapeHtmlAttr: (str: string) => string;
  /** Render file tags from @path text to visual tags */
  renderFileTags: () => void;
  /** Debounced version of renderFileTags (300ms delay) */
  debouncedRenderFileTags: () => void;
  /** Handle keydown for tag rendering (space key triggers debounced render) */
  handleKeyDownForTagRendering: (e: KeyboardEvent) => void;
}

/**
 * Hook for file tag rendering functionality
 * Converts @filepath text into visual file tags with icons
 */
export function useFileTagRendering({
  editableRef,
  getTextContent,
  getCursorPosition,
  closeCompletionsRef,
  justRenderedTagRef,
}: UseFileTagRenderingOptions): UseFileTagRenderingReturn {
  // Path mapping: stores filename/relative path -> full absolute path
  // Used for displaying full path in tooltip
  const pathMappingRef = useRef<Map<string, string>>(new Map());

  /**
   * Escape HTML attribute values
   * Ensures special characters (including quotes, <, >, &, etc.) are properly handled
   * Note: backslash doesn't need escaping as it's a valid character in HTML attributes
   */
  const escapeHtmlAttr = useCallback((str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, []);

  /**
   * Render file tags
   * Converts @filepath format text in the input to file tags
   */
  const renderFileTags = useCallback(() => {
    if (!editableRef.current) return;

    // Regex: match @filepath (ends with space or end of string)
    // Supports files and directories: extension is optional
    // Supports Windows paths (backslash) and Unix paths (forward slash)
    // Matches all characters except space and @ (including backslash, forward slash, colon, etc.)
    const fileRefRegex = /@([^\s@]+?)(\s|$)/g;

    const currentText = getTextContent();
    const matches = Array.from(currentText.matchAll(fileRefRegex));

    if (matches.length === 0) {
      // No file references, keep as is
      return;
    }

    // Check if DOM has plain text @filepath that needs to be converted
    // Traverse all text nodes, find text containing @
    let hasUnrenderedReferences = false;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.includes('@')) {
          hasUnrenderedReferences = true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        // Skip already rendered file tags
        if (!element.classList.contains('file-tag')) {
          node.childNodes.forEach(walk);
        }
      }
    };
    editableRef.current.childNodes.forEach(walk);

    // If no unrendered references, no need to re-render
    if (!hasUnrenderedReferences) {
      return;
    }

    // Save cursor position before modifying innerHTML (BUG-006 fix)
    const savedCursorPos = getCursorPosition(editableRef.current);

    // Build new HTML content
    let newHTML = '';
    let lastIndex = 0;

    matches.forEach((match) => {
      const fullMatch = match[0];
      const filePath = match[1];
      const matchIndex = match.index || 0;

      // Add text before the match
      if (matchIndex > lastIndex) {
        const textBefore = currentText.substring(lastIndex, matchIndex);
        newHTML += textBefore;
      }

      // Separate path and line number parts (e.g., src/file.ts#L10-20 -> src/file.ts)
      const hashIndex = filePath.indexOf('#');
      const pureFilePath = hashIndex !== -1 ? filePath.substring(0, hashIndex) : filePath;

      // Get pure filename (without line number, used for getting ICON)
      const pureFileName = pureFilePath.split(/[/\\]/).pop() || pureFilePath;

      // Validate if path is a valid reference (must exist in pathMappingRef)
      // Only files selected from dropdown will be recorded in pathMappingRef
      const isValidReference =
        pathMappingRef.current.has(pureFilePath) ||
        pathMappingRef.current.has(pureFileName) ||
        pathMappingRef.current.has(filePath);

      // If not a valid reference, keep original text, don't render as tag
      if (!isValidReference) {
        newHTML += fullMatch;
        lastIndex = matchIndex + fullMatch.length;
        return;
      }

      // Get display filename (including line number, for display)
      const displayFileName = filePath.split(/[/\\]/).pop() || filePath;

      // Determine if it's a file or directory (using pure filename)
      const isDirectory = !pureFileName.includes('.');

      let iconSvg = '';
      if (isDirectory) {
        iconSvg = icon_folder;
      } else {
        const extension = pureFileName.indexOf('.') !== -1 ? pureFileName.split('.').pop() : '';
        iconSvg = getFileIcon(extension, pureFileName);
      }

      // Escape file path for safe placement in HTML attributes
      const escapedPath = escapeHtmlAttr(filePath);

      // Try to get full path from path mapping (for tooltip display)
      const fullPath =
        pathMappingRef.current.get(pureFilePath) ||
        pathMappingRef.current.get(pureFileName) ||
        filePath;
      const escapedFullPath = escapeHtmlAttr(fullPath);

      // Create file tag HTML
      newHTML += `<span class="file-tag has-tooltip" contenteditable="false" data-file-path="${escapedPath}" data-tooltip="${escapedFullPath}">`;
      newHTML += `<span class="file-tag-icon">${iconSvg}</span>`;
      newHTML += `<span class="file-tag-text">${displayFileName}</span>`;
      newHTML += `<span class="file-tag-close">×</span>`;
      newHTML += `</span>`;

      // Add space
      newHTML += ' ';

      lastIndex = matchIndex + fullMatch.length;
    });

    // Add remaining text
    if (lastIndex < currentText.length) {
      newHTML += currentText.substring(lastIndex);
    }

    // Set flag before updating innerHTML to prevent triggering completion detection
    justRenderedTagRef.current = true;
    closeCompletionsRef.current?.file();
    closeCompletionsRef.current?.command();

    // Update content
    editableRef.current.innerHTML = newHTML;

    // Add event listeners for file tag close buttons
    const tags = editableRef.current.querySelectorAll('.file-tag-close');
    tags.forEach((closeBtn) => {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = (e.target as HTMLElement).closest('.file-tag');
        if (tag) {
          tag.remove();
          // Don't call handleInput here to avoid loop
        }
      });
    });

    // Restore cursor to saved position (BUG-006 fix)
    // Previously always moved cursor to end, causing jumping when typing before file references
    setCursorAtCharOffset(editableRef.current, savedCursorPos);

    // After rendering, immediately reset flag to allow subsequent completion detection
    // Use setTimeout 0 to ensure reset happens after current event loop
    setTimeout(() => {
      justRenderedTagRef.current = false;
    }, 0);
  }, [editableRef, getTextContent, getCursorPosition, closeCompletionsRef, escapeHtmlAttr, justRenderedTagRef]);

  // Create debounced version of renderFileTags (300ms delay)
  const debouncedRenderFileTags = useMemo(
    () => debounce(renderFileTags, 300),
    [renderFileTags]
  );

  /**
   * Handle keydown for tag rendering (space key triggers debounced render)
   * Optimization: use debounce to delay rendering
   */
  const handleKeyDownForTagRendering = useCallback((e: KeyboardEvent) => {
    // If space key pressed, use debounce to delay file tag rendering
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
