import { useState } from 'react';
import type { ToolInput, ToolResultBlock } from '../../types';
import { openFile } from '../../utils/bridge';
import { formatParamValue, getFileName, truncate } from '../../utils/helpers';
import { getFileIcon, getFolderIcon } from '../../utils/fileIcons';

const CODICON_MAP: Record<string, string> = {
  read: 'codicon-eye',
  edit: 'codicon-edit',
  write: 'codicon-pencil',
  bash: 'codicon-terminal',
  grep: 'codicon-search',
  glob: 'codicon-folder',
  task: 'codicon-tools',
  webfetch: 'codicon-globe',
  websearch: 'codicon-search',
  delete: 'codicon-trash',
  augmentcontextengine: 'codicon-symbol-class',
  update_plan: 'codicon-checklist',
  shell_command: 'codicon-terminal',
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'augmentcontextengine': 'Context Engine',
  'task': 'Task',
  'read': 'Read File',
  'read_file': 'Read File',
  'edit': 'Edit File',
  'edit_file': 'Edit File',
  'write': 'Write File',
  'write_to_file': 'Write File',
  'replace_string': 'Replace String',
  'bash': 'Run Command',
  'run_terminal_cmd': 'Run Command',
  'execute_command': 'Execute Command',
  'executecommand': 'Execute Command',
  'shell_command': 'Run Command',
  'grep': 'Search',
  'glob': 'File Match',
  'webfetch': 'Web Fetch',
  'websearch': 'Web Search',
  'delete': 'Delete',
  'explore': 'Explore',
  'createdirectory': 'Create Directory',
  'movefile': 'Move File',
  'copyfile': 'Copy File',
  'list': 'List Files',
  'search': 'Search',
  'find': 'Find File',
  'todowrite': 'Todo List',
  'update_plan': 'Update Plan',
};

const isFileViewingCommand = (command?: string): boolean => {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();
  return /^(pwd|ls|cat|head|tail|tree|file|stat)\b/.test(trimmed) ||
         /^sed\s+-n\s+/.test(trimmed);
};

const getToolDisplayName = (name?: string, input?: ToolInput) => {
  if (!name) {
    return 'Tool Call';
  }

  const lowerName = name.toLowerCase();

  if (lowerName === 'shell_command' && input?.command) {
    if (isFileViewingCommand(input.command as string)) {
      return 'Read File';
    }
  }

  if (TOOL_DISPLAY_NAMES[lowerName]) {
    return TOOL_DISPLAY_NAMES[lowerName];
  }

  if (name.includes('_')) {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  if (/^[A-Z]/.test(name)) {
    return name.replace(/([A-Z])/g, ' $1').trim();
  }

  return name;
};

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

const pickFilePath = (input: ToolInput, name?: string) => {
  const standardPath = (input.file_path as string | undefined) ??
    (input.path as string | undefined) ??
    (input.target_file as string | undefined) ??
    (input.notebook_path as string | undefined);

  if (standardPath) return standardPath;

  const lowerName = (name ?? '').toLowerCase();
  if ((lowerName === 'read' || lowerName === 'shell_command') && input.command) {
    const workdir = (input.workdir as string | undefined) ?? undefined;
    return extractFilePathFromCommand(input.command as string, workdir);
  }

  return undefined;
};

const omitFields = new Set([
  'file_path',
  'path',
  'target_file',
  'notebook_path',
  'command',
  'search_term',
  'description',
  'workdir',
]);

interface GenericToolBlockProps {
  name?: string;
  input?: ToolInput;
  result?: ToolResultBlock | null;
}

const GenericToolBlock = ({ name, input, result }: GenericToolBlockProps) => {
  const lowerName = (name ?? '').toLowerCase();
  const isMcpTool = lowerName.startsWith('mcp__');
  const isCollapsible = ['grep', 'glob', 'write', 'save-file', 'askuserquestion', 'update_plan', 'shell_command'].includes(lowerName) || isMcpTool;
  const [expanded, setExpanded] = useState(false);

  const filePath = input ? pickFilePath(input, name) : undefined;

  const isCompleted = result !== undefined && result !== null;
  const isError = isCompleted && result?.is_error === true;

  if (!input) {
    return null;
  }

  const displayName = getToolDisplayName(name, input);
  const codicon = CODICON_MAP[(name ?? '').toLowerCase()] ?? 'codicon-tools';

  let summary: string | null = null;
  if (filePath) {
    summary = getFileName(filePath);
  } else if (typeof input.command === 'string') {
    summary = truncate(input.command);
  } else if (typeof input.search_term === 'string') {
    summary = truncate(input.search_term);
  } else if (typeof input.pattern === 'string') {
    summary = truncate(input.pattern);
  }

  const otherParams = Object.entries(input).filter(
    ([key]) => !omitFields.has(key) && key !== 'pattern',
  );

  const shouldShowDetails = otherParams.length > 0 && (!isCollapsible || expanded);

  const isSpecialFile = (fileName: string): boolean => {
    const specialFiles = [
      'makefile', 'dockerfile', 'jenkinsfile', 'vagrantfile',
      'gemfile', 'rakefile', 'procfile', 'guardfile',
      'license', 'licence', 'readme', 'changelog',
      'gradlew', 'cname', 'authors', 'contributors'
    ];
    return specialFiles.includes(fileName.toLowerCase());
  };

  const fileName = filePath ? getFileName(filePath) : '';
  const cleanFileName = fileName.replace(/:\d+(-\d+)?$/, '');
  const isDirectoryPath = filePath && (
    filePath.endsWith('/') ||
    filePath === '.' ||
    filePath === '..' ||
    (!cleanFileName.includes('.') && !isSpecialFile(cleanFileName))
  );
  const isFilePath = filePath && !isDirectoryPath;

  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFilePath) {
      openFile(filePath);
    }
  };

  const getFileIconSvg = (path?: string) => {
    if (!path) return '';
    const name = getFileName(path);

    if (isDirectoryPath) {
      return getFolderIcon(name);
    } else {
      const cleanName = name.replace(/:\d+(-\d+)?$/, '');
      const extension = cleanName.indexOf('.') !== -1 ? cleanName.split('.').pop() : '';
      return getFileIcon(extension, cleanName);
    }
  };

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={isCollapsible ? () => setExpanded((prev) => !prev) : undefined}
        style={{
          cursor: isCollapsible ? 'pointer' : 'default',
          borderBottom: expanded && isCollapsible ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${codicon} tool-title-icon`} />

          <span className="tool-title-text">
            {displayName}
          </span>
          {summary && (
              <span
                className={`task-summary-text tool-title-summary ${isFilePath ? 'clickable-file' : ''}`}
                title={isFilePath ? `Click to open ${filePath}` : summary}
                onClick={isFilePath ? handleFileClick : undefined}
                style={(isFilePath || isDirectoryPath) ? {
                  display: 'inline-flex',
                  alignItems: 'center',
                  maxWidth: 'fit-content'
                } : undefined}
              >
                {(isFilePath || isDirectoryPath) && (
                   <span
                      style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '16px', height: '16px' }}
                      dangerouslySetInnerHTML={{ __html: getFileIconSvg(filePath) }}
                   />
                )}
                {summary}
              </span>
            )}
        </div>

        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>
      {shouldShowDetails && (
        <div className="task-details">
          <div className="task-content-wrapper">
            {otherParams.map(([key, value]) => (
              <div key={key} className="task-field">
                <div className="task-field-label">{key}</div>
                <div className="task-field-content">{formatParamValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GenericToolBlock;
