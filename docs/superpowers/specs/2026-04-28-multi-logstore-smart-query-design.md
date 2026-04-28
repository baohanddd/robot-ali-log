# 多日志库智能查询设计

**日期**: 2026-04-28  
**状态**: 待实现  
**作者**: 与用户协作设计  

## 背景

当前 Ali Log MCP Server 的 `smart_query_sls_logs` 工具支持通过自然语言查询日志，但日志库（logstore）和项目（project）只能依赖 `config/mcp.json` 中的默认值或显式传入参数。用户希望在自然语言描述中直接指定要查询的日志库，例如：

> "帮我查询最近 10 个小时的 error 日志，pro-match"

系统应能自动识别 `pro-match` 为日志库名，并映射到正确的项目名。

## 目标

1. 在 `config/mcp.json` 中配置多个日志库及其别名
2. 智能解析器从自然语言描述中自动提取 project 和 logstore
3. 保持向后兼容性（未配置时仍用默认值）
4. 显式传入参数的优先级高于解析结果

## 非目标

- 支持一次查询多个日志库
- 自动发现 SLS 中的日志库列表
- 修改 `query_sls_logs`（普通查询）的行为

## 设计

### 1. 配置格式扩展

在 `config/mcp.json` 中新增 `logstores` 数组：

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

每个 `logstores` 条目：
- `name`: 日志库的真实名称（传给 SLS API）
- `project`: 所属项目名称（传给 SLS API）
- `aliases`: 用户可能在自然语言中使用的别名

### 2. 核心逻辑

#### 2.1 日志库解析器

在 `query-expander.ts` 中新增：

```typescript
export interface LogstoreConfig {
  name: string;
  project: string;
  aliases: string[];
}

export function resolveLogstore(input: string): { project: string; logstore: string } | null {
  const config = loadConfig();
  const logstores = config.logstores || [];
  
  // 按别名匹配，优先匹配最长的别名（避免 "pro" 匹配到 "pro-match" 的 "pro"）
  for (const ls of logstores) {
    for (const alias of ls.aliases) {
      if (input.toLowerCase().includes(alias.toLowerCase())) {
        return { project: ls.project, logstore: ls.name };
      }
    }
  }
  return null;
}

export function extractLogstoreFromDescription(desc: string): {
  project?: string;
  logstore?: string;
  cleanedDesc: string;
} {
  const result = resolveLogstore(desc);
  if (!result) {
    return { cleanedDesc: desc };
  }
  
  // 从描述中移除匹配的别名，避免影响后续关键词解析
  const config = loadConfig();
  const logstores = config.logstores || [];
  let cleanedDesc = desc;
  
  for (const ls of logstores) {
    if (ls.name === result.logstore) {
      for (const alias of ls.aliases) {
        cleanedDesc = cleanedDesc.replace(new RegExp(alias, 'gi'), '');
      }
    }
  }
  
  return {
    project: result.project,
    logstore: result.logstore,
    cleanedDesc: cleanedDesc.trim(),
  };
}
```

#### 2.2 智能查询结果扩展

`SmartQueryResult` 接口扩展为包含解析出的 project/logstore：

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

#### 2.3 本地解析器集成

在 `smart-parser.ts` 的 `parseLocalQuery()` 中：

1. 先用 `extractTimeExpression()` 提取时间表达式
2. 再用 `extractLogstoreFromDescription()` 从 `cleanedDesc` 中提取 project/logstore
3. 将匹配到的别名从描述中移除，剩余部分作为查询关键词
4. 返回的 `SmartQueryResult` 中携带 `project` 和 `logstore`

#### 2.4 MCP 模式集成

在 `mcp-mode.ts` 的 `handleSmartQueryLogs()` 中：

```typescript
const project = String(args.project || parsed.project || getDefaultProject());
const logstore = String(args.logstore || parsed.logstore || getDefaultLogstore());
```

优先级：**显式参数 > 解析结果 > 默认值**

### 3. 别名匹配策略

- 大小写不敏感匹配
- 优先匹配更长的别名（如 "pro-match" 优先于 "pro"）
- 匹配到后从描述中移除该别名，避免影响查询关键词提取

### 4. 向后兼容性

- `config/mcp.json` 中 `logstores` 是可选字段
- 没有 `logstores` 时，`resolveLogstore()` 返回 `null`，完全保持现有行为
- `SmartQueryResult` 的 `project`/`logstore` 是可选的，不影响已有代码

### 5. 测试策略

- **`tests/logstore-resolver.test.ts`**：
  - 测试别名匹配（大小写不敏感）
  - 测试默认回退（未匹配到返回 null）
  - 测试从描述中移除别名后的清理

- **`tests/smart-parser-logstore.test.ts`**：
  - 测试整句解析时 project/logstore 是否正确提取
  - 测试"帮我查询最近 10 个小时的 error 日志，pro-match" 的场景
  - 测试显式参数优先级高于解析结果

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 别名冲突（如 "pro" 同时匹配 "pro" 和 "pro-match"） | 优先匹配更长的别名；用户可通过显式传参覆盖 |
| 自然语言中日志库名与查询关键词冲突 | 从描述中移除匹配到的别名后再解析关键词 |
| 配置格式变化导致旧配置不兼容 | `logstores` 是可选字段，无该字段时保持原行为 |

## 后续可扩展

1. 支持一次查询多个日志库（返回合并结果）
2. LLM 增强：将 `logstores` 配置作为上下文传给 LLM，提升解析准确率
3. 支持在项目级别配置默认 region
