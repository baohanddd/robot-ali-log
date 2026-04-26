# Smart Query 增强设计文档

**日期**: 2026-04-26
**状态**: 设计中

## 背景与问题

当前 `smart_query_sls_logs` 工具通过正则表达式解析自然语言查询，但在处理中文数字和复杂时间表达时经常失败：

- **中文数字不被识别**：`\d+` 只匹配阿拉伯数字，`"七天"` 无法解析
- **时间边界模糊**：`"七天内"` 中的 `内` 影响匹配，时间描述移除不完整
- **无效关键字混入**：残留时间词汇（如 `七天`）被当作查询条件，生成非法查询

示例失败场景：
- `"查询最近七天的ERROR日志"` → 时间解析失败，或生成 `七天` 作为查询条件
- `"过去十五分钟的异常"` → `十五` 无法识别

## 目标

1. **支持中文数字**：识别 `一` 到 `九十九` 的中文数字表达
2. **扩展时间匹配**：支持 `七天内`、`过去7天`、`最近七天` 等变体
3. **智能过滤**：防止时间词汇残留混入查询条件
4. **LLM 增强**：本地解析失败时，可选调用 LLM 进行智能转换
5. **优雅降级**：所有解析路径失败时，返回 `*` 并附带说明

## 非目标

- 替换现有 `query_sls_logs` 工具
- 支持自然语言生成复杂 SPL/SQL 语句（仅支持简单查询转换）
- 实现通用的自然语言理解（NLU）引擎

## 方案选择

### 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 纯本地增强 | 零外部依赖，响应快，无成本 | 处理复杂自然语言仍有限制 |
| B. 纯 LLM 增强 | 几乎任何自然语言都能处理 | 依赖外部 API，有延迟和成本 |
| **C. 混合策略（推荐）** | **兼顾可靠性、性能和灵活性** | **实现复杂度略高** |

### 选择理由

采用 **方案 C：混合策略**（本地解析为主 + LLM fallback）：
- 80% 的常规查询通过本地快速解析（如 `"最近7天的ERROR日志"`）
- 20% 的复杂查询通过 LLM 处理（如 `"帮我看看上周系统出了什么毛病"`）
- 避免了对 LLM 的强依赖，同时保留扩展能力

## 架构设计

```
User Query
    ↓
[Smart Query Parser]
    ├─→ Local Parser (本地解析)
    │   ├─ 中文数字转换 (一~九十九)
    │   ├─ 扩展时间模式匹配
    │   ├─ 时间词汇过滤
    │   └─ 返回 { query, from, to, source: 'local' }
    │
    └─→ 解析失败 / 生成空查询?
        ├─ Yes → LLM Parser (调用 LLM API)
        │         ├─ 构建 prompt
        │         ├─ 调用 LLM
        │         └─ 返回 { query, from, to, source: 'llm' }
        │
        └─ No → 直接使用本地结果

[Query Builder]
    └─ 组装最终 SLS 查询语句

[SLS Client]
    └─ 执行查询并返回
```

## 组件设计

### 1. 智能解析器 (smart-parser.ts) - 新增

```typescript
interface SmartQueryResult {
  query: string;
  from: number;
  to: number;
  limit?: number;
  source: 'local' | 'llm';
}

// 主入口
export async function parseSmartQuery(
  description: string,
  options?: { useLLM?: boolean }
): Promise<SmartQueryResult>;
```

#### 1.1 本地解析增强

**中文数字转换表**（支持 `一` 到 `九十九`）：
```typescript
const CHINESE_NUMBERS: Record<string, number> = {
  // 个位数
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9,
  // 十位数
  '十': 10, '十一': 11, '十二': 12, // ... 到九十九
  '二十': 20, '二十一': 21, // ... 
  '三十': 30, // ...
  // 依此类推，完整映射一~九十九
};
```

**扩展时间正则**：
```
(?:最近|过去)?\s*(\d+|[一二三四五六七八九十百]+)\s*(分钟内?|小时(?:内|前)?|个?小时|天(?:内|前)?)
```

**时间词汇黑名单**（用于过滤残留时间词）：
```typescript
const TIME_WORDS = ['分钟', '小时', '天', '最近', '过去', '内', '前', 'ago'];
```

**解析逻辑**：
1. 匹配时间表达式 → 提取 `from`/`to`
2. 移除时间表达式 → 清洗停用词
3. 分词 → 过滤时间词汇
4. 扩展关键字（使用 `query-expander.ts`）
5. 构建查询语句

#### 1.2 LLM 解析器（可选）

**触发条件**：
- 本地解析返回空查询
- 本地解析失败（抛出异常）
- 查询包含明显无法本地解析的复杂语义

**Prompt 模板**：
```
将以下自然语言转换为阿里云 SLS 日志查询参数：
"{description}"

请返回严格 JSON 格式：
{
  "query": "SLS查询语句",
  "from": "相对时间如 7d ago",
  "to": "now 或相对时间"
}

规则：
- query 使用 SLS 查询语法（非 SQL）
- 时间格式支持：Nd ago, Nh ago, Nm ago
- 如果查询 ERROR/WARN 等日志级别，使用 level="ERROR" 格式
```

**LLM 配置**：
```typescript
interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  enabled: boolean;
  timeout?: number;  // 超时时间（毫秒），默认 10000ms
}
```

**超时与降级策略**：
- LLM 调用设置 10 秒超时
- 超时或 API 错误时，立即降级到本地解析结果（或 `*`）
- 错误信息包含在返回结果中，供用户参考

### 2. 时间解析器增强 (time-parser.ts)

新增函数：
```typescript
// 将中文数字转换为阿拉伯数字
export function chineseToNumber(chinese: string): number | null;

// 扩展的相对时间解析（支持中文）
export function parseRelativeTime(input: string): {
  value: number;
  unit: 'minute' | 'hour' | 'day';
} | null;
```

### 3. MCP 模式更新 (mcp-mode.ts)

更新 `smart_query_sls_logs` 处理逻辑：
```typescript
async function handleSmartQueryLogs(args, slsClient) {
  const description = String(args.description);
  
  // 使用新的智能解析器
  const parsed = await parseSmartQuery(description, {
    useLLM: process.env.ENABLE_LLM_QUERY === 'true'
  });
  
  // 在返回结果中标记解析来源
  const result = await slsClient.queryLogs({...});
  
  return {
    content: [{
      type: 'text',
      text: formatAsMarkdown(result, { 
        source: parsed.source,  // 标记是 local 还是 llm 解析
        originalQuery: parsed.query 
      })
    }]
  };
}
```

### 4. 格式化器增强 (formatter.ts)

在输出中增加解析来源标记：
```markdown
## 查询结果

**解析方式**: 本地解析 / LLM 增强
**查询语句**: `level="ERROR"`
**时间范围**: 2026-04-19 00:00:00 ~ 2026-04-26 00:00:00

| 时间 | 内容 |
|------|------|
| ... | ... |
```

## 数据流

### 成功路径（本地解析）
1. 用户输入：`"查询最近七天的ERROR日志"`
2. 本地解析器：
   - 匹配时间：`最近七天` → `from: now - 7d, to: now`
   - 提取关键词：`ERROR`（过滤 `查询`、`的`、`日志`）
   - 扩展关键字：`error OR ERROR OR 错误 OR 异常`
   - 生成查询：`level="ERROR" AND (error OR ERROR OR 错误 OR 异常)`
3. SLS Client 执行查询
4. 返回结果（标记 `source: 'local'`）

### Fallback 路径（LLM 增强）
1. 用户输入：`"帮我看看上周系统出了什么毛病"`
2. 本地解析器：
   - 时间匹配失败（无明确时间数字）
   - 关键词提取：`帮`, `看看`, `上周`, `系统`, `出`, `什么`, `毛病`
   - 过滤后仅剩：`系统`（意义不明）
   - 判定为解析失败 → 触发 LLM
3. LLM 解析器：
   - 构建 prompt
   - 调用 LLM API
   - 返回：`{ query: 'level="ERROR" OR level="WARN"', from: '7d ago', to: 'now' }`
4. SLS Client 执行查询
5. 返回结果（标记 `source: 'llm'`）

### 降级路径（全部失败）
1. 用户输入：无法解析的内容
2. 本地解析失败
3. LLM 未启用或调用失败
4. 返回：`{ query: '*', from: now - 1h, to: now, source: 'fallback' }`
5. 在输出中附带警告说明

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 本地解析失败 | 尝试 LLM（如启用） |
| LLM 未配置 | 回退到 `*`，附带说明 |
| LLM API 失败（超时/错误） | 回退到 `*`，附带错误信息 |
| 生成空查询 | 返回 `*`，避免无效查询 |
| 中文数字无法识别 | 尝试直接匹配阿拉伯数字 |
| 时间格式不支持 | 默认使用 `1h` |

## 配置

### 环境变量

在 `~/.config/opencode/opencode.json` 的 `ali-log` MCP 配置中增加：

```json
{
  "mcp": {
    "ali-log": {
      "type": "local",
      "command": ["npx", "tsx", "/data/webroot/fu/ali-log/src/index.ts"],
      "enabled": true,
      "environment": {
        "ALICLOUD_ACCESS_KEY_ID": "xxx",
        "ALICLOUD_ACCESS_KEY_SECRET": "xxx",
        "RUN_MODE": "mcp",
        "ENABLE_LLM_QUERY": "true",
        "LLM_API_KEY": "sk-xxx",
        "LLM_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "LLM_MODEL": "qwen-plus"
      }
    }
  }
}
```

| 环境变量 | 必填 | 默认值 | 说明 |
|----------|------|--------|------|
| `ENABLE_LLM_QUERY` | 否 | `false` | 是否启用 LLM 增强 |
| `LLM_API_KEY` | 条件 | - | LLM API Key（启用时必填） |
| `LLM_BASE_URL` | 否 | DashScope | LLM API 基础 URL |
| `LLM_MODEL` | 否 | `qwen-plus` | 使用的模型名称 |

### 配置读取

```typescript
// llm-client.ts
export interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
}

export function getLLMConfig(): LLMConfig | null {
  if (process.env.ENABLE_LLM_QUERY !== 'true') return null;
  
  return {
    enabled: true,
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.LLM_MODEL || 'qwen-plus',
  };
}
```

## 项目结构更新

```
ali-log/
├── src/
│   ├── index.ts           # 入口
│   ├── auth.ts            # 认证
│   ├── sls-client.ts      # SLS SDK 封装
│   ├── mcp-mode.ts        # MCP Server 模式
│   ├── smart-parser.ts    # 新增：智能查询解析器
│   ├── llm-client.ts      # 新增：LLM API 客户端
│   ├── time-parser.ts     # 增强：支持中文数字
│   ├── query-expander.ts  # 现有：关键字扩展
│   ├── formatter.ts       # 增强：显示解析来源
│   └── types.ts           # 类型定义
├── tests/
│   ├── smart-parser.test.ts      # 新增
│   ├── time-parser.test.ts       # 增强
│   └── query-expander.test.ts   # 现有
└── config/
    └── mcp.json           # MCP 配置
```

## 依赖

新增：
- `openai` - LLM API 调用（支持 OpenAI 兼容格式，包括 DashScope）

## 测试策略

### 单元测试

**smart-parser.test.ts**：
- 中文数字转换：`"七天"` → `7`, `"十五"` → `15`
- 时间匹配：`"最近七天内"`, `"过去5小时"`, `"30分钟前"`
- 关键词过滤：确保 `分钟`, `小时` 等词汇不会混入查询
- LLM fallback：模拟 LLM 调用失败时的降级行为

**time-parser.test.ts**：
- `parseRelativeTime` 函数测试
- 边界值：`"一百天"`（超出范围处理）

### 集成测试

- 本地解析全流程：`"最近1天的ERROR日志"` → 验证生成的查询语句
- LLM 解析全流程（需 mock）：验证 prompt 构建和结果解析

### 手动测试场景

| 输入 | 期望结果 |
|------|----------|
| `查询最近七天的ERROR日志` | 本地解析，查询 `level="ERROR"` |
| `过去十五分钟的异常` | 本地解析，时间范围正确 |
| `帮我看看上周系统出了什么毛病` | LLM 解析（如启用） |
| `invalid query xyz` | 降级到 `*`，附带说明 |

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM API 调用延迟 | 用户体验下降 | 设置 10s 超时，超时后降级 |
| LLM API 费用 | 成本增加 | 默认关闭，按需启用；优先本地解析 |
| LLM 返回格式错误 | 解析失败 | JSON 解析错误处理，降级到本地 |
| 中文数字歧义 | 解析错误 | `三十` vs `十三`，完善转换表 |
| 正则表达式性能 | 复杂输入卡顿 | 限制输入长度，优化正则 |

## 后续扩展

1. **缓存机制**：缓存常见查询的解析结果，减少 LLM 调用
2. **查询历史学习**：根据用户反馈优化本地解析规则
3. **多语言支持**：扩展英文自然语言查询的本地解析能力
4. **SPL/SQL 生成**：支持生成更复杂的分析语句（需更强大的 LLM prompt）
