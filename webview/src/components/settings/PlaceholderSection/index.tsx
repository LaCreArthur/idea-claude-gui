import { McpSettingsSection } from '../../mcp/McpSettingsSection';
import styles from './style.module.less';

interface PlaceholderSectionProps {
  type: 'permissions' | 'mcp' | 'agents' | 'skills';
}

const sectionConfig = {
  permissions: {
    title: 'Permissions',
    desc: 'Manage Claude Code\'s file access and operation permissions',
    icon: 'codicon-shield',
    message: 'Permissions configuration coming soon...',
  },
  mcp: {
    title: 'MCP Servers',
    desc: 'Configure and manage Model Context Protocol servers',
    icon: 'codicon-server',
    message: null,
  },
  agents: {
    title: 'Agents',
    desc: 'Manage and configure AI agents',
    icon: 'codicon-robot',
    message: 'Agents configuration coming soon...',
  },
  skills: {
    title: 'Skills',
    desc: 'Manage and configure skill modules',
    icon: 'codicon-book',
    message: 'Skills configuration coming soon...',
  },
};

const PlaceholderSection = ({ type }: PlaceholderSectionProps) => {
  const config = sectionConfig[type];

  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>{config.title}</h3>
      <p className={styles.sectionDesc}>{config.desc}</p>

      {type === 'mcp' ? (
        <McpSettingsSection />
      ) : (
        <div className={styles.tempNotice}>
          <span className={`codicon ${config.icon}`} />
          <p>{config.message}</p>
        </div>
      )}
    </div>
  );
};

export default PlaceholderSection;
