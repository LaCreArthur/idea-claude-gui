export interface McpServerSpec {
  type?: 'stdio' | 'http' | 'sse';

  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;

  url?: string;
  headers?: Record<string, string>;

  [key: string]: any;
}

export interface McpApps {
  claude: boolean;
}

export interface McpServer {
  id: string;
  name?: string;
  server: McpServerSpec;
  apps?: McpApps;
  description?: string;
  tags?: string[];
  homepage?: string;
  docs?: string;
  enabled?: boolean;
  [key: string]: any;
}

export type McpServersMap = Record<string, McpServer>;

export interface McpConfig {
  mcp?: {
    servers?: Record<string, McpServer>;
  };
  claude?: {
    providers?: Record<string, any>;
    current?: string;
  };
  [key: string]: any;
}

export interface ClaudeConfig {
  mcpServers?: Record<string, McpServerSpec>;
  [key: string]: any;
}

export interface McpPreset {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  server: McpServerSpec;
  homepage?: string;
  docs?: string;
}

export type McpServerStatus = 'connected' | 'checking' | 'error' | 'unknown';

export interface McpServerStatusInfo {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  serverInfo?: {
    name: string;
    version: string;
  };
}

export interface McpServerValidationResult {
  valid: boolean;
  serverId?: string;
  errors?: string[];
  warnings?: string[];
}
