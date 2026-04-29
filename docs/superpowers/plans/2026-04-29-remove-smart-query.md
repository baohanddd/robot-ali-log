# Remove Smart Query & LLM Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `smart_query_sls_logs`, `smart-parser.ts`, `llm-client.ts`, and all LLM-related code/configuration. Keep only `query_sls_logs` as the single atomic MCP tool.

**Architecture:** The outer model (OpenCode/Claude/GPT) is now solely responsible for natural language → tool parameter translation. The MCP server becomes a thin adapter: receive parameters → validate → call SLS API → format response.

**Tech Stack:** TypeScript, MCP SDK, Vitest, Alibaba Cloud SLS SDK

---

### Task 1: Remove smart query from MCP tool registration

**Files:**
- Modify: `src/mcp-mode.ts`

- [ ] **Step 1: Remove `smart_query_sls_logs` tool definition and import**

  Remove the `smart_query_sls_logs` JSON object from the `tools` array (lines 78-117).
  Remove `import { parseSmartQuery } from './smart-parser.js';` (line 9).

  After removal, the `tools` array should contain only `query_sls_logs`.

  ```typescript
  // src/mcp-mode.ts — tools array after removal
  tools: [
    {
      name: 'query_sls_logs',
      description: 'Query logs from Alibaba Cloud SLS (Log Service). You MUST compute the time range explicitly and pass Unix timestamps or relative time strings. Examples: query="*" returns all logs; query="level=\\"ERROR\\"" returns error logs; query="channel:api AND uri:\"/tickets\"" returns API requests to /tickets; from="1h ago" to="now" queries the last hour.',
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: 'SLS project name. Optional if defaultProject is set in config/mcp.json.',
          },
          logstore: {
            type: 'string',
            description: 'SLS logstore name. Optional if defaultLogstore is set in config/mcp.json.',
          },
          query: {
            type: 'string',
            description: 'SLS query string. Supports SLS query syntax (SPL) or SQL. Examples: "*" (all logs), "level=\\"ERROR\\"" (error logs), "channel:api AND uri:\"/tickets\"" (api requests to /tickets), "request_id:\\\"4345DC23-3049-474B-B4AE-2FD6796A0566\\\"" (find by request ID).',
          },
          from: {
            type: 'string',
            description: 'Start time. Can be a Unix timestamp (seconds) or a relative string. Supported: "1h ago", "30m ago", "7d ago", "昨天" (yesterday), "1天前".',
          },
          to: {
            type: 'string',
            description: 'End time. Can be a Unix timestamp (seconds), a relative string, or "now".',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of logs to return. Default: 100, max: 1000.',
          },
          offset: {
            type: 'number',
            description: 'Pagination offset. Default: 0.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Return only specified fields to reduce data transfer. Example: ["level", "message", "uri"]',
          },
          format: {
            type: 'string',
            enum: ['raw', 'summary'],
            description: 'Output format. raw (default) returns individual log rows. summary returns aggregated stats.',
          },
        },
        required: ['query', 'from', 'to'],
      },
    },
  ],
  ```

- [ ] **Step 2: Remove `handleSmartQueryLogs` function and its call site**

  Delete the entire `handleSmartQueryLogs` function (lines 185-239).
  In `CallToolRequestSchema` handler, remove the `smart_query_sls_logs` branch (lines 128-130).

  The handler should now look like:
  ```typescript
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments as Record<string, unknown>;

    if (request.params.name === 'query_sls_logs') {
      return handleQueryLogs(args, slsClient);
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });
  ```

- [ ] **Step 3: Verify build**

  Run: `npm run build`
  Expected: Compiles without errors (smart-parser import removed)

- [ ] **Step 4: Commit**

  ```bash
  git add src/mcp-mode.ts
  git commit -m "feat(mcp): remove smart_query_sls_logs, expand query_sls_logs docs"
  ```

---

### Task 2: Clean up formatter (remove source/originalQuery display)

**Files:**
- Modify: `src/formatter.ts`

- [ ] **Step 1: Remove `source` and `originalQuery` from FormatOptions**

  ```typescript
  // Before:
  interface FormatOptions {
    fields?: string[];
    format?: 'raw' | 'summary';
    source?: 'local' | 'llm' | 'fallback';
    originalQuery?: string;
  }

  // After:
  interface FormatOptions {
    fields?: string[];
    format?: 'raw' | 'summary';
  }
  ```

- [ ] **Step 2: Remove source label rendering logic**

  Delete the entire source/originalQuery header block (lines 20-34):
  ```typescript
  // DELETE this block:
  // Add query source info header
  if (options?.source) {
    const sourceLabel: Record<string, string> = {
      local: '本地解析',
      llm: 'LLM增强',
      fallback: '默认查询'
    };
    md += `**解析方式**: ${sourceLabel[options.source] || options.source}\n`;
  }
  if (options?.originalQuery) {
    md += `**查询语句**: \`${options.originalQuery}\`\n`;
  }
  if (options?.source || options?.originalQuery) {
    md += '\n';
  }
  ```

- [ ] **Step 3: Verify build**

  Run: `npm run build`
  Expected: Compiles without errors

- [ ] **Step 4: Commit**

  ```bash
  git add src/formatter.ts
  git commit -m "refactor(formatter): remove smart-query source labels"
  ```

---

### Task 3: Simplify query-expander.ts

**Files:**
- Modify: `src/query-expander.ts`

- [ ] **Step 1: Remove `LogstoreConfig` interface and `queryAliases`/`logstores` from `McpConfig`**

  ```typescript
  // Before:
  interface McpConfig {
    defaultProject?: string;
    defaultLogstore?: string;
    defaultRegion?: string;
    queryAliases?: Record<string, string[]>;
    logstores?: LogstoreConfig[];
  }

  // After:
  interface McpConfig {
    defaultProject?: string;
    defaultLogstore?: string;
    defaultRegion?: string;
  }
  ```

  Also delete the `LogstoreConfig` interface entirely.

- [ ] **Step 2: Remove `expandKeywords`, `resolveLogstore`, `extractLogstoreFromDescription`**

  Delete functions `expandKeywords` (lines 61-82), `resolveLogstore` (lines 84-118), and `extractLogstoreFromDescription` (lines 120-141).

  The file should now contain only:
  - `clearCache`
  - `loadConfig`
  - `getDefaultProject`
  - `getDefaultLogstore`
  - `getDefaultRegion`

- [ ] **Step 3: Verify build**

  Run: `npm run build`
  Expected: Compiles without errors

- [ ] **Step 4: Commit**

  ```bash
  git add src/query-expander.ts
  git commit -m "refactor(query-expander): remove keyword expansion and logstore resolution"
  ```

---

### Task 4: Delete smart-parser and llm-client source files

**Files:**
- Delete: `src/smart-parser.ts`
- Delete: `src/llm-client.ts`

- [ ] **Step 1: Delete files**

  ```bash
  rm src/smart-parser.ts src/llm-client.ts
  ```

- [ ] **Step 2: Verify build**

  Run: `npm run build`
  Expected: Compiles without errors (these files are no longer imported by anyone after Task 1)

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "chore: delete smart-parser and llm-client"
  ```

---

### Task 5: Update config/mcp.json

**Files:**
- Modify: `config/mcp.json`

- [ ] **Step 1: Remove `queryAliases` and `logstores` sections**

  ```json
  {
    "defaultProject": "fu-project",
    "defaultLogstore": "pro",
    "defaultRegion": "cn-shenzhen"
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add config/mcp.json
  git commit -m "config(mcp): remove queryAliases and logstores"
  ```

---

### Task 6: Remove openai dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove `openai` from dependencies**

  In `package.json`, remove the line:
  ```json
  "openai": "^6.34.0"
  ```

- [ ] **Step 2: Regenerate lockfile**

  Run: `npm install`
  Expected: `package-lock.json` updates, `node_modules/openai` removed

- [ ] **Step 3: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "deps: remove openai dependency"
  ```

---

### Task 7: Clean up test files

**Files:**
- Delete: `tests/smart-parser.test.ts`
- Delete: `tests/smart-query.test.ts`
- Delete: `tests/llm-client.test.ts`
- Modify: `tests/mcp-mode.test.ts`

- [ ] **Step 1: Delete smart-query and llm test files**

  ```bash
  rm tests/smart-parser.test.ts tests/smart-query.test.ts tests/llm-client.test.ts
  ```

- [ ] **Step 2: Remove smart-query test from mcp-mode.test.ts**

  Delete the test case `should handle smart_query_sls_logs tool` (lines 63-70):
  ```typescript
  // DELETE:
  it('should handle smart_query_sls_logs tool', async () => {
    const server = await startMcpServer();
    expect(server).toBeDefined();
    
    // Verify that setRequestHandler was called with ListToolsRequestSchema
    const mockServer = vi.mocked(await startMcpServer());
    expect(mockServer).toBeDefined();
  });
  ```

- [ ] **Step 3: Verify tests pass**

  Run: `npm test`
  Expected: All tests pass (no smart-query/llm tests remain)

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "test: remove smart-query and llm tests"
  ```

---

### Task 8: Update environment configuration template

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove LLM-related environment variables**

  Delete these lines from `.env.example`:
  ```bash
  # LLM 增强查询（可选）
  ENABLE_LLM_QUERY=false
  LLM_API_KEY=
  LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
  LLM_MODEL=qwen-plus
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .env.example
  git commit -m "config(env): remove LLM environment variables"
  ```

---

### Task 9: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove smart_query_sls_logs section**

  Delete the entire section starting from `### smart_query_sls_logs 增强` (lines 143-176) through the LLM configuration table.

- [ ] **Step 2: Remove LLM config from OpenCode example**

  In the OpenCode configuration example (around line 110), remove any `ENABLE_LLM_QUERY` or `LLM_*` env vars if present.

- [ ] **Step 3: Update tool list**

  Ensure the MCP Tools section only documents `query_sls_logs`.

- [ ] **Step 4: Commit**

  ```bash
  git add README.md
  git commit -m "docs(readme): remove smart query and LLM documentation"
  ```

---

### Task 10: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Remove LLM-related environment variables from table**

  Delete these rows from the environment variables table:
  - `ENABLE_LLM_QUERY`
  - `LLM_API_KEY`
  - `LLM_BASE_URL`
  - `LLM_MODEL`

- [ ] **Step 2: Commit**

  ```bash
  git add AGENTS.md
  git commit -m "docs(agents): remove LLM environment variables"
  ```

---

### Task 11: Final verification

- [ ] **Step 1: Run full build**

  Run: `npm run build`
  Expected: Zero errors, zero warnings

- [ ] **Step 2: Run full test suite**

  Run: `npm test`
  Expected: All tests pass

- [ ] **Step 3: Verify no orphaned imports**

  Run: `grep -r "smart-parser\|llm-client\|parseSmartQuery\|callLLM\|getLLMConfig\|ENABLE_LLM_QUERY\|LLM_API_KEY" src/ tests/ config/ || echo "Clean — no references found"`
  Expected: "Clean — no references found"

- [ ] **Step 4: Commit final state**

  ```bash
  git add -A
  git commit -m "refactor: complete removal of smart query and LLM integration"
  ```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every item from the design doc has a corresponding task.
- [x] **No placeholders:** Every step has exact file paths, exact code, exact commands.
- [x] **Type consistency:** `FormatOptions` removed `source`/`originalQuery` consistently across formatter.
- [x] **Test coverage:** Removed only smart-query/llm tests; kept mcp-mode and other existing tests.
- [x] **Dependencies:** `openai` removal handled in Task 6.
- [x] **Documentation:** README and AGENTS.md updates in Tasks 9-10.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-remove-smart-query.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach do you prefer?
