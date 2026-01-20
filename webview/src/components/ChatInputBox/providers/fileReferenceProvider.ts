import type { FileItem, DropdownItemData } from '../types';
import { getFileIcon, getFolderIcon } from '../../../utils/fileIcons';

let pendingResolve: ((files: FileItem[]) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let lastQuery: string = '';

export function resetFileReferenceState() {
  console.log('[fileReferenceProvider] Resetting file reference state');
  pendingResolve = null;
  pendingReject = null;
  lastQuery = '';
}

function setupFileListCallback() {
  if (typeof window !== 'undefined' && !window.onFileListResult) {
    window.onFileListResult = (json: string) => {
      try {
        const data = JSON.parse(json);
        let files: FileItem[] = data.files || data || [];

        files = files.filter(file => !shouldHideFile(file.name));

        const result = files.length > 0 ? files : filterFiles(DEFAULT_FILES, lastQuery);
        pendingResolve?.(result);
      } catch (error) {
        console.error('[fileReferenceProvider] Parse error:', error);
        pendingReject?.(error as Error);
      } finally {
        pendingResolve = null;
        pendingReject = null;
      }
    };
  }
}

function sendToJava(event: string, payload: Record<string, unknown>) {
  if (window.sendToJava) {
    window.sendToJava(`${event}:${JSON.stringify(payload)}`);
  } else {
    console.warn('[fileReferenceProvider] sendToJava not available');
  }
}

function shouldHideFile(fileName: string): boolean {
  const hiddenItems = [
    '.DS_Store',
    '.git',
    'node_modules',
    '.idea',
  ];

  return hiddenItems.includes(fileName);
}

const DEFAULT_FILES: FileItem[] = [];

function filterFiles(files: FileItem[], query: string): FileItem[] {
  let filtered = files.filter(file => !shouldHideFile(file.name));

  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(file =>
      file.name.toLowerCase().includes(lowerQuery) ||
      file.path.toLowerCase().includes(lowerQuery)
    );
  }

  return filtered;
}

function parseQuery(query: string): { currentPath: string; searchQuery: string } {
  if (!query) {
    return { currentPath: '', searchQuery: '' };
  }

  const lastSlashIndex = query.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return { currentPath: '', searchQuery: query };
  }

  const currentPath = query.substring(0, lastSlashIndex + 1);
  const searchQuery = query.substring(lastSlashIndex + 1);

  return { currentPath, searchQuery };
}

export async function fileReferenceProvider(
  query: string,
  signal: AbortSignal
): Promise<FileItem[]> {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  setupFileListCallback();

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const { currentPath, searchQuery } = parseQuery(query);

    pendingResolve = resolve;
    pendingReject = reject;
    lastQuery = query;

    signal.addEventListener('abort', () => {
      pendingResolve = null;
      pendingReject = null;
      reject(new DOMException('Aborted', 'AbortError'));
    });

    if (!window.sendToJava) {
      const filtered = filterFiles(DEFAULT_FILES, searchQuery);
      pendingResolve = null;
      pendingReject = null;
      resolve(filtered);
      return;
    }

    sendToJava('list_files', {
      query: searchQuery,
      currentPath: currentPath,
    });

    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null;
        pendingReject = null;
        resolve(filterFiles(DEFAULT_FILES, searchQuery));
      }
    }, 3000);
  });
}

export function fileToDropdownItem(file: FileItem): DropdownItemData {
  const iconSvg = file.type === 'directory'
    ? getFolderIcon(file.name, false)
    : getFileIcon(file.extension, file.name);

  return {
    id: file.path,
    label: file.name,
    description: file.absolutePath || file.path,
    icon: iconSvg,
    type: file.type === 'directory' ? 'directory' : 'file',
    data: { file },
  };
}

export default fileReferenceProvider;
