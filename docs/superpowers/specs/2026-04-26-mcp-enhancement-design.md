# MCP Server 增强设计文档

## 日期
2026-04-26

## 背景
当前 MCP Server 的 `query_sls_logs` 工具要求每次调用都传入 `project` 和 `logstore`，且时间解析只支持英文格式，关键词不支持中文别名。这导致用户查询时需要记住具体的 project/logstore 名称，且必须用英文表达时间。

## 目标
1. 将 project/logstore 配置从 `.env` 分离到独立配置文件，作为默认值
2. 支持中文时间表达解析（如"4小时"、"昨天"）
3. 支持关键词别名自动映射（如"短信"→"sms OR 短信"）
4. 提供自然语言查询工具，简化查询流程

## 设计

### 1. 配置分离

**文件**: `config/mcp.json`

```json
{
  "defaultProject": "fu-project",
  "defaultLogstore": "pro",
  "queryAliases": {
    "sms": ["sms", "短信", "message", "验证码"],
    "error": ["error", "ERROR", "错误", "异常", "exception"],
    "api": ["api", "接口", "request", "响应", "response"]
  }
}
```

**修改** `src/mcp-mode.ts`:
- `project` 和 `logstore` 从 required 变为 optional
- 优先使用传入的参数，否则读取配置文件默认值
- 如果都没有，抛出错误

### 2. 时间解析增强

**文件**: `src/time-parser.ts`

扩展现有 `parseTime` 函数：

| 输入 | 含义 | 输出 |
|------|------|------|
| `4h ago` / `4h` | 4小时前 | now - 4*3600 |
| `4小时` / `4个小时` | 4小时前 | now - 4*3600 |
| `30m ago` / `30m` | 30分钟前 | now - 30*60 |
| `30分钟` / `30分钟前` | 30分钟前 | now - 30*60 |
| `1d ago` / `1d` | 1天前 | now - 86400 |
| `1天` / `1天前` | 1天前 | now - 86400 |
| `昨天` | 昨天00:00 | yesterday 00:00 |
| `今天` | 今天00:00 | today 00:00 |
| Unix时间戳 | 绝对时间 | 原值 |

### 3. 关键词别名映射

**新建文件**: `src/query-expander.ts`

```typescript
export function expandKeywords(input: string): string {
  // 1. 检查 input 是否在别名表中
  // 2. 如果在，返回 "alias1 OR alias2 OR ..."
  // 3. 如果不在，原样返回
}
```

### 4. 智能查询工具

**修改** `src/mcp-mode.ts`:

新增 `smart_query_sls_logs` 工具：

```typescript
{
  name: 'smart_query_sls_logs',
  description: 'Query logs using natural language description',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description like "最近4小时的短信日志"'
      },
      project: { type: 'string', description: 'Optional SLS project' },
      logstore: { type: 'string', description: 'Optional SLS logstore' },
      limit: { type: 'number' }
    },
    required: ['description']
  }
}
```

**解析逻辑**:
1. 从 description 中提取时间范围（正则匹配）
2. 从 description 中提取关键词（通过别名表匹配）
3. 组合成标准查询参数，调用基础查询

## 测试计划

1. 新增 `tests/time-parser.test.ts` 测试用例覆盖中文时间
2. 新增 `tests/query-expander.test.ts` 测试关键词展开
3. 更新 `tests/mcp-mode.test.ts` 测试智能查询
4. 运行 `npm test` 验证全部通过

## 兼容性

- 现有 `query_sls_logs` 工具保持向后兼容
- `project`/`logstore` 变为 optional 不影响已有调用
- 时间解析器增强不破坏现有英文格式支持
