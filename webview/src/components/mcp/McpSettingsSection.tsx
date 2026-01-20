import { useState, useEffect, useRef } from 'react';
import type { McpServer, McpPreset, McpServerStatusInfo } from '../../types/mcp';
import { sendToJava } from '../../utils/bridge';
import { McpServerDialog } from './McpServerDialog';
import { McpPresetDialog } from './McpPresetDialog';
import { McpHelpDialog } from './McpHelpDialog';
import { McpConfirmDialog } from './McpConfirmDialog';
import { ToastContainer, type ToastMessage } from '../Toast';
import { copyToClipboard } from '../../utils/copyUtils';

export function McpSettingsSection() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [serverStatus, setServerStatus] = useState<Map<string, McpServerStatusInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const refreshTimersRef = useRef<number[]>([]);

  const [showServerDialog, setShowServerDialog] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [deletingServer, setDeletingServer] = useState<McpServer | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const iconColors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B',
    '#EF4444', '#EC4899', '#06B6D4', '#6366F1',
  ];

  useEffect(() => {
    const clearRefreshTimers = () => {
      refreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      refreshTimersRef.current = [];
    };

    const scheduleRefresh = (enabled: boolean) => {
      clearRefreshTimers();
      const serverRefreshDelays = enabled ? [200, 1000] : [200];
      const statusRefreshDelays = enabled ? [400, 1500, 3500, 7000, 12000] : [400];

      serverRefreshDelays.forEach((delay) => {
        refreshTimersRef.current.push(window.setTimeout(() => loadServers(), delay));
      });
      statusRefreshDelays.forEach((delay) => {
        refreshTimersRef.current.push(window.setTimeout(() => loadServerStatus(), delay));
      });
    };

    window.updateMcpServers = (jsonStr: string) => {
      try {
        const serverList: McpServer[] = JSON.parse(jsonStr);
        setServers(serverList);
        setLoading(false);
        console.log('[McpSettings] Loaded servers:', serverList);
      } catch (error) {
        console.error('[McpSettings] Failed to parse servers:', error);
        setLoading(false);
      }
    };

    window.updateMcpServerStatus = (jsonStr: string) => {
      try {
        const statusList: McpServerStatusInfo[] = JSON.parse(jsonStr);
        const statusMap = new Map<string, McpServerStatusInfo>();
        statusList.forEach((status) => {
          statusMap.set(status.name, status);
        });
        setServerStatus(statusMap);
        setStatusLoading(false);
        console.log('[McpSettings] Loaded server status:', statusList);
      } catch (error) {
        console.error('[McpSettings] Failed to parse server status:', error);
        setStatusLoading(false);
      }
    };

    window.mcpServerToggled = (jsonStr: string) => {
      try {
        const toggledServer: McpServer = JSON.parse(jsonStr);
        scheduleRefresh(isServerEnabled(toggledServer));
      } catch (error) {
        console.error('[McpSettings] Failed to parse toggled server:', error);
      }
    };

    loadServers();
    loadServerStatus();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);

    return () => {
      clearRefreshTimers();
      window.updateMcpServers = undefined;
      window.updateMcpServerStatus = undefined;
      window.mcpServerToggled = undefined;
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const loadServers = () => {
    setLoading(true);
    sendToJava('get_mcp_servers', {});
  };

  const loadServerStatus = () => {
    setStatusLoading(true);
    sendToJava('get_mcp_server_status', {});
  };

  const getServerStatusInfo = (server: McpServer): McpServerStatusInfo | undefined => {
    let statusInfo = serverStatus.get(server.id);
    if (statusInfo) return statusInfo;

    if (server.name) {
      statusInfo = serverStatus.get(server.name);
      if (statusInfo) return statusInfo;
    }

    for (const [key, value] of serverStatus.entries()) {
      if (key.toLowerCase() === server.id.toLowerCase() ||
          (server.name && key.toLowerCase() === server.name.toLowerCase())) {
        return value;
      }
    }

    return undefined;
  };

  const getStatusIcon = (server: McpServer, status: McpServerStatusInfo['status'] | undefined): string => {
    if (!isServerEnabled(server)) {
      return 'codicon-circle-slash';
    }
    switch (status) {
      case 'connected': return 'codicon-check';
      case 'failed': return 'codicon-error';
      case 'needs-auth': return 'codicon-key';
      case 'pending': return 'codicon-loading codicon-modifier-spin';
      default: return 'codicon-circle-outline';
    }
  };

  const getStatusColor = (server: McpServer, status: McpServerStatusInfo['status'] | undefined): string => {
    if (!isServerEnabled(server)) {
      return '#9CA3AF';
    }
    switch (status) {
      case 'connected': return '#10B981';
      case 'failed': return '#EF4444';
      case 'needs-auth': return '#F59E0B';
      case 'pending': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusText = (server: McpServer, status: McpServerStatusInfo['status'] | undefined): string => {
    if (!isServerEnabled(server)) {
      return 'Disabled';
    }
    switch (status) {
      case 'connected': return 'Connected';
      case 'failed': return 'Connection Failed';
      case 'needs-auth': return 'Needs Authentication';
      case 'pending': return 'Connecting...';
      default: return 'Unknown';
    }
  };

  const getIconColor = (serverId: string): string => {
    let hash = 0;
    for (let i = 0; i < serverId.length; i++) {
      hash = serverId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return iconColors[Math.abs(hash) % iconColors.length];
  };

  const getServerInitial = (server: McpServer): string => {
    const name = server.name || server.id;
    return name.charAt(0).toUpperCase();
  };

  const isServerEnabled = (server: McpServer): boolean => {
    if (server.enabled !== undefined) {
      return server.enabled;
    }
    return server.apps?.claude !== false;
  };

  const toggleExpand = (serverId: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  const handleRefresh = () => {
    loadServers();
    loadServerStatus();
  };

  const handleToggleServer = (server: McpServer, enabled: boolean) => {
    const updatedServer: McpServer = {
      ...server,
      enabled,
      apps: {
        claude: enabled,
      }
    };

    sendToJava('toggle_mcp_server', updatedServer);

    const serverName = server.name || server.id;
    const statusText = enabled ? 'Enabled' : 'Disabled';
    addToast(`${statusText}: ${serverName}`, 'success');
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setShowServerDialog(true);
  };

  const handleDelete = (server: McpServer) => {
    setDeletingServer(server);
    setShowConfirmDialog(true);
  };

  const confirmDelete = () => {
    if (deletingServer) {
      sendToJava('delete_mcp_server', { id: deletingServer.id });
      addToast(`Deleted ${deletingServer.name || deletingServer.id}`, 'success');

      setTimeout(() => {
        loadServers();
      }, 100);
    }
    setShowConfirmDialog(false);
    setDeletingServer(null);
  };

  const cancelDelete = () => {
    setShowConfirmDialog(false);
    setDeletingServer(null);
  };

  const handleAddManual = () => {
    setShowDropdown(false);
    setEditingServer(null);
    setShowServerDialog(true);
  };

  const handleAddFromMarket = () => {
    setShowDropdown(false);
    alert('MCP market feature not yet implemented, coming soon');
  };

  const handleSaveServer = (server: McpServer) => {
    if (editingServer) {
      if (editingServer.id !== server.id) {
        sendToJava('delete_mcp_server', { id: editingServer.id });
        sendToJava('add_mcp_server', server);
        addToast(`Updated ${server.name || server.id}`, 'success');
      } else {
        sendToJava('update_mcp_server', server);
        addToast(`Saved ${server.name || server.id}`, 'success');
      }
    } else {
      sendToJava('add_mcp_server', server);
      addToast(`Added ${server.name || server.id}`, 'success');
    }

    setTimeout(() => {
      loadServers();
    }, 100);

    setShowServerDialog(false);
    setEditingServer(null);
  };

  const handleSelectPreset = (preset: McpPreset) => {
    const server: McpServer = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      tags: preset.tags,
      server: { ...preset.server },
      apps: {
        claude: true,
      },
      homepage: preset.homepage,
      docs: preset.docs,
      enabled: true,
    };
    sendToJava('add_mcp_server', server);
    addToast(`Added ${preset.name}`, 'success');

    setTimeout(() => {
      loadServers();
    }, 100);

    setShowPresetDialog(false);
  };

  const handleCopyUrl = async (url: string) => {
    const success = await copyToClipboard(url);
    if (success) {
      addToast('Link copied, please open in browser', 'success');
    } else {
      addToast('Copy failed, please copy manually', 'error');
    }
  };

  return (
    <div className="mcp-settings-section">
      <div className="mcp-header">
        <div className="header-left">
          <span className="header-title">MCP Servers</span>
          <button
            className="help-btn"
            onClick={() => setShowHelpDialog(true)}
            title="What is MCP?"
          >
            <span className="codicon codicon-question"></span>
          </button>
        </div>
        <div className="header-right">
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={loading || statusLoading}
            title="Refresh server status"
          >
            <span className={`codicon codicon-refresh ${loading || statusLoading ? 'spinning' : ''}`}></span>
          </button>
          <div className="add-dropdown" ref={dropdownRef}>
            <button className="add-btn" onClick={() => setShowDropdown(!showDropdown)}>
              <span className="codicon codicon-add"></span>
              Add
              <span className="codicon codicon-chevron-down"></span>
            </button>
            {showDropdown && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={handleAddManual}>
                  <span className="codicon codicon-json"></span>
                  Manual config
                </div>
                <div className="dropdown-item" onClick={handleAddFromMarket}>
                  <span className="codicon codicon-extensions"></span>
                  Add from MCP market
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!loading || servers.length > 0 ? (
        <div className="server-list">
          {servers.map(server => (
            <div
              key={server.id}
              className={`server-card ${expandedServers.has(server.id) ? 'expanded' : ''} ${!isServerEnabled(server) ? 'disabled' : ''}`}
            >
              <div className="card-header" onClick={() => toggleExpand(server.id)}>
                <div className="header-left-section">
                  <span className={`expand-icon codicon ${expandedServers.has(server.id) ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}></span>
                  <div className="server-icon" style={{ background: getIconColor(server.id) }}>
                    {getServerInitial(server)}
                  </div>
                  <span className="server-name">{server.name || server.id}</span>
                  {(() => {
                    const statusInfo = getServerStatusInfo(server);
                    const status = statusInfo?.status;
                    return (
                      <span
                        className="status-indicator"
                        style={{ color: getStatusColor(server, status) }}
                        title={getStatusText(server, status)}
                      >
                        <span className={`codicon ${getStatusIcon(server, status)}`}></span>
                      </span>
                    );
                  })()}
                </div>
                <div className="header-right-section" onClick={(e) => e.stopPropagation()}>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isServerEnabled(server)}
                      onChange={(e) => handleToggleServer(server, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              {expandedServers.has(server.id) && (
                <div className="card-content">
                  {(() => {
                    const statusInfo = getServerStatusInfo(server);
                    return (
                      <div className="status-section">
                        <div className="info-row">
                          <span className="info-label">Connection Status:</span>
                          <span
                            className="info-value status-value"
                            style={{ color: getStatusColor(server, statusInfo?.status) }}
                          >
                            <span className={`codicon ${getStatusIcon(server, statusInfo?.status)}`}></span>
                            {' '}{getStatusText(server, statusInfo?.status)}
                          </span>
                        </div>
                        {statusInfo?.serverInfo && (
                          <div className="info-row">
                            <span className="info-label">Server Version:</span>
                            <span className="info-value">
                              {statusInfo.serverInfo.name} v{statusInfo.serverInfo.version}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                   <div className="info-section">
                     {server.description && (
                       <div className="info-row">
                         <span className="info-label">Description:</span>
                         <span className="info-value">{server.description}</span>
                       </div>
                     )}
                     {server.server.command && (
                       <div className="info-row">
                         <span className="info-label">Command:</span>
                         <code className="info-value command">
                           {server.server.command} {(server.server.args || []).join(' ')}
                         </code>
                       </div>
                     )}
                     {server.server.url && (
                       <div className="info-row">
                         <span className="info-label">URL:</span>
                         <code className="info-value command">{server.server.url}</code>
                       </div>
                     )}
                   </div>

                  {server.tags && server.tags.length > 0 && (
                    <div className="tags-section">
                      {server.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="actions-section">
                    {server.homepage && (
                      <button
                        className="action-btn"
                        onClick={() => handleCopyUrl(server.homepage!)}
                        title="Copy homepage link"
                      >
                        <span className="codicon codicon-home"></span>
                        Homepage
                      </button>
                    )}
                    {server.docs && (
                      <button
                        className="action-btn"
                        onClick={() => handleCopyUrl(server.docs!)}
                        title="Copy docs link"
                      >
                        <span className="codicon codicon-book"></span>
                        Docs
                      </button>
                    )}
                    <button
                      className="action-btn edit-btn"
                      onClick={() => handleEdit(server)}
                      title="Edit config"
                    >
                      <span className="codicon codicon-edit"></span>
                      Edit
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(server)}
                      title="Delete server"
                    >
                      <span className="codicon codicon-trash"></span>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {servers.length === 0 && !loading && (
            <div className="empty-state">
              <span className="codicon codicon-server"></span>
              <p>No MCP servers</p>
              <p className="hint">Click 'Add' button to add a server</p>
            </div>
          )}
        </div>
      ) : null}

      {loading && servers.length === 0 && (
        <div className="loading-state">
          <span className="codicon codicon-loading codicon-modifier-spin"></span>
          <p>Loading...</p>
        </div>
      )}

      {showServerDialog && (
        <McpServerDialog
          server={editingServer}
          existingIds={servers.map(s => s.id)}
          onClose={() => {
            setShowServerDialog(false);
            setEditingServer(null);
          }}
          onSave={handleSaveServer}
        />
      )}

      {showPresetDialog && (
        <McpPresetDialog
          onClose={() => setShowPresetDialog(false)}
          onSelect={handleSelectPreset}
        />
      )}

      {showHelpDialog && (
        <McpHelpDialog onClose={() => setShowHelpDialog(false)} />
      )}

      {showConfirmDialog && deletingServer && (
        <McpConfirmDialog
          title="Delete MCP server"
          message={`Are you sure you want to delete server "${deletingServer.name || deletingServer.id}"?\n\nThis action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}
