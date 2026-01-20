import { useCallback } from 'react';
import type { Attachment } from '../types';

interface UseAttachmentManagementProps {
  externalAttachments?: Attachment[];
  onAddAttachment?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  editableRef: React.RefObject<HTMLDivElement | null>;
  getTextContent: () => string;
  renderFileTags: () => void;
  handleInput: () => void;
  adjustHeight: () => void;
  onInput?: (text: string) => void;
  fileCompletionClose: () => void;
  commandCompletionClose: () => void;
  setInternalAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}

interface UseAttachmentManagementReturn {
  handlePaste: (e: React.ClipboardEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleAddAttachment: (files: FileList) => void;
  handleRemoveAttachment: (id: string) => void;
  generateId: () => string;
}

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

  const generateId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;

    if (!items) {
      return;
    }

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.startsWith('image/')) {
        hasImage = true;
        e.preventDefault();

        const blob = item.getAsFile();

        if (blob) {
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

    if (!hasImage) {
      e.preventDefault();

      let text = e.clipboardData.getData('text/plain') ||
        e.clipboardData.getData('text/uri-list') ||
        e.clipboardData.getData('text/html');

      if (!text) {
        let hasFileItem = false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            hasFileItem = true;
            break;
          }
        }

        if (hasFileItem && (window as any).getClipboardFilePath) {
          (window as any).getClipboardFilePath().then((fullPath: string) => {
            if (fullPath && fullPath.trim()) {
              document.execCommand('insertText', false, fullPath);
              handleInput();
            }
          }).catch(() => {
          });
          return;
        }
      }

      if (text && text.trim()) {
        document.execCommand('insertText', false, text);

        handleInput();
      }
    }
  }, [generateId, handleInput]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const text = e.dataTransfer?.getData('text/plain');

    const files = e.dataTransfer?.files;

    let hasImageFile = false;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

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

    if (hasImageFile) {
      return;
    }

    if (text && text.trim()) {
      const filePath = text.trim();
      const fileName = filePath.split(/[/\\]/).pop() || filePath;

      pathMappingRef.current.set(fileName, filePath);
      pathMappingRef.current.set(filePath, filePath);

      const textToInsert = (text.startsWith('@') ? text : `@${text}`) + ' ';

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editableRef.current) {
        if (editableRef.current.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(textToInsert);
          range.insertNode(textNode);

          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          const textNode = document.createTextNode(textToInsert);
          editableRef.current.appendChild(textNode);

          const range = document.createRange();
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        if (editableRef.current) {
          const textNode = document.createTextNode(textToInsert);
          editableRef.current.appendChild(textNode);
        }
      }

      fileCompletionClose();
      commandCompletionClose();

      const newText = getTextContent();
      adjustHeight();
      onInput?.(newText);

      setTimeout(() => {
        renderFileTags();
      }, 50);
    }
  }, [generateId, getTextContent, renderFileTags, fileCompletionClose, commandCompletionClose, adjustHeight, onInput, pathMappingRef, editableRef]);

  const handleAddAttachment = useCallback((files: FileList) => {
    if (externalAttachments !== undefined) {
      onAddAttachment?.(files);
    } else {
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
