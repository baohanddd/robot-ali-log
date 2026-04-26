import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { SlsClient } from './sls-client.js';
import { getCredentials } from './auth.js';
import { formatAsMarkdown } from './formatter.js';
import { parseTime } from './time-parser.js';

export async function startMcpServer(): Promise<Server> {
  const credentials = getCredentials();
  const slsClient = new SlsClient(credentials);

  const server = new Server(
    {
      name: 'ali-log-mcp',
      version: '1.0.0',
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
                description: 'SLS project name',
              },
              logstore: {
                type: 'string',
                description: 'SLS logstore name',
              },
              query: {
                type: 'string',
                description: 'Query string (SLS query syntax or SQL)',
              },
              from: {
                type: 'string',
                description: 'Start time (unix timestamp or relative like "1h ago")',
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
            required: ['project', 'logstore', 'query', 'from', 'to'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'query_sls_logs') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args = request.params.arguments as Record<string, unknown>;
    
    const project = String(args.project);
    const logstore = String(args.logstore);
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
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
