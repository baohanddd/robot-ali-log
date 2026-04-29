# Remove Smart Query & LLM Integration — Design

## Background

The `ali-log-mcp` server currently exposes two MCP tools:
- `query_sls_logs` — direct query with standard parameters
- `smart_query_sls_logs` — natural-language query that internally tries to parse intent using either local regex rules or an LLM client (`llm-client.ts`)

The smart query layer adds unnecessary complexity:
- Double intent parsing: the outer model (OpenCode/GPT/Claude) already understands natural language, then the tool tries to re-parse it internally
- Extra latency: LLM round-trip inside the tool
- Debugging pain: when a query fails, it's unclear whether the outer model or the internal parser got it wrong
- Extra dependency: `openai` package and LLM credentials

## Goal

Remove `smart_query_sls_logs`, `smart-parser.ts`, `llm-client.ts`, and all LLM-related configuration. Keep only `query_sls_logs` as the single atomic tool. The outer model is responsible for translating natural language into precise tool arguments.

## Design

### 1. Tool Surface

Only `query_sls_logs` remains. Its inputSchema must be **explicit, self-documenting, and example-rich** so the calling model knows exactly what to pass.

Updated schema (detailed descriptions with examples):

```json
{
  "name": "query_sls_logs",
  "description": "Query logs from Alibaba Cloud SLS (Log Service). You MUST compute the time range explicitly and pass Unix timestamps or relative time strings.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "project": {
        "type": "string",
        "description": "SLS project name. Optional if defaultProject is set in config/mcp.json."
      },
      "logstore": {
        "type": "string",
        "description": "SLS logstore name. Optional if defaultLogstore is set in config/mcp.json."
      },
      "query": {
        "type": "string",
        "description": "SLS query string. Supports SLS query syntax (SPL) or SQL. Examples: \"*\" (all logs), \"level=\\\"ERROR\\\"\" (error logs), \"channel:api AND uri:\"/tickets\"\" (api requests to /tickets), \"request_id:\\\"4345DC23-3049-474B-B4AE-2FD6796A0566\\\"\" (find by request ID)"
      },
      "from": {
        "type": "string",
        "description": "Start time. Can be a Unix timestamp (seconds) or a relative string. Supported relative strings: \"1h ago\", \"30m ago\", \"7d ago\", \"昨天\" (yesterday), \"1天前\". Examples: \"1h ago\", \"2026-04-28T00:00:00Z\""
      },
      "to": {
        "type": "string",
        "description": "End time. Can be a Unix timestamp (seconds), a relative string, or \"now\". Examples: \"now\", \"30m ago\""
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of logs to return. Default: 100, max: 1000."
      },
      "offset": {
        "type": "number",
        "description": "Pagination offset. Default: 0."
      },
      "fields": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Return only specified fields to reduce data transfer. Example: [\"level\", \"message\", \"uri\"]"
      },
      "format": {
        "type": "string",
        "enum": ["raw", "summary"],
        "description": "Output format. raw (default) returns individual log rows. summary returns aggregated stats."
      }
    },
    "required": ["query", "from", "to"]
  }
}
```

### 2. Code Changes

#### Delete
- `src/smart-parser.ts`
- `src/llm-client.ts`
- `tests/smart-parser.test.ts`
- `tests/smart-query.test.ts`
- `tests/llm-client.test.ts`

#### Modify
- `src/mcp-mode.ts`
  - Remove `smart_query_sls_logs` from tool list
  - Remove `handleSmartQueryLogs` function
  - Remove import of `parseSmartQuery`
  - Keep `handleQueryLogs` unchanged (it already delegates to `slsClient.queryLogs`)
  - Expand `query_sls_logs` description to include examples

- `src/formatter.ts`
  - Remove `source` and `originalQuery` from `FormatOptions`
  - Remove source label rendering logic
  - Keep markdown table formatting

- `src/query-expander.ts`
  - Remove `expandKeywords`
  - Remove `resolveLogstore`
  - Remove `extractLogstoreFromDescription`
  - Keep `loadConfig`, `getDefaultProject`, `getDefaultLogstore`, `getDefaultRegion`
  - Remove `LogstoreConfig` interface (no longer needed)

- `config/mcp.json`
  - Remove `queryAliases` section
  - Remove `logstores` section
  - Keep `defaultProject`, `defaultLogstore`, `defaultRegion`

- `package.json`
  - Remove `openai` from `dependencies`

- `.env.example`
  - Remove `ENABLE_LLM_QUERY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`

- `README.md`
  - Remove entire `smart_query_sls_logs` section
  - Remove LLM configuration section
  - Update tool list to show only `query_sls_logs`

- `AGENTS.md`
  - Remove LLM-related environment variables from the table

- `tests/mcp-mode.test.ts`
  - Remove test case for `smart_query_sls_logs`

### 3. Error Handling & Backward Compatibility

- `smart_query_sls_logs` will simply no longer exist; calling clients that reference it will receive an "Unknown tool" error
- No migration shim: this is an intentional breaking change because the tool was always opt-in (required `ENABLE_LLM_QUERY=true` for full functionality)

### 4. Testing Strategy

- `npm test` must pass after deleting smart-query/llm tests
- Verify `query_sls_logs` still works with `from`/`to` as relative strings (relies on existing `parseTime` in `time-parser.ts`)
- Verify `npm run build` compiles cleanly

## Scope

This is a focused cleanup: **delete smart-query layer, strengthen the direct query tool's documentation, remove openai dependency**.

No changes to:
- `sls-client.ts`
- `auth.ts`
- `time-parser.ts`
- `daemon-mode.ts`
- `src/index.ts`

## Files to change

| File | Action |
|------|--------|
| `src/mcp-mode.ts` | Modify |
| `src/formatter.ts` | Modify |
| `src/query-expander.ts` | Modify |
| `src/smart-parser.ts` | Delete |
| `src/llm-client.ts` | Delete |
| `tests/smart-parser.test.ts` | Delete |
| `tests/smart-query.test.ts` | Delete |
| `tests/llm-client.test.ts` | Delete |
| `tests/mcp-mode.test.ts` | Modify |
| `config/mcp.json` | Modify |
| `package.json` | Modify |
| `.env.example` | Modify |
| `README.md` | Modify |
| `AGENTS.md` | Modify |
