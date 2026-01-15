import styles from './style.module.less';

export type SettingsTab = 'basic' | 'providers' | 'dependencies' | 'usage' | 'permissions' | 'mcp' | 'agents' | 'skills' | 'community';

interface SidebarItem {
  key: SettingsTab;
  icon: string;
  label: string;
}

const sidebarItems: SidebarItem[] = [
  { key: 'basic', icon: 'codicon-settings-gear', label: 'Basic Configuration' },
  { key: 'providers', icon: 'codicon-vm-connect', label: 'Provider Management' },
  { key: 'dependencies', icon: 'codicon-extensions', label: 'SDK Dependencies' },
  { key: 'usage', icon: 'codicon-graph', label: 'Usage Statistics' },
  { key: 'mcp', icon: 'codicon-server', label: 'MCP Servers' },
  { key: 'permissions', icon: 'codicon-shield', label: 'Permissions' },
  { key: 'agents', icon: 'codicon-robot', label: 'Agents' },
  { key: 'skills', icon: 'codicon-book', label: 'Skills' },
  { key: 'community', icon: 'codicon-comment-discussion', label: 'Community' },
];

interface SettingsSidebarProps {
  currentTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  disabledTabs?: SettingsTab[];
  onDisabledTabClick?: (tab: SettingsTab) => void;
}

const SettingsSidebar = ({
  currentTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  disabledTabs = [],
  onDisabledTabClick,
}: SettingsSidebarProps) => {
  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.sidebarItems}>
        {sidebarItems.map((item) => {
          const isDisabled = disabledTabs.includes(item.key);
          return (
            <div
              key={item.key}
              className={`${styles.sidebarItem} ${currentTab === item.key ? styles.active : ''} ${isDisabled ? styles.disabled : ''}`}
              onClick={() => {
                if (isDisabled) {
                  onDisabledTabClick?.(item.key);
                  return;
                }
                onTabChange(item.key);
              }}
              title={isCollapsed ? item.label : ''}
              aria-disabled={isDisabled}
            >
              <span className={`codicon ${item.icon}`} />
              <span className={styles.sidebarItemText}>{item.label}</span>
            </div>
          );
        })}
      </div>

      <div
        className={styles.sidebarToggle}
        onClick={onToggleCollapse}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-left'}`} />
      </div>
    </div>
  );
};

export default SettingsSidebar;
