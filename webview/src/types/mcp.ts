/**
 * MCP (Model Context Protocol) type definitions
 *
 * MCP is Anthropic's standard protocol for AI models to communicate with external tools and data sources.
 */

/**
 * MCP 服务器连接规格
 * 支持三种连接方式: stdio, http, sse
 */
export interface McpServerSpec {
  /** 连接类型,默认为 stdio */
  type?: 'stdio' | 'http' | 'sse';

  // stdio 类型字段
  /** 执行命令 (stdio 类型必需) */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;

  // http/sse 类型字段
  /** 服务器 URL (http/sse 类型必需) */
  url?: string;
  /** 请求头 */
  headers?: Record<string, string>;

  /** 允许扩展字段 */
  [key: string]: any;
}

/**
 * MCP app enable status
 * Marks which clients the server applies to
 */
export interface McpApps {
  claude: boolean;
}

/**
 * MCP 服务器完整配置
 */
export interface McpServer {
  /** 唯一标识符 (配置文件中的 key) */
  id: string;
  /** 显示名称 */
  name?: string;
  /** 服务器连接规格 */
  server: McpServerSpec;
  /** App enable status */
  apps?: McpApps;
  /** 描述 */
  description?: string;
  /** 标签 */
  tags?: string[];
  /** 主页链接 */
  homepage?: string;
  /** 文档链接 */
  docs?: string;
  /** 是否启用 (旧格式兼容) */
  enabled?: boolean;
  /** 允许扩展字段 */
  [key: string]: any;
}

/**
 * MCP 服务器映射 (id -> McpServer)
 */
export type McpServersMap = Record<string, McpServer>;

/**
 * MCP configuration file structure
 */
export interface McpConfig {
  /** MCP 配置 */
  mcp?: {
    /** 服务器列表 */
    servers?: Record<string, McpServer>;
  };
  /** Claude 供应商配置 */
  claude?: {
    providers?: Record<string, any>;
    current?: string;
  };
  /** 其他配置 */
  [key: string]: any;
}

/**
 * Claude 配置文件结构 (~/.claude.json)
 * 参考官方格式
 */
export interface ClaudeConfig {
  /** MCP 服务器配置 */
  mcpServers?: Record<string, McpServerSpec>;
  /** 其他配置 */
  [key: string]: any;
}

/**
 * MCP 预设配置
 */
export interface McpPreset {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  server: McpServerSpec;
  homepage?: string;
  docs?: string;
}

/**
 * MCP 服务器状态
 */
export type McpServerStatus = 'connected' | 'checking' | 'error' | 'unknown';

/**
 * MCP 服务器连接状态信息 (来自 Claude SDK)
 */
export interface McpServerStatusInfo {
  /** 服务器名称 */
  name: string;
  /** 连接状态 */
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  /** 服务器信息 (连接成功时可用) */
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * MCP 服务器验证结果
 */
export interface McpServerValidationResult {
  valid: boolean;
  serverId?: string;
  errors?: string[];
  warnings?: string[];
}
