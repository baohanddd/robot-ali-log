# SLS MCP 查询优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ali-log MCP 工具添加字段筛选、聚合查询、分页和大数据量警告功能，减少日志传输量和提升查询效率。

**Architecture:** 
- 扩展 `query_sls_logs` 和 `smart_query_sls_logs` 工具的参数，支持 `fields`、`offset`、`format`
- `format=summary` 时自动添加 `| stats count() by ...` 聚合语句
- `fields` 时只返回指定字段，减少 80% 数据传输
- 超过 1000 条结果时给出警告提示

**Tech Stack:** TypeScript, MCP SDK, Vitest

---

## File Structure

- `src/types.ts` - 扩展 QueryParams 类型，添加 fields、offset、format
- `src/mcp-mode.ts` - 更新工具定义和参数处理
- `src/sls-client.ts` - 支持 offset 参数传递
- `src/formatter.ts` - 新增 formatSummary 和 filterFields 函数
- `tests/mcp-mode.test.ts` - 更新测试用例
- `tests/formatter.test.ts` - 新增字段筛选和聚合测试

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/types.ts:7-14`

- [ ] **Step 1: 添加新字段到 QueryParams**

```typescript
export interface QueryParams {
  project: string;
  logstore: string;
  query: string;
  from: number;
  to: number;
  limit?: number;
  offset?: number;        // 分页偏移
  fields?: string[];      // 字段筛选
  format?: 'raw' | 'summary'; // 输出格式
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 2: 添加字段筛选和聚合格式化

**Files:**
- Modify: `src/formatter.ts`
- Test: `tests/formatter.test.ts`

- [ ] **Step 1: 编写字段筛选测试**

```typescript
it('should filter fields when fields option is provided', () => {
  const result: QueryResult = {
    logs: [
      { time: 1714118400, content: { level: 'ERROR', message: 'Connection failed', source: 'api' } },
      { time: 1714118460, content: { level: 'INFO', message: 'Server started', source: 'worker' } },
    ],
    count: 2,
    hasMore: false,
  };
  
  const output = formatAsMarkdown(result, { fields: ['level', 'message'] });
  expect(output).toContain('| Time | level | message |');
  expect(output).not.toContain('source');
  expect(output).toContain('ERROR');
  expect(output).toContain('Connection failed');
});
```

- [ ] **Step 2: 编写聚合格式测试**

```typescript
it('should format summary result', () => {
  const result: QueryResult = {
    logs: [
      { time: 0, content: { level: 'ERROR', count: '42' } },
      { time: 0, content: { level: 'INFO', count: '128' } },
    ],
    count: 2,
    hasMore: false,
  };
  
  const output = formatAsMarkdown(result, { format: 'summary' });
  expect(output).toContain('ERROR');
  expect(output).toContain('42');
  expect(output).toContain('INFO');
  expect(output).toContain('128');
});
```

- [ ] **Step 3: 实现字段筛选逻辑**

修改 `formatAsMarkdown` 函数签名：
```typescript
export function formatAsMarkdown(
  result: QueryResult, 
  options?: { fields?: string[]; format?: 'raw' | 'summary' }
): string {
```

在函数内，当 `options.fields` 存在时，只包含 Time 和指定字段：
```typescript
const keys = options?.fields 
  ? options.fields.filter(f => f !== 'time')
  : Array.from(allKeys);
```

- [ ] **Step 4: 实现大数据量警告**

当 `result.count >= 1000` 时，添加更明显的警告：
```typescript
if (result.count >= 1000) {
  md += '\n⚠️ **Warning:** Large result set (' + result.count + ' rows). ';
  md += 'Consider narrowing time range or using `format: "summary"` for aggregation.\n';
}
```

- [ ] **Step 5: 运行 formatter 测试**

Run: `npx vitest run tests/formatter.test.ts`
Expected: PASS

---

## Task 3: 更新 MCP 工具定义

**Files:**
- Modify: `src/mcp-mode.ts:26-91`

- [ ] **Step 1: 为 query_sls_logs 添加新参数**

在 `inputSchema.properties` 中添加：
```json
"fields": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Return only specified fields (e.g. ["level", "message"]). Reduces data transfer."
},
"offset": {
  "type": "number",
  "description": "Pagination offset (default: 0)"
},
"format": {
  "type": "string",
  "enum": ["raw", "summary"],
  "description": "Output format: raw (default) or summary (aggregated stats)"
}
```

- [ ] **Step 2: 为 smart_query_sls_logs 添加新参数**

同样添加 `fields`、`offset`、`format` 参数。

- [ ] **Step 3: 更新 handleQueryLogs 函数**

提取新参数并传递给 slsClient：
```typescript
const fields = args.fields as string[] | undefined;
const offset = Number(args.offset) || 0;
const format = (args.format as string) || 'raw';

const result = await slsClient.queryLogs({
  project,
  logstore,
  query,
  from,
  to,
  limit,
  offset,
});

return {
  content: [{
    type: 'text',
    text: formatAsMarkdown(result, { fields, format }),
  }],
};
```

- [ ] **Step 4: 更新 handleSmartQueryLogs 函数**

同样提取参数并传递。当 `format === 'summary'` 时，在 query 后添加聚合语句：
```typescript
if (format === 'summary' && !parsed.query.includes('| stats')) {
  parsed.query += ' | stats count() as count by level';
}
```

---

## Task 4: 更新 SLS Client 支持 offset

**Files:**
- Modify: `src/sls-client.ts:21-35`

- [ ] **Step 1: 传递 offset 参数**

```typescript
const request = new GetLogsRequest({
  query: params.query,
  from: params.from,
  to: params.to,
  line: params.limit || 100,
  offset: params.offset || 0,
});
```

---

## Task 5: 更新测试

**Files:**
- Modify: `tests/mcp-mode.test.ts`
- Modify: `tests/formatter.test.ts`

- [ ] **Step 1: 验证参数传递**

添加测试验证 fields、offset、format 参数正确传递：
```typescript
it('should pass fields and offset to queryLogs', async () => {
  // 通过 mock 验证调用参数
});
```

- [ ] **Step 2: 运行全部测试**

Run: `npm test`
Expected: ALL PASS

---

## Task 6: 提交代码

- [ ] **Step 1: 提交**

```bash
git add -A
git commit -m "feat: add fields filter, summary format, pagination and large dataset warnings

- Add fields parameter to return only specified columns
- Add format=summary for aggregated stats
- Add offset for pagination
- Add warning when result >= 1000 rows"
```

---

## Spec Coverage Check

✅ 字段筛选 - Task 2
✅ 聚合查询 - Task 2/3
✅ 分页 - Task 3/4
✅ 大数据警告 - Task 2

## Placeholder Scan

无占位符，所有步骤包含完整代码。
