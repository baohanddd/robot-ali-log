# 多日志库智能查询实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 smart_query_sls_logs 能从自然语言描述中自动识别日志库（logstore）和项目（project）

**Architecture:** 在 config/mcp.json 中配置日志库别名映射，query-expander 提供解析函数，smart-parser 在本地解析流程中集成提取逻辑，mcp-mode 按优先级（显式参数 > 解析结果 > 默认值）选择 project/logstore

**Tech Stack:** TypeScript, Vitest, Node.js ESM

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/query-expander.ts` | 修改 | 新增 `LogstoreConfig` 接口、`resolveLogstore()`、`extractLogstoreFromDescription()` |
| `src/smart-parser.ts` | 修改 | 扩展 `SmartQueryResult` 接口；在 `parseLocalQuery()` 中集成日志库提取 |
| `src/mcp-mode.ts` | 修改 | `handleSmartQueryLogs()` 中优先使用解析结果中的 project/logstore |
| `config/mcp.json` | 修改 | 添加 `logstores` 配置数组 |
| `tests/logstore-resolver.test.ts` | 创建 | 测试 resolveLogstore 和 extractLogstoreFromDescription |
| `tests/smart-parser.test.ts` | 修改 | 新增测试用例：验证解析出 project/logstore |

---

## Task 1: query-expander.ts — 添加日志库解析函数

**Files:**
- Modify: `src/query-expander.ts`
- Test: `tests/logstore-resolver.test.ts`

### Step 1: 写测试 — resolveLogstore 基本匹配

创建 `tests/logstore-resolver.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing query-expander
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { resolveLogstore, extractLogstoreFromDescription, clearCache } from '../src/query-expander';
import * as fs from 'fs';

describe('resolveLogstore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should match logstore by alias', () => {
    const mockConfig = {
      logstores: [
        { name: 'pro', project: 'fu-project', aliases: ['pro', '生产'] },
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match', '匹配'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = resolveLogstore('帮我查 pro-match 的日志');
    expect(result).toEqual({ project: 'fu-project', logstore: 'pro-match' });
  });

  it('should prefer longer alias', () => {
    const mockConfig = {
      logstores: [
        { name: 'pro', project: 'fu-project', aliases: ['pro', '生产'] },
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match', '匹配'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = resolveLogstore('查询 pro-match 的错误');
    expect(result?.logstore).toBe('pro-match');
  });

  it('should return null if no match', () => {
    const mockConfig = { logstores: [] };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = resolveLogstore('查询日志');
    expect(result).toBeNull();
  });

  it('should be case insensitive', () => {
    const mockConfig = {
      logstores: [
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = resolveLogstore('查 PRO-MATCH 日志');
    expect(result?.logstore).toBe('pro-match');
  });
});
```

### Step 2: 运行测试，确认失败

```bash
npm test -- tests/logstore-resolver.test.ts
```

Expected: FAIL — `resolveLogstore is not exported` 或函数未定义

### Step 3: 实现 resolveLogstore

在 `src/query-expander.ts` 的 `McpConfig` 接口中添加 `logstores`，并导出 `resolveLogstore`：

```typescript
// 在 McpConfig 接口中添加
interface McpConfig {
  defaultProject?: string;
  defaultLogstore?: string;
  defaultRegion?: string;
  queryAliases?: Record<string, string[]>;
  logstores?: LogstoreConfig[];
}

// 新增接口（放在 McpConfig 之前）
export interface LogstoreConfig {
  name: string;
  project: string;
  aliases: string[];
}

// 新增函数（放在 expandKeywords 之后）
export function resolveLogstore(input: string): { project: string; logstore: string } | null {
  const config = loadConfig();
  const logstores = config.logstores || [];
  
  // 收集所有别名并排序（长的优先）
  const allAliases: { alias: string; logstore: LogstoreConfig }[] = [];
  for (const ls of logstores) {
    for (const alias of ls.aliases) {
      allAliases.push({ alias, logstore: ls });
    }
  }
  
  // 按长度降序，优先匹配更长的别名
  allAliases.sort((a, b) => b.alias.length - a.alias.length);
  
  for (const { alias, logstore: ls } of allAliases) {
    if (input.toLowerCase().includes(alias.toLowerCase())) {
      return { project: ls.project, logstore: ls.name };
    }
  }
  
  return null;
}
```

### Step 4: 运行测试，确认通过

```bash
npm test -- tests/logstore-resolver.test.ts
```

Expected: PASS

### Step 5: 写测试 — extractLogstoreFromDescription

在 `tests/logstore-resolver.test.ts` 的 describe 块中添加：

```typescript
describe('extractLogstoreFromDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should extract logstore and clean description', () => {
    const mockConfig = {
      logstores: [
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match', '匹配'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = extractLogstoreFromDescription('查询最近10小时的error日志, pro-match');
    expect(result.project).toBe('fu-project');
    expect(result.logstore).toBe('pro-match');
    expect(result.cleanedDesc).not.toContain('pro-match');
    expect(result.cleanedDesc).toContain('error');
  });

  it('should return original desc if no match', () => {
    const mockConfig = { logstores: [] };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = extractLogstoreFromDescription('查询 error 日志');
    expect(result.project).toBeUndefined();
    expect(result.logstore).toBeUndefined();
    expect(result.cleanedDesc).toBe('查询 error 日志');
  });
});
```

### Step 6: 运行测试，确认失败

```bash
npm test -- tests/logstore-resolver.test.ts
```

Expected: FAIL — `extractLogstoreFromDescription is not exported`

### Step 7: 实现 extractLogstoreFromDescription

在 `src/query-expander.ts` 中新增：

```typescript
export function extractLogstoreFromDescription(desc: string): {
  project?: string;
  logstore?: string;
  cleanedDesc: string;
} {
  const config = loadConfig();
  const logstores = config.logstores || [];
  let cleanedDesc = desc;
  let matched: { project: string; logstore: string } | null = null;
  
  // 收集所有别名并排序（长的优先）
  const allAliases: { alias: string; logstore: LogstoreConfig }[] = [];
  for (const ls of logstores) {
    for (const alias of ls.aliases) {
      allAliases.push({ alias, logstore: ls });
    }
  }
  
  allAliases.sort((a, b) => b.alias.length - a.alias.length);
  
  for (const { alias, logstore: ls } of allAliases) {
    if (desc.toLowerCase().includes(alias.toLowerCase())) {
      matched = { project: ls.project, logstore: ls.name };
      cleanedDesc = cleanedDesc.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
      break;
    }
  }
  
  if (!matched) {
    return { cleanedDesc: desc.trim() };
  }
  
  return {
    project: matched.project,
    logstore: matched.logstore,
    cleanedDesc: cleanedDesc.trim(),
  };
}
```

### Step 8: 运行测试，确认通过

```bash
npm test -- tests/logstore-resolver.test.ts
```

Expected: PASS

### Step 9: Commit

```bash
git add src/query-expander.ts tests/logstore-resolver.test.ts
git commit -m "feat: add logstore resolution from description"
```

---

## Task 2: smart-parser.ts — 集成日志库提取

**Files:**
- Modify: `src/smart-parser.ts`
- Test: `tests/smart-parser.test.ts`

### Step 1: 写测试 — parseSmartQuery 解析出 project/logstore

在 `tests/smart-parser.test.ts` 中添加（在文件末尾）：

```typescript
describe('parseSmartQuery - logstore extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should extract logstore from description', async () => {
    const mockConfig = {
      logstores: [
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match', '匹配'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = await parseSmartQuery('帮我查询最近10个小时的error日志, pro-match', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.project).toBe('fu-project');
    expect(result.logstore).toBe('pro-match');
    expect(result.query).toContain('ERROR');
  });

  it('should not include logstore if not configured', async () => {
    const mockConfig = {};
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = await parseSmartQuery('查询最近1小时的error日志', { useLLM: false });
    expect(result.project).toBeUndefined();
    expect(result.logstore).toBeUndefined();
  });
});
```

注意需要在测试文件顶部添加 mock fs 和 import：

```typescript
// 在文件最顶部（现有 import 之前）添加
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

// 在现有 import 后添加
import * as fs from 'fs';
import { clearCache } from '../src/query-expander';
```

### Step 2: 运行测试，确认失败

```bash
npm test -- tests/smart-parser.test.ts
```

Expected: FAIL — `project`/`logstore` 不存在于 SmartQueryResult，或断言失败

### Step 3: 修改 SmartQueryResult 和 parseLocalQuery

在 `src/smart-parser.ts` 中：

1. 扩展 `SmartQueryResult` 接口：

```typescript
export interface SmartQueryResult {
  query: string;
  from: number;
  to: number;
  project?: string;
  logstore?: string;
  limit?: number;
  source: 'local' | 'llm' | 'fallback';
  warning?: string;
}
```

2. 在 `parseLocalQuery()` 中，提取时间后调用 `extractLogstoreFromDescription`：

```typescript
import { expandKeywords, extractLogstoreFromDescription } from './query-expander.js';

// 在 parseLocalQuery 中，时间提取之后、关键词处理之前：
function parseLocalQuery(description: string): SmartQueryResult | null {
  try {
    const trimmed = description.trim();
    
    const timeResult = extractTimeExpression(trimmed);
    let timeStr: string;
    let cleanedDesc: string;
    
    if (timeResult) {
      timeStr = timeResult.timeStr.replace(/^(最近|过去)\s*/, '').trim();
      timeStr = timeStr.replace(/内$/, '');
      cleanedDesc = timeResult.cleanedDesc;
    } else {
      timeStr = '1h';
      cleanedDesc = trimmed;
    }
    
    const from = parseTime(timeStr);
    const to = Math.floor(Date.now() / 1000);
    
    // 新增：从描述中提取日志库信息
    const extracted = extractLogstoreFromDescription(cleanedDesc);
    cleanedDesc = extracted.cleanedDesc;
    
    let workingDesc = cleanedDesc;
    for (const word of STOP_WORDS) {
      workingDesc = workingDesc.split(word).join(' ');
    }
    workingDesc = workingDesc.trim();
    
    const rawKeywords = workingDesc
      .split(/[\s,，]+/)
      .filter(w => w.length > 0);
    
    const keywords = filterTimeWords(rawKeywords);
    const expandedKeywords = keywords.map(k => expandKeywords(k));
    
    let query: string;
    if (expandedKeywords.length > 0) {
      const hasErrorTerm = keywords.some(k => 
        ['error', 'ERROR', '错误', '异常', 'exception', 'fatal'].includes(k.toLowerCase())
      );
      
      if (hasErrorTerm && !expandedKeywords.some(k => k.includes('level='))) {
        query = `level="ERROR" AND (${expandedKeywords.join(' OR ')})`;
      } else {
        query = expandedKeywords.join(' OR ');
      }
    } else {
      query = '*';
    }
    
    const result: SmartQueryResult = { query, from, to, source: 'local' };
    if (extracted.project) result.project = extracted.project;
    if (extracted.logstore) result.logstore = extracted.logstore;
    
    return result;
  } catch (error) {
    return null;
  }
}
```

### Step 4: 运行测试，确认通过

```bash
npm test -- tests/smart-parser.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/smart-parser.ts tests/smart-parser.test.ts
git commit -m "feat: integrate logstore extraction into smart parser"
```

---

## Task 3: mcp-mode.ts — 使用解析结果的优先级

**Files:**
- Modify: `src/mcp-mode.ts`
- Test: `tests/mcp-mode.test.ts`

### Step 1: 写测试 — 验证优先级

在 `tests/mcp-mode.test.ts` 中添加测试（检查该文件是否存在，如果存在则添加，否则创建新测试）：

```bash
ls tests/mcp-mode.test.ts
```

如果文件存在，查看其结构后添加测试。如果不存在，创建新文件：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import * as fs from 'fs';
import { clearCache } from '../src/query-expander';

describe('handleSmartQueryLogs - logstore priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  // 由于 handleSmartQueryLogs 不是导出的函数，我们需要测试间接行为
  // 或者将测试放在集成测试层面
  // 这里我们测试 parseSmartQuery 的结果被正确传递
  
  it('should parse project and logstore from description', async () => {
    const mockConfig = {
      defaultProject: 'default-project',
      defaultLogstore: 'default-logstore',
      logstores: [
        { name: 'pro-match', project: 'fu-project', aliases: ['pro-match'] }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const { parseSmartQuery } = await import('../src/smart-parser');
    const result = await parseSmartQuery('查 pro-match 的 error', { useLLM: false });
    
    expect(result.project).toBe('fu-project');
    expect(result.logstore).toBe('pro-match');
  });
});
```

如果 `mcp-mode.test.ts` 已存在且有更合适的测试结构，按其风格添加。

### Step 2: 运行测试，确认失败

```bash
npm test -- tests/mcp-mode.test.ts
```

Expected: FAIL — 测试可能因未导出函数而失败，或者验证 handleSmartQueryLogs 未使用 parsed.project

### Step 3: 修改 handleSmartQueryLogs

在 `src/mcp-mode.ts` 的 `handleSmartQueryLogs` 函数中：

```typescript
async function handleSmartQueryLogs(
  args: Record<string, unknown>,
  slsClient: SlsClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const description = String(args.description);
  
  const parsed = await parseSmartQuery(description, {
    useLLM: process.env.ENABLE_LLM_QUERY === 'true'
  });

  // 优先级：显式参数 > 解析结果 > 默认值
  const project = String(args.project || parsed.project || getDefaultProject());
  const logstore = String(args.logstore || parsed.logstore || getDefaultLogstore());

  if (!project) {
    throw new Error('project is required (or set defaultProject in config/mcp.json)');
  }
  if (!logstore) {
    throw new Error('logstore is required (or set defaultLogstore in config/mcp.json)');
  }

  // ... 其余代码不变
}
```

将原来的：
```typescript
const project = String(args.project || getDefaultProject());
const logstore = String(args.logstore || getDefaultLogstore());
```

改为：
```typescript
const project = String(args.project || parsed.project || getDefaultProject());
const logstore = String(args.logstore || parsed.logstore || getDefaultLogstore());
```

### Step 4: 运行测试，确认通过

```bash
npm test -- tests/mcp-mode.test.ts
```

Expected: PASS（如果测试文件结构允许直接测试），或者运行全部测试确认没有回归：

```bash
npm test
```

### Step 5: Commit

```bash
git add src/mcp-mode.ts tests/mcp-mode.test.ts
git commit -m "feat: use parsed logstore in smart query handler"
```

---

## Task 4: config/mcp.json — 添加日志库配置

**Files:**
- Modify: `config/mcp.json`

### Step 1: 更新配置文件

修改 `config/mcp.json`：

```json
{
  "defaultProject": "fu-project",
  "defaultLogstore": "pro",
  "defaultRegion": "cn-shenzhen",
  "logstores": [
    {
      "name": "pro",
      "project": "fu-project",
      "aliases": ["pro", "生产", "线上"]
    },
    {
      "name": "pro-match",
      "project": "fu-project",
      "aliases": ["pro-match", "匹配", "match"]
    }
  ],
  "queryAliases": {
    "sms": ["sms", "短信", "message", "验证码"],
    "error": ["error", "ERROR", "错误", "异常", "exception", "fatal"],
    "api": ["api", "接口", "request", "response", "http"]
  }
}
```

### Step 2: Commit

```bash
git add config/mcp.json
git commit -m "config: add logstores configuration with pro and pro-match"
```

---

## 集成验证

### Step 1: 运行全部测试

```bash
npm test
```

Expected: 所有测试通过，无回归

### Step 2: 验证构建

```bash
npm run build
```

Expected: TypeScript 编译通过，无类型错误

### Step 3: Commit（如有变更）

```bash
git status
```

如有未提交变更：
```bash
git add -A
git commit -m "test: verify multi-logstore smart query integration"
```

---

## 计划自检

**Spec coverage check:**
- [x] `config/mcp.json` 配置格式 — Task 4
- [x] `resolveLogstore()` 别名匹配（含长度优先）— Task 1 Step 3
- [x] `extractLogstoreFromDescription()` 提取并清理描述 — Task 1 Step 7
- [x] `SmartQueryResult` 扩展 project/logstore — Task 2 Step 3
- [x] `parseLocalQuery()` 集成日志库提取 — Task 2 Step 3
- [x] `handleSmartQueryLogs()` 优先级规则 — Task 3 Step 3
- [x] 向后兼容性（logstores 可选）— Task 1 测试覆盖

**Placeholder scan:**
- [x] 无 "TBD"/"TODO"/"implement later"
- [x] 每个 step 包含具体代码和命令
- [x] 无 "Similar to Task N" 引用

**Type consistency:**
- [x] `LogstoreConfig` 接口在 query-expander.ts 中定义，被 resolveLogstore 和 extractLogstoreFromDescription 使用
- [x] `SmartQueryResult` 的 `project`/`logstore` 为 optional，与 parseLocalQuery 中条件赋值一致
- [x] `handleSmartQueryLogs` 使用 `args.project || parsed.project || getDefaultProject()`，类型均为 string | undefined
