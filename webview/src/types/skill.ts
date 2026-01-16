export type SkillType = 'file' | 'directory';

export type SkillScope = 'global' | 'local';

export interface Skill {
  id: string;
  name: string;
  type: SkillType;
  scope: SkillScope;
  path: string;
  enabled: boolean;
  description?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export type SkillsMap = Record<string, Skill>;

export interface SkillsConfig {
  global: SkillsMap;
  local: SkillsMap;
}

export type SkillFilter = 'all' | 'global' | 'local';

export type SkillEnabledFilter = 'all' | 'enabled' | 'disabled';
