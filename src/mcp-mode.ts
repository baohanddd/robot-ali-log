import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { SlsClient } from './sls-client.js';
import { getCredentials } from './auth.js';
import { formatAsMarkdown } from './formatter.js';
import { parseTime } from './time-parser.js';
import { getDefaultProject, getDefaultLogstore, expandKeywords } from './query-expander.js';
import { parseSmartQuery } from './smart-parser.js';

export async function startMcpServer(): Promise<Server> {
  const credentials = getCredentials();
  const slsClient = new SlsClient(credentials);

  const server = new Server(
    {
      name: 'ali-log-mcp',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
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
                description: 'SLS project name (optional if configured in config/mcp.json)',
              },
              logstore: {
                type: 'string',
                description: 'SLS logstore name (optional if configured in config/mcp.json)',
              },
              query: {
                type: 'string',
                description: 'Query string (SLS query syntax or SQL)',
              },
              from: {
                type: 'string',
                description: 'Start time (unix timestamp or relative like "1h ago", "4小时", "昨天")',
              },
              to: {
                type: 'string',
                description: 'End time (unix timestamp or relative like "now")',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of logs to return (default: 100, max: 1000)',
              },
              offset: {
                type: 'number',
                description: 'Pagination offset (default: 0)',
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description: 'Return only specified fields (e.g. ["level", "message"]). Reduces data transfer.',
              },
              format: {
                type: 'string',
                enum: ['raw', 'summary'],
                description: 'Output format: raw (default) or summary (aggregated stats)',
              },
            },
            required: ['query', 'from', 'to'],
          },
        },
        {
          name: 'smart_query_sls_logs',
          description: 'Query logs using natural language description (supports Chinese)',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description like "最近4小时的短信日志" or "查询15分钟内ERROR日志"',
              },
              project: {
                type: 'string',
                description: 'SLS project name (optional if configured in config/mcp.json)',
              },
              logstore: {
                type: 'string',
                description: 'SLS logstore name (optional if configured in config/mcp.json)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of logs to return (default: 100, max: 1000)',
              },
              offset: {
                type: 'number',
                description: 'Pagination offset (default: 0)',
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description: 'Return only specified fields (e.g. ["level", "message"]). Reduces data transfer.',
              },
              format: {
                type: 'string',
                enum: ['raw', 'summary'],
                description: 'Output format: raw (default) or summary (aggregated stats)',
              },
            },
            required: ['description'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments as Record<string, unknown>;

    if (request.params.name === 'query_sls_logs') {
      return handleQueryLogs(args, slsClient);
    }
    if (request.params.name === 'smart_query_sls_logs') {
      return handleSmartQueryLogs(args, slsClient);
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}

async function handleQueryLogs(
  args: Record<string, unknown>,
  slsClient: SlsClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const project = String(args.project || getDefaultProject());
  const logstore = String(args.logstore || getDefaultLogstore());

  if (!project) {
    throw new Error('project is required (or set defaultProject in config/mcp.json)');
  }
  if (!logstore) {
    throw new Error('logstore is required (or set defaultLogstore in config/mcp.json)');
  }

  const query = String(args.query);
  const from = parseTime(String(args.from));
  const to = args.to === 'now' ? Math.floor(Date.now() / 1000) : parseTime(String(args.to));
  const limit = Math.min(Number(args.limit) || 100, 1000);
  const offset = Number(args.offset) || 0;
  const fields = Array.isArray(args.fields) ? args.fields as string[] : undefined;
  const format = ((args.format as string) || 'raw') as 'raw' | 'summary';

  const result = await slsClient.queryLogs({
    project,
    logstore,
    query,
    from,
    to,
    limit,
    offset,
    fields,
    format,
  });

  return {
    content: [
      {
        type: 'text',
        text: formatAsMarkdown(result, { fields, format }),
      },
    ],
  };
}

async function handleSmartQueryLogs(
  args: Record<string, unknown>,
  slsClient: SlsClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const description = String(args.description);
  
  // 使用新的智能解析器
  const parsed = await parseSmartQuery(description, {
    useLLM: process.env.ENABLE_LLM_QUERY === 'true'
  });

  // Merge with explicit args if provided
  const project = String(args.project || getDefaultProject());
  const logstore = String(args.logstore || getDefaultLogstore());

  if (!project) {
    throw new Error('project is required (or set defaultProject in config/mcp.json)');
  }
  if (!logstore) {
    throw new Error('logstore is required (or set defaultLogstore in config/mcp.json)');
  }

  const limit = Math.min(Number(args.limit || parsed.limit) || 100, 1000);
  const offset = Number(args.offset) || 0;
  const fields = Array.isArray(args.fields) ? args.fields as string[] : undefined;
  const format = ((args.format as string) || 'raw') as 'raw' | 'summary';

  const query = parsed.query;

  const result = await slsClient.queryLogs({
    project,
    logstore,
    query,
    from: parsed.from,
    to: parsed.to,
    limit,
    offset,
    fields,
    format,
  });

  return {
    content: [
      {
        type: 'text',
        text: formatAsMarkdown(result, { 
          fields, 
          format,
          source: parsed.source,
          originalQuery: parsed.query,
        }),
      },
    ],
  };
}



