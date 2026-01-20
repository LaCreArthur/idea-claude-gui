import { useState } from 'react';
import type { ToolInput } from '../../types';
import { openFile } from '../../utils/bridge';
import { getFileName } from '../../utils/helpers';
import { getFileIcon, getFolderIcon } from '../../utils/fileIcons';

interface ReadToolBlockProps {
  input?: ToolInput;
}

const extractFilePathFromCommand = (command: string | undefined, workdir?: string): string | undefined => {
  if (!command || typeof command !== 'string') return undefined;

  let trimmed = command.trim();

  const shellWrapperMatch = trimmed.match(/^\/bin\/(zsh|bash)\s+(?:-lc|-c)\s+['"](.+)['"]$/);
  if (shellWrapperMatch) {
    trimmed = shellWrapperMatch[2];
  }

  const cdPrefixMatch = trimmed.match(/^cd\s+\S+\s+&&\s+(.+)$/);
  if (cdPrefixMatch) {
    trimmed = cdPrefixMatch[1].trim();
  }

  if (/^pwd\s*$/.test(trimmed)) {
    return workdir ? workdir + '/' : undefined;
  }

  const lsMatch = trimmed.match(/^ls\s+(?:-[a-zA-Z]+\s+)?(.+)$/);
  if (lsMatch) {
    const path = lsMatch[1].trim().replace(/^["']|["']$/g, '');
    return path.endsWith('/') ? path : path + '/';
  }

  if (/^ls(?:\s+-[a-zA-Z]+)*\s*$/.test(trimmed)) {
    return workdir ? workdir + '/' : undefined;
  }

  if (/^tree\b/.test(trimmed)) {
    const treeMatch = trimmed.match(/^tree\s+(.+)$/);
    if (treeMatch) {
      const path = treeMatch[1].trim().replace(/^["']|["']$/g, '');
      return path.endsWith('/') ? path : path + '/';
    }
    return workdir ? workdir + '/' : undefined;
  }

  const sedMatch = trimmed.match(/^sed\s+-n\s+['"]?(\d+)(?:,(\d+))?p['"]?\s+(.+)$/);
  if (sedMatch) {
    const startLine = sedMatch[1];
    const endLine = sedMatch[2];
    const path = sedMatch[3].trim().replace(/^["']|["']$/g, '');
    if (endLine) {
      return `${path}:${startLine}-${endLine}`;
    } else {
      return `${path}:${startLine}`;
    }
  }

  const catMatch = trimmed.match(/^cat\s+(.+)$/);
  if (catMatch) {
    const path = catMatch[1].trim();
    return path.replace(/^["']|["']$/g, '');
  }

  const headTailMatch = trimmed.match(/^(head|tail)\s+(?:.*\s)?([^\s-][^\s]*)$/);
  if (headTailMatch) {
    const path = headTailMatch[2].trim();
    return path.replace(/^["']|["']$/g, '');
  }

  return undefined;
};

const ReadToolBlock = ({ input }: ReadToolBlockProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!input) {
    return null;
  }

  let filePath =
    (input.file_path as string | undefined) ??
    (input.target_file as string | undefined) ??
    (input.path as string | undefined);

  if (!filePath && input.command) {
    const workdir = (input.workdir as string | undefined) ?? undefined;
    filePath = extractFilePathFromCommand(input.command as string, workdir);
  }

  const cleanFileName = getFileName(filePath)?.replace(/:\d+(-\d+)?$/, '') || '';
  const fileName = getFileName(filePath);

  let lineInfo = '';

  if (typeof input.offset === 'number' && typeof input.limit === 'number') {
    const startLine = Number(input.offset) + 1;
    const endLine = Number(input.offset) + Number(input.limit);
    lineInfo = `Lines ${startLine}-${endLine}`;
  } else if (filePath && /:\d+(-\d+)?$/.test(filePath)) {
    const match = filePath.match(/:(\d+)(?:-(\d+))?$/);
    if (match) {
      const startLine = match[1];
      const endLine = match[2];
      if (endLine) {
        lineInfo = `Lines ${startLine}-${endLine}`;
      } else {
        lineInfo = `Line ${startLine}`;
      }
    }
  }

  const isDirectory = filePath === '.' || filePath === '..' || filePath?.endsWith('/');
  const iconClass = isDirectory ? 'codicon-folder' : 'codicon-file-code';
  const actionText = isDirectory ? 'Read Directory' : 'Read File';

  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (filePath && !isDirectory) {
      openFile(filePath);
    }
  };

  const getFileIconSvg = (path?: string) => {
    if (!path) return '';
    const name = getFileName(path);

    if (isDirectory) {
      return getFolderIcon(cleanFileName);
    } else {
      const cleanName = name.replace(/:\d+(-\d+)?$/, '');
      const extension = cleanName.indexOf('.') !== -1 ? cleanName.split('.').pop() : '';
      return getFileIcon(extension, cleanName);
    }
  };

  const params = Object.entries(input).filter(([key]) =>
    key !== 'file_path' &&
    key !== 'target_file' &&
    key !== 'path' &&
    key !== 'command' &&
    key !== 'workdir' &&
    key !== 'description'
  );

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          borderBottom: expanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${iconClass} tool-title-icon`} />

          <span className="tool-title-text">
            {actionText}
          </span>
          <span
            className={`tool-title-summary ${!isDirectory ? 'clickable-file' : ''}`}
            onClick={!isDirectory ? handleFileClick : undefined}
            title={!isDirectory ? `Click to open ${filePath}` : undefined}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <span
              style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '16px', height: '16px' }}
              dangerouslySetInnerHTML={{ __html: getFileIconSvg(filePath) }}
            />
            {cleanFileName || fileName || filePath}
          </span>

          {lineInfo && (
            <span className="tool-title-summary" style={{ marginLeft: '8px', fontSize: '12px' }}>
              {lineInfo}
            </span>
          )}
        </div>

        <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-success)',
            marginRight: '4px'
        }} />
      </div>

      {expanded && params.length > 0 && (
        <div className="task-details" style={{ padding: '12px', border: 'none' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontFamily: 'var(--idea-editor-font-family, monospace)',
              fontSize: '12px',
            }}
          >
            {params.map(([key, value]) => (
              <div
                key={key}
                style={{
                  color: '#858585',
                  display: 'flex',
                  alignItems: 'baseline',
                  overflow: 'hidden'
                }}
              >
                <span style={{ color: '#90caf9', fontWeight: 600, flexShrink: 0 }}>{key}: </span>
                <span
                  style={{
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}
                >
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadToolBlock;
