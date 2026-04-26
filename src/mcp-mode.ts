import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { SlsClient } from './sls-client.js';
import { getCredentials } from './auth.js';
import { formatAsMarkdown } from './formatter.js';
import { parseTime } from './time-parser.js';
import { getDefaultProject, getDefaultLogstore, expandKeywords } from './query-expander.js';

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
        {
          name: 'smart_query_sls_logs',
          description: 'Query logs using natural language description. Automatically parses time range and expands keywords.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description like "最近4小时的短信日志" or "查一下昨天的错误"',
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

async function handleSmartQueryLogs(
  args: Record<string, unknown>,
  slsClient: SlsClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const description = String(args.description);
  const project = String(args.project || getDefaultProject());
  const logstore = String(args.logstore || getDefaultLogstore());

  if (!project) {
    throw new Error('project is required (or set defaultProject in config/mcp.json)');
  }
  if (!logstore) {
    throw new Error('logstore is required (or set defaultLogstore in config/mcp.json)');
  }

  const { from, to, query } = parseSmartQuery(description);
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
        text: `Query: "${description}"\nParsed: from=${from}, to=${to}, query="${query}"\n\n${formatAsMarkdown(result)}`,
      },
    ],
  };
}

function parseSmartQuery(description: string): { from: number; to: number; query: string } {
  const now = Math.floor(Date.now() / 1000);
  let from = now - 3600; // default: 1 hour ago
  let to = now;
  let remaining = description;

  // Parse time range from description
  // Pattern: "最近X小时/分钟/天" or "X小时/分钟/天前" or "昨天"
  interface TimePattern {
    regex: RegExp;
    unitMap: Record<string, number>;
  }

  const timePatterns: TimePattern[] = [
    { regex: /最近(\d+)(小时|分钟|天|个小时)/, unitMap: { '小时': 3600, '个小时': 3600, '分钟': 60, '天': 86400 } },
    { regex: /(\d+)(小时|分钟|天|个小时)前/, unitMap: { '小时': 3600, '个小时': 3600, '分钟': 60, '天': 86400 } },
    { regex: /(\d+)(h|m|d)\s*(ago)?/, unitMap: { 'h': 3600, 'm': 60, 'd': 86400 } },
  ];

  for (const pattern of timePatterns) {
    const match = remaining.match(pattern.regex);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2] as string;
      const multiplier = pattern.unitMap[unit] || 3600;
      from = now - (value * multiplier);
      remaining = remaining.replace(match[0], '');
      break;
    }
  }

  // Special keywords
  if (/昨天/.test(description)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    from = Math.floor(d.getTime() / 1000);
    const d2 = new Date();
    d2.setHours(0, 0, 0, 0);
    to = Math.floor(d2.getTime() / 1000);
    remaining = remaining.replace(/昨天/g, '');
  }

  if (/今天/.test(description)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    from = Math.floor(d.getTime() / 1000);
    remaining = remaining.replace(/今天/g, '');
  }

  // Extract keywords by removing common words
  const stopWords = new Set([
    '的', '日志', '查询', '查', '一下', '看看', '最近', '一下', '记录',
    'from', 'to', 'query', 'log', 'logs', '查一下', '看一下',
    '和', '或', '还有', '以及', '跟', '与',
    'all', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of'
  ]);

  // Tokenize: split by non-word characters but keep Chinese characters
  const tokens = remaining
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter(t => t.length > 0 && !stopWords.has(t.toLowerCase()));

  // Try to expand each token, keep unique
  const expandedQueries = new Set<string>();
  for (const token of tokens) {
    const expanded = expandKeywords(token);
    if (expanded !== token) {
      expandedQueries.add(expanded);
    } else if (token.length >= 2) {
      expandedQueries.add(token);
    }
  }

  const query = expandedQueries.size > 0 ? Array.from(expandedQueries).join(' OR ') : '*';

  return { from, to, query };
}
