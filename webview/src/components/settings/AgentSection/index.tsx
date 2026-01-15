import { useState, useRef, useEffect } from 'react';
import type { AgentConfig } from '../../../types/agent';
import styles from './style.module.less';

interface AgentSectionProps {
  agents: AgentConfig[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (agent: AgentConfig) => void;
  onDelete: (agent: AgentConfig) => void;
}

export default function AgentSection({
  agents,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: AgentSectionProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMenuToggle = (agentId: string) => {
    setOpenMenuId(openMenuId === agentId ? null : agentId);
  };

  const handleEditClick = (agent: AgentConfig) => {
    setOpenMenuId(null);
    onEdit(agent);
  };

  const handleDeleteClick = (agent: AgentConfig) => {
    setOpenMenuId(null);
    onDelete(agent);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <h3 className={styles.title}>Agents</h3>
        </div>
        <button className={styles.addButton} onClick={onAdd}>
          <span className="codicon codicon-add" />
          Create
        </button>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Custom Agents</h4>

        {loading ? (
          <div className={styles.loadingState}>
            <span className="codicon codicon-loading codicon-modifier-spin" />
            <span>Loading...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className={styles.emptyState}>
            <span>No custom agents</span>
            <button className={styles.createLink} onClick={onAdd}>
              Create
            </button>
          </div>
        ) : (
          <div className={styles.agentList}>
            {agents.map((agent) => (
              <div key={agent.id} className={styles.agentCard}>
                <div className={styles.agentIcon}>
                  <span className="codicon codicon-robot" />
                </div>
                <div className={styles.agentInfo}>
                  <div className={styles.agentName}>{agent.name}</div>
                  {agent.prompt && (
                    <div className={styles.agentPrompt} title={agent.prompt}>
                      {agent.prompt.length > 50
                        ? agent.prompt.substring(0, 50) + '...'
                        : agent.prompt}
                    </div>
                  )}
                </div>
                <div className={styles.agentActions} ref={openMenuId === agent.id ? menuRef : null}>
                  <button
                    className={styles.menuButton}
                    onClick={() => handleMenuToggle(agent.id)}
                    title="Menu"
                  >
                    <span className="codicon codicon-kebab-vertical" />
                  </button>
                  {openMenuId === agent.id && (
                    <div className={styles.dropdownMenu}>
                      <button
                        className={styles.menuItem}
                        onClick={() => handleEditClick(agent)}
                      >
                        <span className="codicon codicon-edit" />
                        Edit
                      </button>
                      <button
                        className={`${styles.menuItem} ${styles.danger}`}
                        onClick={() => handleDeleteClick(agent)}
                      >
                        <span className="codicon codicon-trash" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
