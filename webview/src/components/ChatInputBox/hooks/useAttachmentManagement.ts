import { useCallback } from 'react';
import type { Attachment } from '../types';

interface UseAttachmentManagementProps {
  /** Externally controlled attachments (if provided) */
  externalAttachments?: Attachment[];
  /** Callback when attachment is added (external mode) */
  onAddAttachment?: (files: FileList) => void;
  /** Callback when attachment is removed (external mode) */
  onRemoveAttachment?: (id: string) => void;
  /** Ref to path mapping for drag-drop file references */
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  /** Ref to the editable input element */
  editableRef: React.RefObject<HTMLDivElement | null>;
  /** Get text content from input */
  getTextContent: () => string;
  /** Render file tags after drop */
  renderFileTags: () => void;
  /** Handle input event after paste/drop */
  handleInput: () => void;
  /** Adjust input height */
  adjustHeight: () => void;
  /** Notify parent of input change */
  onInput?: (text: string) => void;
  /** File completion close function */
  fileCompletionClose: () => void;
  /** Command completion close function */
  commandCompletionClose: () => void;
  /** Setter for internal attachments state (managed by parent) */
  setInternalAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}

interface UseAttachmentManagementReturn {
  /** Handle paste event */
  handlePaste: (e: React.ClipboardEvent) => void;
  /** Handle drag over event */
  handleDragOver: (e: React.DragEvent) => void;
  /** Handle drop event */
  handleDrop: (e: React.DragEvent) => void;
  /** Handle adding attachment files */
  handleAddAttachment: (files: FileList) => void;
  /** Handle removing an attachment */
  handleRemoveAttachment: (id: string) => void;
  /** Generate unique ID */
  generateId: () => string;
}

/**
 * Hook for managing attachments in ChatInputBox
 * Handles paste, drag-drop, add, and remove operations
 * Supports both controlled (external) and uncontrolled (internal) modes
 */
export function useAttachmentManagement({
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
  fileCompletionClose,
  commandCompletionClose,
  setInternalAttachments,
}: UseAttachmentManagementProps): UseAttachmentManagementReturn {

  /**
   * Generate unique ID (JCEF compatible)
   */
  const generateId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }, []);

  /**
   * Handle paste event - detect images and plain text
   */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;

    if (!items) {
      return;
    }

    // Check for real images (type is image/*)
    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Only handle real image types (type starts with image/)
      if (item.type.startsWith('image/')) {
        hasImage = true;
        e.preventDefault();

        const blob = item.getAsFile();

        if (blob) {
          // Read image as Base64
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            const mediaType = blob.type || item.type || 'image/png';
            const ext = (() => {
              if (mediaType && mediaType.includes('/')) {
                return mediaType.split('/')[1];
              }
              const name = blob.name || '';
              const m = name.match(/\.([a-zA-Z0-9]+)$/);
              return m ? m[1] : 'png';
            })();
            const attachment: Attachment = {
              id: generateId(),
              fileName: `pasted-image-${Date.now()}.${ext}`,
              mediaType,
              data: base64,
            };

            setInternalAttachments(prev => [...prev, attachment]);
          };
          reader.readAsDataURL(blob);
        }

        return;
      }
    }

    // If no image, try to get text or file path
    if (!hasImage) {
      e.preventDefault();

      // Try multiple ways to get text
      let text = e.clipboardData.getData('text/plain') ||
        e.clipboardData.getData('text/uri-list') ||
        e.clipboardData.getData('text/html');

      // If still no text, try to get filename/path from file type item
      if (!text) {
        // Check for file type items
        let hasFileItem = false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            hasFileItem = true;
            break;
          }
        }

        // If there's a file type item, try to get full path via Java
        if (hasFileItem && (window as any).getClipboardFilePath) {
          (window as any).getClipboardFilePath().then((fullPath: string) => {
            if (fullPath && fullPath.trim()) {
              // Insert full path
              document.execCommand('insertText', false, fullPath);
              handleInput();
            }
          }).catch(() => {
            // Ignore error
          });
          return;
        }
      }

      if (text && text.trim()) {
        // Use document.execCommand to insert plain text (maintains cursor position)
        document.execCommand('insertText', false, text);

        // Trigger input event to update state
        handleInput();
      }
    }
  }, [generateId, handleInput]);

  /**
   * Handle drag over event
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Set drag effect to copy
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  /**
   * Handle drop event - detect images and file paths
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // First get text content (file path)
    const text = e.dataTransfer?.getData('text/plain');

    // Then check file objects
    const files = e.dataTransfer?.files;

    // Check for actual image file objects
    let hasImageFile = false;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Only handle image files
        if (file.type.startsWith('image/')) {
          hasImageFile = true;
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            const ext = (() => {
              if (file.type && file.type.includes('/')) {
                return file.type.split('/')[1];
              }
              const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
              return m ? m[1] : 'png';
            })();
            const attachment: Attachment = {
              id: generateId(),
              fileName: file.name || `dropped-image-${Date.now()}.${ext}`,
              mediaType: file.type || 'image/png',
              data: base64,
            };

            setInternalAttachments(prev => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
        }
      }
    }

    // If there are image files, don't process text
    if (hasImageFile) {
      return;
    }

    // No image files, process text (file path or other text)
    if (text && text.trim()) {
      // Extract file path and add to path mapping
      const filePath = text.trim();
      const fileName = filePath.split(/[/\\]/).pop() || filePath;

      // Add path to pathMappingRef to make it a "valid reference"
      pathMappingRef.current.set(fileName, filePath);
      pathMappingRef.current.set(filePath, filePath);

      // Auto-add @ prefix (if not present), and add space to trigger rendering
      const textToInsert = (text.startsWith('@') ? text : `@${text}`) + ' ';

      // Get current cursor position
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current) {
        // Ensure cursor is inside input
        if (editableRef.current.contains(selection.anchorNode)) {
          // Use modern API to insert text
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(textToInsert);
          range.insertNode(textNode);

          // Move cursor after inserted text
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Cursor not in input, append to end
          // Use appendChild instead of innerText to preserve existing file tags
          const textNode = document.createTextNode(textToInsert);
          editableRef.current.appendChild(textNode);

          // Move cursor to end
          const range = document.createRange();
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        // No selection, append to end
        if (editableRef.current) {
          const textNode = document.createTextNode(textToInsert);
          editableRef.current.appendChild(textNode);
        }
      }

      // Close completion menus
      fileCompletionClose();
      commandCompletionClose();

      // Directly trigger state update, don't call handleInput (avoid re-detecting completion)
      const newText = getTextContent();
      adjustHeight();
      onInput?.(newText);

      // Immediately render file tags (no need to wait for space)
      setTimeout(() => {
        renderFileTags();
      }, 50);
    }
  }, [generateId, getTextContent, renderFileTags, fileCompletionClose, commandCompletionClose, adjustHeight, onInput, pathMappingRef, editableRef]);

  /**
   * Handle adding attachment files
   */
  const handleAddAttachment = useCallback((files: FileList) => {
    if (externalAttachments !== undefined) {
      onAddAttachment?.(files);
    } else {
      // Use internal state
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          const attachment: Attachment = {
            id: generateId(),
            fileName: file.name,
            mediaType: file.type || 'application/octet-stream',
            data: base64,
          };
          setInternalAttachments(prev => [...prev, attachment]);
        };
        reader.readAsDataURL(file);
      });
    }
  }, [externalAttachments, onAddAttachment, generateId]);

  /**
   * Handle removing an attachment
   */
  const handleRemoveAttachment = useCallback((id: string) => {
    if (externalAttachments !== undefined) {
      onRemoveAttachment?.(id);
    } else {
      setInternalAttachments(prev => prev.filter(a => a.id !== id));
    }
  }, [externalAttachments, onRemoveAttachment]);

  return {
    handlePaste,
    handleDragOver,
    handleDrop,
    handleAddAttachment,
    handleRemoveAttachment,
    generateId,
  };
}
