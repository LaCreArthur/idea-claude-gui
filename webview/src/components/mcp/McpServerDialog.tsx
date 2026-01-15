import { useState, useEffect, useRef, useCallback } from 'react';
import type { McpServer, McpServerSpec } from '../../types/mcp';

interface McpServerDialogProps {
  server?: McpServer | null;
  existingIds?: string[];
  onClose: () => void;
  onSave: (server: McpServer) => void;
}

/**
 * MCP Server Configuration Dialog (Add/Edit)
 */
export function McpServerDialog({ server, existingIds = [], onClose, onSave }: McpServerDialogProps) {
  const [saving, setSaving] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [parseError, setParseError] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Example placeholder
  const placeholder = `// Example:
// {
//   "mcpServers": {
//     "example-server": {
//       "command": "npx",
//       "args": [
//         "-y",
//         "mcp-server-example"
//       ]
//     }
//   }
// }`;

  // Calculate line count
  const lineCount = Math.max((jsonContent || placeholder).split('\n').length, 12);

  // Validate JSON
  const isValid = useCallback(() => {
    if (!jsonContent.trim()) return false;

    // Remove comment lines
    const cleanedContent = jsonContent
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    if (!cleanedContent.trim()) return false;

    try {
      const parsed = JSON.parse(cleanedContent);
      // Validate structure
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        return Object.keys(parsed.mcpServers).length > 0;
      }
      // Direct server config (has command or url)
      if (parsed.command || parsed.url) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [jsonContent]);

  // Handle input
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonContent(e.target.value);
    setParseError('');
  };

  // Handle Tab key
  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = editorRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      setJsonContent(value.substring(0, start) + '  ' + value.substring(end));

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Parse JSON config
  const parseConfig = (): McpServer[] | null => {
    try {
      // Remove comment lines
      const cleanedContent = jsonContent
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');

      const parsed = JSON.parse(cleanedContent);
      const servers: McpServer[] = [];

      // mcpServers format
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        for (const [id, config] of Object.entries(parsed.mcpServers)) {
          // Check if ID already exists (except in edit mode)
          if (!server && existingIds.includes(id)) {
            setParseError(`Server ID "${id}" already exists`);
            return null;
          }

          const serverConfig = config as any;
          const newServer: McpServer = {
            id,
            name: serverConfig.name || id,
            server: {
              type: serverConfig.type || (serverConfig.command ? 'stdio' : serverConfig.url ? 'http' : 'stdio'),
              command: serverConfig.command,
              args: serverConfig.args,
              env: serverConfig.env,
              url: serverConfig.url,
              headers: serverConfig.headers,
            } as McpServerSpec,
            apps: {
              claude: true,
            },
            enabled: true,
          };
          servers.push(newServer);
        }
      }
      // Direct server config format
      else if (parsed.command || parsed.url) {
        const id = `server-${Date.now()}`;
        const newServer: McpServer = {
          id,
          name: parsed.name || id,
          server: {
            type: parsed.type || (parsed.command ? 'stdio' : 'http'),
            command: parsed.command,
            args: parsed.args,
            env: parsed.env,
            url: parsed.url,
            headers: parsed.headers,
          } as McpServerSpec,
          apps: {
            claude: true,
          },
          enabled: true,
        };
        servers.push(newServer);
      }

      if (servers.length === 0) {
        setParseError('Unrecognized configuration format');
        return null;
      }

      return servers;
    } catch (e) {
      setParseError(`JSON parse error: ${(e as Error).message}`);
      return null;
    }
  };

  // Confirm save
  const handleConfirm = async () => {
    const servers = parseConfig();
    if (!servers) return;

    setSaving(true);
    try {
      // Save servers one by one
      for (const srv of servers) {
        onSave(srv);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Initialize edit mode
  useEffect(() => {
    if (server) {
      // Edit mode: convert to JSON format
      const config: any = {
        mcpServers: {
          [server.id]: {
            ...server.server,
          },
        },
      };
      setJsonContent(JSON.stringify(config, null, 2));
    }
  }, [server]);

  // Click overlay to close
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog mcp-server-dialog">
        <div className="dialog-header">
          <h3>{server ? 'Edit Server' : 'Manual Configuration'}</h3>
          <div className="header-actions">
            <button className="mode-btn active">
              Raw Configuration (JSON)
            </button>
            <button className="close-btn" onClick={onClose}>
              <span className="codicon codicon-close"></span>
            </button>
          </div>
        </div>

        <div className="dialog-body">
          <p className="dialog-desc">
            Enter MCP Servers configuration JSON (prefer NPX or UVX configuration)
          </p>

          <div className="json-editor">
            <div className="line-numbers">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1} className="line-num">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={editorRef}
              value={jsonContent}
              className="json-textarea"
              placeholder={placeholder}
              spellCheck="false"
              onChange={handleInput}
              onKeyDown={handleTab}
            />
          </div>

          {parseError && (
            <div className="error-message">
              <span className="codicon codicon-error"></span>
              {parseError}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <div className="footer-hint">
            <span className="codicon codicon-info"></span>
            Please verify the source and assess risks before configuration
          </div>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!isValid() || saving}
            >
              {saving && <span className="codicon codicon-loading codicon-modifier-spin"></span>}
              {saving ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
