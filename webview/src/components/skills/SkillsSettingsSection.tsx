import { useState, useEffect, useRef, useMemo } from 'react';
import type { Skill, SkillsConfig, SkillScope, SkillFilter, SkillEnabledFilter } from '../../types/skill';
import { sendToJava } from '../../utils/bridge';
import { SkillHelpDialog } from './SkillHelpDialog';
import { SkillConfirmDialog } from './SkillConfirmDialog';
import { ToastContainer, type ToastMessage } from '../Toast';

export function SkillsSettingsSection() {
  const [skills, setSkills] = useState<SkillsConfig>({ global: {}, local: {} });
  const [loading, setLoading] = useState(true);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const [showDropdown, setShowDropdown] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<SkillFilter>('all');
  const [enabledFilter, setEnabledFilter] = useState<SkillEnabledFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);

  const [togglingSkills, setTogglingSkills] = useState<Set<string>>(new Set());

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const globalSkillList = useMemo(() => Object.values(skills.global), [skills.global]);
  const localSkillList = useMemo(() => Object.values(skills.local), [skills.local]);
  const allSkillList = useMemo(() => [...globalSkillList, ...localSkillList], [globalSkillList, localSkillList]);

  const filteredSkills = useMemo(() => {
    let list: Skill[] = [];
    if (currentFilter === 'all') {
      list = allSkillList;
    } else if (currentFilter === 'global') {
      list = globalSkillList;
    } else {
      list = localSkillList;
    }

    if (enabledFilter === 'enabled') {
      list = list.filter(s => s.enabled);
    } else if (enabledFilter === 'disabled') {
      list = list.filter(s => !s.enabled);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.path.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      );
    }

    return list.sort((a, b) => {
      if (a.enabled === b.enabled) return 0;
      return a.enabled ? -1 : 1;
    });
  }, [currentFilter, enabledFilter, searchQuery, allSkillList, globalSkillList, localSkillList]);

  const totalCount = allSkillList.length;
  const globalCount = globalSkillList.length;
  const localCount = localSkillList.length;
  const enabledCount = allSkillList.filter(s => s.enabled).length;
  const disabledCount = allSkillList.filter(s => !s.enabled).length;

  const iconColors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B',
    '#EF4444', '#EC4899', '#06B6D4', '#6366F1',
  ];

  const getIconColor = (skillId: string): string => {
    let hash = 0;
    for (let i = 0; i < skillId.length; i++) {
      hash = skillId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return iconColors[Math.abs(hash) % iconColors.length];
  };

  useEffect(() => {
    window.updateSkills = (jsonStr: string) => {
      try {
        const data: SkillsConfig = JSON.parse(jsonStr);
        setSkills(data);
        setLoading(false);
        console.log('[SkillsSettings] Loaded skills:', data);
      } catch (error) {
        console.error('[SkillsSettings] Failed to parse skills:', error);
        setLoading(false);
      }
    };

    window.skillImportResult = (jsonStr: string) => {
      try {
        const result = JSON.parse(jsonStr);
        if (result.success) {
          const count = result.count || 0;
          const total = result.total || 0;
          if (result.errors && result.errors.length > 0) {
            addToast(`Successfully imported ${count}/${total} Skills, some failed`, 'warning');
          } else if (count === 1) {
            addToast('Successfully imported 1 Skill', 'success');
          } else if (count > 1) {
            addToast(`Successfully imported ${count} Skills`, 'success');
          }
          loadSkills();
        } else {
          addToast(result.error || 'Failed to import Skill', 'error');
        }
      } catch (error) {
        console.error('[SkillsSettings] Failed to parse import result:', error);
      }
    };

    window.skillDeleteResult = (jsonStr: string) => {
      try {
        const result = JSON.parse(jsonStr);
        if (result.success) {
          addToast('Successfully deleted Skill', 'success');
          loadSkills();
        } else {
          addToast(result.error || 'Failed to delete Skill', 'error');
        }
      } catch (error) {
        console.error('[SkillsSettings] Failed to parse delete result:', error);
      }
    };

    window.skillToggleResult = (jsonStr: string) => {
      try {
        const result = JSON.parse(jsonStr);
        setTogglingSkills(prev => {
          const newSet = new Set(prev);
          if (result.name) {
            newSet.forEach(id => {
              if (id.includes(result.name)) {
                newSet.delete(id);
              }
            });
          }
          return newSet;
        });

        if (result.success) {
          const action = result.enabled ? 'enabled' : 'disabled';
          addToast(`Successfully ${action} Skill: ${result.name}`, 'success');
          loadSkills();
        } else {
          if (result.conflict) {
            addToast(`Operation failed: ${result.error}`, 'warning');
          } else {
            addToast(result.error || 'Failed to perform Skill operation', 'error');
          }
        }
      } catch (error) {
        console.error('[SkillsSettings] Failed to parse toggle result:', error);
        setTogglingSkills(new Set());
      }
    };

    loadSkills();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);

    return () => {
      window.updateSkills = undefined;
      window.skillImportResult = undefined;
      window.skillDeleteResult = undefined;
      window.skillToggleResult = undefined;
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const loadSkills = () => {
    setLoading(true);
    sendToJava('get_all_skills', {});
  };

  const toggleExpand = (skillId: string) => {
    const newExpanded = new Set<string>();
    if (!expandedSkills.has(skillId)) {
      newExpanded.add(skillId);
    }
    setExpandedSkills(newExpanded);
  };

  const handleRefresh = () => {
    loadSkills();
    addToast('Skills list refreshed', 'success');
  };

  const handleImport = (scope: SkillScope) => {
    setShowDropdown(false);
    sendToJava('import_skill', { scope });
  };

  const handleOpen = (skill: Skill) => {
    sendToJava('open_skill', { path: skill.path });
  };

  const handleDelete = (skill: Skill) => {
    setDeletingSkill(skill);
    setShowConfirmDialog(true);
  };

  const confirmDelete = () => {
    if (deletingSkill) {
      sendToJava('delete_skill', {
        name: deletingSkill.name,
        scope: deletingSkill.scope,
        enabled: deletingSkill.enabled
      });
      setExpandedSkills((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingSkill.id);
        return newSet;
      });
    }
    setShowConfirmDialog(false);
    setDeletingSkill(null);
  };

  const cancelDelete = () => {
    setShowConfirmDialog(false);
    setDeletingSkill(null);
  };

  const handleToggle = (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingSkills.has(skill.id)) return;

    setTogglingSkills(prev => new Set(prev).add(skill.id));
    sendToJava('toggle_skill', {
      name: skill.name,
      scope: skill.scope,
      enabled: skill.enabled
    });
  };

  return (
    <div className="skills-settings-section">
      <div className="skills-toolbar">
        <div className="filter-tabs">
          <div
            className={`tab-item ${currentFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('all')}
          >
            All <span className="count-badge">{totalCount}</span>
          </div>
          <div
            className={`tab-item ${currentFilter === 'global' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('global')}
          >
            Global <span className="count-badge">{globalCount}</span>
          </div>
          <div
            className={`tab-item ${currentFilter === 'local' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('local')}
          >
            Local <span className="count-badge">{localCount}</span>
          </div>
          <div className="filter-separator"></div>
          <div
            className={`tab-item enabled-filter ${enabledFilter === 'enabled' ? 'active' : ''}`}
            onClick={() => setEnabledFilter(enabledFilter === 'enabled' ? 'all' : 'enabled')}
            title="Filter enabled Skills"
          >
            <span className="codicon codicon-check"></span>
            Enabled <span className="count-badge">{enabledCount}</span>
          </div>
          <div
            className={`tab-item enabled-filter ${enabledFilter === 'disabled' ? 'active' : ''}`}
            onClick={() => setEnabledFilter(enabledFilter === 'disabled' ? 'all' : 'disabled')}
            title="Filter disabled Skills"
          >
            <span className="codicon codicon-circle-slash"></span>
            Disabled <span className="count-badge">{disabledCount}</span>
          </div>
        </div>

        <div className="toolbar-right">
          <div className="search-box">
            <span className="codicon codicon-search"></span>
            <input
              type="text"
              className="search-input"
              placeholder="Search Skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className="icon-btn"
            onClick={() => setShowHelpDialog(true)}
            title="What are Skills?"
          >
            <span className="codicon codicon-question"></span>
          </button>

          <div className="add-dropdown" ref={dropdownRef}>
            <button
              className="icon-btn primary"
              onClick={() => setShowDropdown(!showDropdown)}
              title="Import Skill"
            >
              <span className="codicon codicon-add"></span>
            </button>
            {showDropdown && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={() => handleImport('global')}>
                  <span className="codicon codicon-globe"></span>
                  Import to Global
                </div>
                <div className="dropdown-item" onClick={() => handleImport('local')}>
                  <span className="codicon codicon-desktop-download"></span>
                  Import to Project
                </div>
              </div>
            )}
          </div>

          <button
            className="icon-btn"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            <span className={`codicon codicon-refresh ${loading ? 'spinning' : ''}`}></span>
          </button>
        </div>
      </div>

      <div className="skill-list">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className={`skill-card ${expandedSkills.has(skill.id) ? 'expanded' : ''} ${!skill.enabled ? 'disabled' : ''}`}
          >
            <div className="card-header" onClick={() => toggleExpand(skill.id)}>
              <button
                className={`toggle-switch ${skill.enabled ? 'enabled' : 'disabled'} ${togglingSkills.has(skill.id) ? 'loading' : ''}`}
                onClick={(e) => handleToggle(skill, e)}
                disabled={togglingSkills.has(skill.id)}
                title={skill.enabled ? 'Click to disable' : 'Click to enable'}
              >
                {togglingSkills.has(skill.id) ? (
                  <span className="codicon codicon-loading codicon-modifier-spin"></span>
                ) : skill.enabled ? (
                  <span className="codicon codicon-check"></span>
                ) : (
                  <span className="codicon codicon-circle-slash"></span>
                )}
              </button>

              <div className="skill-icon-wrapper" style={{ color: skill.enabled ? getIconColor(skill.id) : 'var(--text-tertiary)' }}>
                <span className="codicon codicon-folder"></span>
              </div>

              <div className="skill-info">
                <div className="skill-header-row">
                  <span className={`skill-name ${!skill.enabled ? 'muted' : ''}`}>{skill.name}</span>
                  <span className={`scope-badge ${skill.scope}`}>
                    <span className={`codicon ${skill.scope === 'global' ? 'codicon-globe' : 'codicon-desktop-download'}`}></span>
                    {skill.scope === 'global' ? 'Global' : 'Local'}
                  </span>
                  {!skill.enabled && (
                    <span className="status-badge disabled">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="skill-path" title={skill.path}>{skill.path}</div>
              </div>

              <div className="expand-indicator">
                <span className={`codicon ${expandedSkills.has(skill.id) ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}></span>
              </div>
            </div>

            {expandedSkills.has(skill.id) && (
              <div className="card-content">
                <div className="info-section">
                  {skill.description ? (
                    <div className="description-container">
                      <div className="description-label">Description:</div>
                      <div className="description-content">{skill.description}</div>
                    </div>
                  ) : (
                    <div className="description-placeholder">No description</div>
                  )}
                </div>

                <div className="actions-section">
                  <button className="action-btn edit-btn" onClick={() => handleOpen(skill)}>
                    <span className="codicon codicon-edit"></span> Edit
                  </button>
                  <button className="action-btn delete-btn" onClick={() => handleDelete(skill)}>
                    <span className="codicon codicon-trash"></span> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredSkills.length === 0 && !loading && (
          <div className="empty-state">
            <span className="codicon codicon-extensions"></span>
            <p>No matching Skills found</p>
            <p className="hint">Click + button to import Skill file or folder</p>
          </div>
        )}

        {loading && filteredSkills.length === 0 && (
          <div className="loading-state">
            <span className="codicon codicon-loading codicon-modifier-spin"></span>
            <p>Loading</p>
          </div>
        )}
      </div>

      {showHelpDialog && (
        <SkillHelpDialog onClose={() => setShowHelpDialog(false)} />
      )}

      {showConfirmDialog && deletingSkill && (
        <SkillConfirmDialog
          title="Delete Skill"
          message={`Are you sure you want to delete ${deletingSkill.scope} Skill "${deletingSkill.name}"?\n\nThis action cannot be undone.`}
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
