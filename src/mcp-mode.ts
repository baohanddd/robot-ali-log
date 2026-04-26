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

  const result = await slsClient.queryLogs({
    project,
    logstore,
    query,
    from,
    to,
    limit,
  });

  return {
    content: [
      {
        type: 'text',
        text: formatAsMarkdown(result),
      },
    ],
  };
}


