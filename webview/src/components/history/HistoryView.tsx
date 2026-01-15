import { useEffect, useMemo, useState } from 'react';
import type { HistoryData, HistorySessionSummary } from '../../types';
import VirtualList from './VirtualList';
import { Claude } from '@lobehub/icons';

interface HistoryViewProps {
  historyData: HistoryData | null;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string, title: string) => void;
  onToggleFavorite: (sessionId: string) => void;
  onUpdateTitle: (sessionId: string, newTitle: string) => void;
}

const formatTimeAgo = (timestamp: string | undefined) => {
  if (!timestamp) {
    return '';
  }
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, 'years ago'],
    [2592000, 'months ago'],
    [86400, 'days ago'],
    [3600, 'hours ago'],
    [60, 'minutes ago'],
  ];

  for (const [unitSeconds, label] of units) {
    const interval = Math.floor(seconds / unitSeconds);
    if (interval >= 1) {
      return `${interval} ${label}`;
    }
  }
  return `${Math.max(seconds, 1)} seconds ago`;
};

const HistoryView = ({ historyData, onLoadSession, onDeleteSession, onExportSession, onToggleFavorite, onUpdateTitle }: HistoryViewProps) => {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight || 600);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight || 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const sessions = useMemo(() => {
    const rawSessions = historyData?.sessions ?? [];

    const filteredSessions = searchQuery.trim()
      ? rawSessions.filter(s =>
          s.title?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : rawSessions;

    const favorited = filteredSessions.filter(s => s.isFavorited);
    const unfavorited = filteredSessions.filter(s => !s.isFavorited);

    favorited.sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));

    return [...favorited, ...unfavorited];
  }, [historyData?.sessions, searchQuery]);

  const infoBar = useMemo(() => {
    if (!historyData) {
      return '';
    }
    const sessionCount = sessions.length;
    const messageCount = historyData.total ?? 0;
    return `${sessionCount} sessions · ${messageCount} messages`;
  }, [historyData, sessions.length]);

  if (!historyData) {
    return (
      <div className="messages-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#858585' }}>
          <div style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 16px',
            border: '4px solid rgba(133, 133, 133, 0.2)',
            borderTop: '4px solid #858585',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <div>Loading history...</div>
        </div>
      </div>
    );
  }

  if (!historyData.success) {
    return (
      <div className="messages-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#858585' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <div>{historyData.error ?? 'Load failed'}</div>
        </div>
      </div>
    );
  }

  const renderEmptyState = () => {
    if (searchQuery.trim() && sessions.length === 0) {
      return (
        <div className="messages-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: '#858585' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <div>No matching sessions found</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>Try different search keywords</div>
          </div>
        </div>
      );
    }

    if (!searchQuery.trim() && sessions.length === 0) {
      return (
        <div className="messages-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: '#858585' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
            <div>No history sessions</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>No Claude session records found in current project</div>
          </div>
        </div>
      );
    }

    return null;
  };

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingSessionId(sessionId);
  };

  const handleExportClick = (e: React.MouseEvent, sessionId: string, title: string) => {
    e.stopPropagation();
    onExportSession(sessionId, title);
  };

  const handleFavoriteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    onToggleFavorite(sessionId);
  };

  const confirmDelete = () => {
    if (deletingSessionId) {
      onDeleteSession(deletingSessionId);
      setDeletingSessionId(null);
    }
  };

  const cancelDelete = () => {
    setDeletingSessionId(null);
  };

  const handleEditClick = (e: React.MouseEvent, sessionId: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleSaveTitle = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const trimmedTitle = editingTitle.trim();

    if (!trimmedTitle) {
      return;
    }

    if (trimmedTitle.length > 50) {
      alert('Title too long (max 50 characters)');
      return;
    }

    onUpdateTitle(sessionId, trimmedTitle);

    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) {
      return <span>{text}</span>;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
      return <span>{text}</span>;
    }

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return (
      <span>
        {before}
        <mark style={{ backgroundColor: '#ffd700', color: '#000', padding: '0 2px' }}>{match}</mark>
        {after}
      </span>
    );
  };

  const renderHistoryItem = (session: HistorySessionSummary) => {
    const isEditing = editingSessionId === session.sessionId;

    return (
      <div key={session.sessionId} className="history-item" onClick={() => !isEditing && onLoadSession(session.sessionId)}>
        <div className="history-item-header">
          <div className="history-item-title">
            <span
              className="history-provider-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginRight: '8px',
                verticalAlign: 'middle'
              }}
              title="Claude"
            >
              <Claude.Color size={20} />
            </span>
            {isEditing ? (
              <div className="history-title-edit-mode" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="history-title-input"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  maxLength={50}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveTitle(e as unknown as React.MouseEvent, session.sessionId);
                    } else if (e.key === 'Escape') {
                      handleCancelEdit(e as unknown as React.MouseEvent);
                    }
                  }}
                />
                <button
                  className="history-title-save-btn"
                  onClick={(e) => handleSaveTitle(e, session.sessionId)}
                  title="Save"
                >
                  <span className="codicon codicon-check"></span>
                </button>
                <button
                  className="history-title-cancel-btn"
                  onClick={(e) => handleCancelEdit(e)}
                  title="Cancel"
                >
                  <span className="codicon codicon-close"></span>
                </button>
              </div>
            ) : (
              highlightText(session.title, searchQuery)
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="history-item-time">{formatTimeAgo(session.lastTimestamp)}</div>
            {!isEditing && (
              <>
                <button
                  className="history-edit-btn"
                  onClick={(e) => handleEditClick(e, session.sessionId, session.title)}
                  title="Edit title"
                  aria-label="Edit title"
                >
                  <span className="codicon codicon-edit"></span>
                </button>
                <button
                  className={`history-favorite-btn ${session.isFavorited ? 'favorited' : ''}`}
                  onClick={(e) => handleFavoriteClick(e, session.sessionId)}
                  title={session.isFavorited ? 'Unfavorite session' : 'Favorite session'}
                  aria-label={session.isFavorited ? 'Unfavorite session' : 'Favorite session'}
                >
                  <span className={session.isFavorited ? 'codicon codicon-star-full' : 'codicon codicon-star-empty'}></span>
                </button>
                <button
                  className="history-export-btn"
                  onClick={(e) => handleExportClick(e, session.sessionId, session.title)}
                  title="Export session"
                  aria-label="Export session"
                >
                  <span className="codicon codicon-arrow-down"></span>
                </button>
                <button
                  className="history-delete-btn"
                  onClick={(e) => handleDeleteClick(e, session.sessionId)}
                  title="Delete this session"
                  aria-label="Delete this session"
                >
                  <span className="codicon codicon-trash"></span>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="history-item-meta">
          <span>{session.messageCount} messages</span>
          <span style={{ fontFamily: 'var(--idea-editor-font-family, monospace)', color: '#666' }}>{session.sessionId.slice(0, 8)}</span>
        </div>
      </div>
    );
  };

  const listHeight = Math.max(240, viewportHeight - 118);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="history-header">
        <div className="history-info">{infoBar}</div>
        <div className="history-search-container">
          <input
            type="text"
            className="history-search-input"
            placeholder="Search session titles..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <span
            className="codicon codicon-search history-search-icon"
          ></span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {sessions.length > 0 ? (
          <VirtualList
            items={sessions}
            itemHeight={78}
            height={listHeight}
            renderItem={renderHistoryItem}
            getItemKey={(session) => session.sessionId}
            className="messages-container"
          />
        ) : (
          renderEmptyState()
        )}
      </div>

      {deletingSessionId && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete this session? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="modal-btn modal-btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
