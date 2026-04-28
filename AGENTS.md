# AGENTS.md

## Project

Ali Log MCP Server — TypeScript-based MCP server and daemon for querying Alibaba Cloud SLS (Log Service).

## Architecture

- **Entry**: `src/index.ts` loads `dotenv/config` and branches by `RUN_MODE` env var into:
  - `mcp` mode (default): `src/mcp-mode.ts` — stdio-based MCP server
  - `daemon` mode: `src/daemon-mode.ts` — polls SLS for error logs on an interval
- **Core modules**: `auth.ts`, `sls-client.ts`, `formatter.ts`, `smart-parser.ts`, `time-parser.ts`, `query-expander.ts`, `llm-client.ts`
- **Config**: `config/mcp.json` stores query aliases and default project/logstore/region
- **Types**: `src/types.ts` — shared interfaces for credentials, query params, and daemon config

## Commands

```bash
npm run build        # tsc compiles src/ → dist/
npm run dev          # tsx src/index.ts (auto-reloads via tsx)
npm test             # vitest run (single pass)
npm run test:watch   # vitest watch mode
```

## Testing

- Vitest v1.2.0 with `globals: true` and `environment: 'node'`
- Test files: `tests/**/*.test.ts`
- No separate typecheck or lint scripts — rely on `tsc` during build

## Environment

The app auto-loads `.env` via `import 'dotenv/config'` in `src/index.ts`. Key variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `RUN_MODE` | No | `mcp` (default) or `daemon` |
| `ALICLOUD_ACCESS_KEY_ID` | Yes | RAM sub-account with SLS read-only recommended |
| `ALICLOUD_ACCESS_KEY_SECRET` | Yes | |
| `ALICLOUD_REGION` | No | Default `cn-hangzhou` |
| `SLS_PROJECT` | Daemon only | |
| `SLS_LOGSTORE` | Daemon only | |
| `POLL_INTERVAL` | No | Daemon poll interval in seconds, default `300` |
| `ENABLE_LLM_QUERY` | No | `true` to enable LLM-enhanced natural language queries |
| `LLM_API_KEY` | If LLM enabled | OpenAI-compatible API key |
| `LLM_BASE_URL` | No | Default DashScope endpoint |
| `LLM_MODEL` | No | Default `qwen-plus` |

## TypeScript Conventions

- Node16 module resolution: import paths must include `.js` extensions (e.g., `import { x } from './foo.js'`)
- `strict: true` enabled — avoid `any` or implicit types
- Target ES2022, output `dist/`, declarations and source maps generated

## MCP Integration

When registering as an MCP server (e.g., in OpenCode config), run:
```bash
npx tsx /path/to/ali-log/src/index.ts
```
With `RUN_MODE=mcp` and `ALICLOUD_ACCESS_KEY_ID` / `ALICLOUD_ACCESS_KEY_SECRET` in environment.

## Important Notes

- `.env` is gitignored; copy `.env.example` to `.env` for local development
- `config/mcp.json` is checked in and contains default query aliases — update aliases there, not in code
- The SLS SDK (`@alicloud/sls20201230`) requires valid Alibaba Cloud credentials; tests may mock the client
- Daemon mode writes to `logs/` if `DAEMON_OUTPUT=file` — ensure directory exists or let app create it
