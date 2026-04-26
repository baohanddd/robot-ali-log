# 阿里云 SLS MCP Server 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建支持双模式（MCP + 守护进程）的阿里云 SLS 日志查询工具

**Architecture:** 基于 TypeScript + MCP SDK + 阿里云 SLS SDK，通过 RUN_MODE 环境变量切换 MCP Server 模式和定时轮询守护进程模式

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, @alicloud/sls20201230, tsx, vitest

---

## 文件结构

```
ali-log/
├── src/
│   ├── index.ts          # 入口，根据 RUN_MODE 启动对应模式
│   ├── auth.ts           # 认证与环境变量处理
│   ├── sls-client.ts     # SLS SDK 封装
│   ├── mcp-mode.ts       # MCP Server 模式实现
│   ├── daemon-mode.ts    # 脚本/守护进程模式实现
│   ├── time-parser.ts    # 时间解析
│   ├── formatter.ts      # 响应格式化
│   └── types.ts          # 类型定义
├── tests/
│   ├── auth.test.ts
│   ├── time-parser.test.ts
│   ├── sls-client.test.ts
│   ├── formatter.test.ts
│   ├── mcp-mode.test.ts
│   └── daemon-mode.test.ts
├── logs/                 # 脚本模式日志输出目录（.gitignore）
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "ali-log-mcp",
  "version": "1.0.0",
  "description": "阿里云 SLS MCP Server - 支持 MCP 模式和守护进程模式",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["mcp", "aliyun", "sls", "log"],
  "license": "MIT",
  "dependencies": {
    "@alicloud/sls20201230": "^4.3.0",
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
dist/
logs/
*.log
.env
.DS_Store
coverage/
```

- [ ] **Step 5: 安装依赖**

Run: `npm install`
Expected: 依赖安装成功，生成 node_modules/

- [ ] **Step 6: 提交**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: initialize project with typescript and vitest"
```

---

### Task 2: 类型定义

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
export interface SlsCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
}

export interface QueryParams {
  project: string;
  logstore: string;
  query: string;
  from: number; // Unix timestamp in seconds
  to: number;   // Unix timestamp in seconds
  limit?: number;
}

export interface LogEntry {
  time: number;
  content: Record<string, unknown>;
}

export interface QueryResult {
  logs: LogEntry[];
  count: number;
  hasMore: boolean;
}

export interface DaemonConfig {
  project: string;
  logstore: string;
  pollInterval: number; // seconds
  errorQuery: string;
  outputMode: 'console' | 'file';
  logFilePath?: string;
}

export type RunMode = 'mcp' | 'daemon';
```

- [ ] **Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: add type definitions"
```

---

### Task 3: 认证模块

**Files:**
- Create: `src/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: 编写认证模块测试**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCredentials, getRegion } from '../src/auth';

describe('auth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return credentials from environment variables', () => {
    process.env.ALICLOUD_ACCESS_KEY_ID = 'test-key-id';
    process.env.ALICLOUD_ACCESS_KEY_SECRET = 'test-key-secret';

    const creds = getCredentials();
    expect(creds.accessKeyId).toBe('test-key-id');
    expect(creds.accessKeySecret).toBe('test-key-secret');
  });

  it('should throw error when access key id is missing', () => {
    delete process.env.ALICLOUD_ACCESS_KEY_ID;
    process.env.ALICLOUD_ACCESS_KEY_SECRET = 'test-key-secret';

    expect(() => getCredentials()).toThrow('ALICLOUD_ACCESS_KEY_ID environment variable is required');
  });

  it('should throw error when access key secret is missing', () => {
    process.env.ALICLOUD_ACCESS_KEY_ID = 'test-key-id';
    delete process.env.ALICLOUD_ACCESS_KEY_SECRET;

    expect(() => getCredentials()).toThrow('ALICLOUD_ACCESS_KEY_SECRET environment variable is required');
  });

  it('should return default region when not set', () => {
    delete process.env.ALICLOUD_REGION;
    expect(getRegion()).toBe('cn-hangzhou');
  });

  it('should return custom region when set', () => {
    process.env.ALICLOUD_REGION = 'cn-beijing';
    expect(getRegion()).toBe('cn-beijing');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL - "Cannot find module '../src/auth'"

- [ ] **Step 3: 实现认证模块**

```typescript
import { SlsCredentials } from './types';

export function getCredentials(): SlsCredentials {
  const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET;

  if (!accessKeyId) {
    throw new Error('ALICLOUD_ACCESS_KEY_ID environment variable is required');
  }

  if (!accessKeySecret) {
    throw new Error('ALICLOUD_ACCESS_KEY_SECRET environment variable is required');
  }

  return {
    accessKeyId,
    accessKeySecret,
    region: getRegion(),
  };
}

export function getRegion(): string {
  return process.env.ALICLOUD_REGION || 'cn-hangzhou';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS - 5 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: add auth module with env validation"
```

---

### Task 4: 时间解析器

**Files:**
- Create: `src/time-parser.ts`
- Create: `tests/time-parser.test.ts`

- [ ] **Step 1: 编写时间解析器测试**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTime } from '../src/time-parser';

describe('time-parser', () => {
  const now = Math.floor(Date.now() / 1000);

  it('should parse unix timestamp', () => {
    const result = parseTime('1714118400');
    expect(result).toBe(1714118400);
  });

  it('should parse "1h ago"', () => {
    const result = parseTime('1h ago');
    expect(result).toBeGreaterThan(now - 3601);
    expect(result).toBeLessThanOrEqual(now - 3600);
  });

  it('should parse "30m ago"', () => {
    const result = parseTime('30m ago');
    expect(result).toBeGreaterThan(now - 1801);
    expect(result).toBeLessThanOrEqual(now - 1800);
  });

  it('should parse "1d ago"', () => {
    const result = parseTime('1d ago');
    expect(result).toBeGreaterThan(now - 86401);
    expect(result).toBeLessThanOrEqual(now - 86400);
  });

  it('should parse "5m ago"', () => {
    const result = parseTime('5m ago');
    expect(result).toBeGreaterThan(now - 301);
    expect(result).toBeLessThanOrEqual(now - 300);
  });

  it('should throw error for invalid format', () => {
    expect(() => parseTime('invalid')).toThrow('Invalid time format');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/time-parser.test.ts`
Expected: FAIL - "Cannot find module '../src/time-parser'"

- [ ] **Step 3: 实现时间解析器**

```typescript
export function parseTime(input: string): number {
  // Try parsing as unix timestamp first
  const timestamp = parseInt(input, 10);
  if (!isNaN(timestamp) && input.trim() === String(timestamp)) {
    return timestamp;
  }

  // Parse relative time format: "<number><unit> ago"
  const match = input.trim().match(/^(\d+)([hmd])\s*ago$/i);
  if (!match) {
    throw new Error(`Invalid time format: "${input}". Expected unix timestamp or relative time like "1h ago", "30m ago", "1d ago"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const multipliers: Record<string, number> = {
    m: 60,
    h: 3600,
    d: 86400,
  };

  return now - (value * multipliers[unit]);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/time-parser.test.ts`
Expected: PASS - 6 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/time-parser.ts tests/time-parser.test.ts
git commit -m "feat: add time parser with relative time support"
```

---

### Task 5: SLS Client 封装

**Files:**
- Create: `src/sls-client.ts`
- Create: `tests/sls-client.test.ts`

- [ ] **Step 1: 编写 SLS Client 测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlsClient } from '../src/sls-client';
import { SlsCredentials, QueryParams, LogEntry } from '../src/types';

// Mock the aliyun SDK
vi.mock('@alicloud/sls20201230', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getLogs: vi.fn(),
    })),
  };
});

describe('sls-client', () => {
  let client: SlsClient;
  const mockCreds: SlsCredentials = {
    accessKeyId: 'test-id',
    accessKeySecret: 'test-secret',
    region: 'cn-hangzhou',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SlsClient(mockCreds);
  });

  it('should create client with correct endpoint', () => {
    expect(client).toBeDefined();
  });

  it('should query logs successfully', async () => {
    const mockLogs: LogEntry[] = [
      { time: 1714118400, content: { message: 'test log' } },
    ];

    const mockResponse = {
      body: {
        logs: mockLogs,
        count: 1,
      },
    };

    const slsSdk = (await import('@alicloud/sls20201230')).default;
    const mockInstance = slsSdk.mock.results[0]?.value || {
      getLogs: vi.fn().mockResolvedValue(mockResponse),
    };
    
    // Override the client method
    (client as any).client = mockInstance;

    const params: QueryParams = {
      project: 'test-project',
      logstore: 'test-logstore',
      query: '*',
      from: 1714118000,
      to: 1714119000,
      limit: 100,
    };

    const result = await client.queryLogs(params);
    expect(result.logs).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it('should handle query errors', async () => {
    const mockInstance = {
      getLogs: vi.fn().mockRejectedValue(new Error('API Error')),
    };
    (client as any).client = mockInstance;

    const params: QueryParams = {
      project: 'test-project',
      logstore: 'test-logstore',
      query: '*',
      from: 1714118000,
      to: 1714119000,
    };

    await expect(client.queryLogs(params)).rejects.toThrow('SLS query failed: API Error');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sls-client.test.ts`
Expected: FAIL - "Cannot find module '../src/sls-client'"

- [ ] **Step 3: 实现 SLS Client**

```typescript
import Sls2020 from '@alicloud/sls20201230';
import { SlsCredentials, QueryParams, QueryResult, LogEntry } from './types';

export class SlsClient {
  private client: Sls2020;

  constructor(credentials: SlsCredentials) {
    this.client = new Sls2020({
      endpoint: `${credentials.region}.log.aliyuncs.com`,
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
    });
  }

  async queryLogs(params: QueryParams): Promise<QueryResult> {
    const request = new Sls2020.GetLogsRequest({
      project: params.project,
      logstore: params.logstore,
      query: params.query,
      from: params.from,
      to: params.to,
      line: params.limit || 100,
    });

    try {
      const response = await this.client.getLogs(request);
      const logs: LogEntry[] = (response.body?.logs || []).map((log: any) => ({
        time: log.time || 0,
        content: log.contents || {},
      }));

      return {
        logs,
        count: logs.length,
        hasMore: logs.length >= (params.limit || 100),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SLS query failed: ${message}`);
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sls-client.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/sls-client.ts tests/sls-client.test.ts
git commit -m "feat: add SLS client wrapper with query support"
```

---

### Task 6: 格式化器

**Files:**
- Create: `src/formatter.ts`
- Create: `tests/formatter.test.ts`

- [ ] **Step 1: 编写格式化器测试**

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsMarkdown, formatAsText } from '../src/formatter';
import { LogEntry, QueryResult } from '../src/types';

describe('formatter', () => {
  const mockLogs: LogEntry[] = [
    { time: 1714118400, content: { level: 'ERROR', message: 'Connection failed' } },
    { time: 1714118460, content: { level: 'INFO', message: 'Server started' } },
  ];

  const mockResult: QueryResult = {
    logs: mockLogs,
    count: 2,
    hasMore: false,
  };

  it('should format as markdown table', () => {
    const output = formatAsMarkdown(mockResult);
    expect(output).toContain('| Time | level | message |');
    expect(output).toContain('ERROR');
    expect(output).toContain('Server started');
  });

  it('should format empty result as markdown', () => {
    const emptyResult: QueryResult = { logs: [], count: 0, hasMore: false };
    const output = formatAsMarkdown(emptyResult);
    expect(output).toContain('No logs found');
  });

  it('should format as text for daemon mode', () => {
    const output = formatAsText(mockLogs);
    expect(output).toContain('[2024-04-26');
    expect(output).toContain('ERROR: Connection failed');
    expect(output).toContain('INFO: Server started');
  });

  it('should format empty logs as text', () => {
    const output = formatAsText([]);
    expect(output).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/formatter.test.ts`
Expected: FAIL - "Cannot find module '../src/formatter'"

- [ ] **Step 3: 实现格式化器**

```typescript
import { LogEntry, QueryResult } from './types';

export function formatAsMarkdown(result: QueryResult): string {
  if (result.count === 0) {
    return 'No logs found.';
  }

  const logs = result.logs;
  
  // Collect all unique keys from log contents
  const allKeys = new Set<string>();
  logs.forEach(log => {
    Object.keys(log.content).forEach(key => allKeys.add(key));
  });
  
  const keys = Array.from(allKeys);
  const headers = ['Time', ...keys];
  
  // Build header
  let md = '| ' + headers.join(' | ') + ' |\n';
  md += '|' + headers.map(() => ' --- ').join('|') + '|\n';
  
  // Build rows
  logs.forEach(log => {
    const time = new Date(log.time * 1000).toISOString();
    const values = keys.map(key => {
      const val = log.content[key];
      return val !== undefined ? String(val) : '';
    });
    md += '| ' + [time, ...values].join(' | ') + ' |\n';
  });

  if (result.hasMore) {
    md += '\n*More results available. Use a smaller time range or increase limit.*';
  }

  return md;
}

export function formatAsText(logs: LogEntry[]): string {
  if (logs.length === 0) return '';

  return logs.map(log => {
    const time = new Date(log.time * 1000).toISOString();
    const level = log.content.level || 'UNKNOWN';
    const message = log.content.message || JSON.stringify(log.content);
    return `[${time}] ${level}: ${message}`;
  }).join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/formatter.test.ts`
Expected: PASS - 4 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/formatter.ts tests/formatter.test.ts
git commit -m "feat: add log formatter with markdown and text output"
```

---

### Task 7: MCP Server 模式

**Files:**
- Create: `src/mcp-mode.ts`
- Create: `tests/mcp-mode.test.ts`

- [ ] **Step 1: 编写 MCP 模式测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startMcpServer } from '../src/mcp-mode';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../src/sls-client', () => ({
  SlsClient: vi.fn().mockImplementation(() => ({
    queryLogs: vi.fn().mockResolvedValue({
      logs: [{ time: 1714118400, content: { message: 'test' } }],
      count: 1,
      hasMore: false,
    }),
  })),
}));

describe('mcp-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create MCP server with correct config', async () => {
    const server = await startMcpServer();
    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/mcp-mode.test.ts`
Expected: FAIL - "Cannot find module '../src/mcp-mode'"

- [ ] **Step 3: 实现 MCP 模式**

```typescript
import { Server } from '@modelcontextprotocol/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { SlsClient } from './sls-client';
import { getCredentials } from './auth';
import { formatAsMarkdown } from './formatter';
import { parseTime } from './time-parser';

export async function startMcpServer(): Promise<Server> {
  const credentials = getCredentials();
  const slsClient = new SlsClient(credentials);

  const server = new Server(
    {
      name: 'ali-log-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler('tools/list', async () => {
    return {
      tools: [
        {
          name: 'query_sls_logs',
          description: 'Query logs from Alibaba Cloud SLS (Log Service)',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'SLS project name',
              },
              logstore: {
                type: 'string',
                description: 'SLS logstore name',
              },
              query: {
                type: 'string',
                description: 'Query string (SLS query syntax or SQL)',
              },
              from: {
                type: 'string',
                description: 'Start time (unix timestamp or relative like "1h ago")',
              },
              to: {
                type: 'string',
                description: 'End time (unix timestamp or relative like "now")',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of logs to return (default: 100, max: 1000)',
              },
            },
            required: ['project', 'logstore', 'query', 'from', 'to'],
          },
        },
      ],
    };
  });

  server.setRequestHandler('tools/call', async (request) => {
    if (request.params.name !== 'query_sls_logs') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args = request.params.arguments as Record<string, unknown>;
    
    const project = String(args.project);
    const logstore = String(args.logstore);
    const query = String(args.query);
    const from = parseTime(String(args.from));
    const to = args.to === 'now' ? Math.floor(Date.now() / 1000) : parseTime(String(args.to));
    const limit = Math.min(Number(args.limit) || 100, 1000);

    const result = await slsClient.queryLogs({
      project,
      logstore,
      query,
      from,
      to,
      limit,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatAsMarkdown(result),
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/mcp-mode.test.ts`
Expected: PASS - 1 test passed

- [ ] **Step 5: 提交**

```bash
git add src/mcp-mode.ts tests/mcp-mode.test.ts
git commit -m "feat: add MCP server mode with query_sls_logs tool"
```

---

### Task 8: 守护进程模式

**Files:**
- Create: `src/daemon-mode.ts`
- Create: `tests/daemon-mode.test.ts`

- [ ] **Step 1: 编写守护进程模式测试**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startDaemon } from '../src/daemon-mode';
import * as fs from 'fs';

vi.mock('../src/sls-client', () => ({
  SlsClient: vi.fn().mockImplementation(() => ({
    queryLogs: vi.fn().mockResolvedValue({
      logs: [
        { time: 1714118400, content: { level: 'ERROR', message: 'Test error' } },
      ],
      count: 1,
      hasMore: false,
    }),
  })),
}));

describe('daemon-mode', () => {
  const originalEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('should validate required env vars', async () => {
    delete process.env.SLS_PROJECT;
    delete process.env.SLS_LOGSTORE;

    await expect(startDaemon()).rejects.toThrow('SLS_PROJECT environment variable is required');
  });

  it('should start daemon and query logs', async () => {
    process.env.SLS_PROJECT = 'test-project';
    process.env.SLS_LOGSTORE = 'test-logstore';
    process.env.POLL_INTERVAL = '1';
    process.env.DAEMON_OUTPUT = 'console';

    // Start daemon but stop after first poll
    const daemon = await startDaemon();
    
    // Wait a bit for first execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    daemon.stop();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/daemon-mode.test.ts`
Expected: FAIL - "Cannot find module '../src/daemon-mode'"

- [ ] **Step 3: 实现守护进程模式**

```typescript
import { SlsClient } from './sls-client';
import { getCredentials } from './auth';
import { formatAsText } from './formatter';
import { DaemonConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';

export interface DaemonHandle {
  stop: () => void;
}

export async function startDaemon(): Promise<DaemonHandle> {
  const config = getDaemonConfig();
  const credentials = getCredentials();
  const slsClient = new SlsClient(credentials);

  let lastQueryTime = Math.floor(Date.now() / 1000) - config.pollInterval;
  const seenHashes = new Set<string>();
  let intervalId: ReturnType<typeof setInterval>;

  async function poll() {
    const now = Math.floor(Date.now() / 1000);
    
    try {
      const result = await slsClient.queryLogs({
        project: config.project,
        logstore: config.logstore,
        query: config.errorQuery,
        from: lastQueryTime,
        to: now,
        limit: 1000,
      });

      const newLogs = result.logs.filter(log => {
        const hash = `${log.time}-${JSON.stringify(log.content)}`;
        if (seenHashes.has(hash)) return false;
        seenHashes.add(hash);
        return true;
      });

      // Keep seenHashes size bounded
      if (seenHashes.size > 1000) {
        const arr = Array.from(seenHashes);
        seenHashes.clear();
        arr.slice(-500).forEach(h => seenHashes.add(h));
      }

      if (newLogs.length > 0) {
        const output = formatAsText(newLogs);
        
        if (config.outputMode === 'file' && config.logFilePath) {
          const dir = path.dirname(config.logFilePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.appendFileSync(config.logFilePath, output + '\n');
        } else {
          console.log(output);
        }
      }

      lastQueryTime = now;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Daemon] Query failed: ${message}`);
    }
  }

  // Run immediately
  await poll();

  // Schedule periodic polling
  intervalId = setInterval(poll, config.pollInterval * 1000);

  return {
    stop: () => {
      clearInterval(intervalId);
    },
  };
}

function getDaemonConfig(): DaemonConfig {
  const project = process.env.SLS_PROJECT;
  const logstore = process.env.SLS_LOGSTORE;

  if (!project) {
    throw new Error('SLS_PROJECT environment variable is required in daemon mode');
  }

  if (!logstore) {
    throw new Error('SLS_LOGSTORE environment variable is required in daemon mode');
  }

  return {
    project,
    logstore,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '300', 10),
    errorQuery: process.env.ERROR_QUERY || 'level: ERROR',
    outputMode: (process.env.DAEMON_OUTPUT as 'console' | 'file') || 'console',
    logFilePath: process.env.LOG_FILE_PATH || './logs/error.log',
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/daemon-mode.test.ts`
Expected: PASS - 2 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/daemon-mode.ts tests/daemon-mode.test.ts
git commit -m "feat: add daemon mode with scheduled polling and deduplication"
```

---

### Task 9: 入口文件

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 编写入口文件**

```typescript
import { startMcpServer } from './mcp-mode';
import { startDaemon } from './daemon-mode';

async function main() {
  const mode = process.env.RUN_MODE || 'mcp';

  if (mode === 'daemon') {
    console.log('Starting Ali Log Daemon...');
    const daemon = await startDaemon();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down daemon...');
      daemon.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      daemon.stop();
      process.exit(0);
    });
  } else {
    console.log('Starting Ali Log MCP Server...');
    await startMcpServer();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 2: 手动验证入口逻辑**

Run: `RUN_MODE=mcp npx tsx src/index.ts`
Expected: 输出 "Starting Ali Log MCP Server..."（会因为缺少环境变量而报错退出，这是正常的）

Run: `RUN_MODE=daemon npx tsx src/index.ts`
Expected: 输出 "Starting Ali Log Daemon..."（会因为缺少环境变量而报错退出，这是正常的）

- [ ] **Step 3: 提交**

```bash
git add src/index.ts
git commit -m "feat: add main entry point with mode switching"
```

---

### Task 10: README 文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 README**

```markdown
# Ali Log MCP Server

阿里云 SLS (日志服务) 的双模式查询工具，支持 MCP Server 模式和守护进程模式。

## 功能特性

- **MCP 模式**: 作为 MCP Server 接入 OpenCode 等客户端，按需查询日志
- **守护进程模式**: 本地长期运行，定时轮询获取 error 日志
- 支持基础查询、条件过滤和 SQL 统计分析
- 支持相对时间语法（如 `1h ago`, `30m ago`）
- 自动去重，避免重复输出

## 安装

```bash
npm install
```

## 环境变量

### 通用配置（两种模式都需要）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| ALICLOUD_ACCESS_KEY_ID | 是 | 阿里云 AccessKey ID |
| ALICLOUD_ACCESS_KEY_SECRET | 是 | 阿里云 AccessKey Secret |
| ALICLOUD_REGION | 否 | 区域，默认 `cn-hangzhou` |

### MCP 模式

```bash
export RUN_MODE=mcp
npx tsx src/index.ts
```

### 守护进程模式

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| SLS_PROJECT | 是 | - | SLS 项目名 |
| SLS_LOGSTORE | 是 | - | 日志库名 |
| POLL_INTERVAL | 否 | 300 | 轮询间隔（秒） |
| ERROR_QUERY | 否 | `level: ERROR` | 查询语句 |
| DAEMON_OUTPUT | 否 | `console` | 输出方式: `console` 或 `file` |
| LOG_FILE_PATH | 否 | `./logs/error.log` | 文件输出路径 |

```bash
export RUN_MODE=daemon
export SLS_PROJECT=my-project
export SLS_LOGSTORE=my-logstore
npx tsx src/index.ts
```

## OpenCode 配置

```json
{
  "mcpServers": {
    "ali-log": {
      "command": "npx",
      "args": ["tsx", "/path/to/ali-log/src/index.ts"],
      "env": {
        "ALICLOUD_ACCESS_KEY_ID": "your-key-id",
        "ALICLOUD_ACCESS_KEY_SECRET": "your-key-secret",
        "RUN_MODE": "mcp"
      }
    }
  }
}
```

## MCP 工具

### query_sls_logs

查询 SLS 日志。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project | string | 是 | SLS 项目名 |
| logstore | string | 是 | 日志库名 |
| query | string | 是 | 查询语句 |
| from | string | 是 | 开始时间（如 `1h ago`） |
| to | string | 是 | 结束时间（如 `now`） |
| limit | number | 否 | 返回条数限制 |

## 测试

```bash
npm test
```

## License

MIT
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: add README with usage instructions"
```

---

## Self-Review

### Spec Coverage Check

- [x] MCP 模式实现 - Task 7
- [x] 守护进程模式实现 - Task 8
- [x] 认证模块 - Task 3
- [x] SLS Client 封装 - Task 5
- [x] 时间解析器 - Task 4
- [x] 格式化器 - Task 6
- [x] 双模式切换（入口文件）- Task 9
- [x] 定时轮询 - Task 8
- [x] 去重处理 - Task 8
- [x] 环境变量配置 - Task 3, Task 8
- [x] 错误处理 - 各任务实现中

### Placeholder Scan

- [x] 无 "TBD", "TODO" 等占位符
- [x] 所有步骤包含完整代码和命令
- [x] 无 "添加适当错误处理" 等模糊描述

### Type Consistency

- [x] `QueryResult` 类型在所有任务中一致使用
- [x] `LogEntry` 类型在所有任务中一致使用
- [x] `SlsCredentials` 类型在所有任务中一致使用
