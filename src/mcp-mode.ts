import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { SlsClient } from './sls-client.js';
import { getCredentials } from './auth.js';
import { formatAsMarkdown } from './formatter.js';
import { parseTime } from './time-parser.js';
import { getDefaultProject, getDefaultLogstore } from './query-expander.js';

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
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments as Record<string, unknown>;

    if (request.params.name === 'query_sls_logs') {
      return handleQueryLogs(args, slsClient);
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



