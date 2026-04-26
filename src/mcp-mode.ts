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

  let query = String(args.query);
  const from = parseTime(String(args.from));
  const to = args.to === 'now' ? Math.floor(Date.now() / 1000) : parseTime(String(args.to));
  const limit = Math.min(Number(args.limit) || 100, 1000);
  const offset = Number(args.offset) || 0;
  const fields = Array.isArray(args.fields) ? args.fields as string[] : undefined;
  const format = ((args.format as string) || 'raw') as 'raw' | 'summary';

  // Auto-add aggregation for summary format
  if (format === 'summary' && !query.includes('| stats') && !query.includes('| select')) {
    query += ' | stats count() as count by level';
  }

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
  const parsed = parseSmartQuery(description);

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

  let query = parsed.query;
  // Auto-add aggregation for summary format
  if (format === 'summary' && !query.includes('| stats') && !query.includes('| select')) {
    query += ' | stats count() as count by level';
  }

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
        text: formatAsMarkdown(result, { fields, format }),
      },
    ],
  };
}

function parseSmartQuery(description: string): {
  query: string;
  from: number;
  to: number;
  limit?: number;
} {
  const trimmed = description.trim();

  // Extract time range from description
  // Matches: "最近15分钟", "15分钟内", "4小时", "1h ago", "昨天", "today" etc.
  const timeMatch = trimmed.match(/(?:最近)?\s*(\d+)\s*(分钟内|分钟|小时|个小时|天|天前|h|m|d)\s*(?:ago)?|(?:最近)?\s*(昨天|今天|yesterday|today)/i);
  let timeStr: string;
  let timeDescription: string;

  if (timeMatch) {
    // Get the matched time expression
    timeDescription = timeMatch[0].trim();
    // Remove "最近" prefix and clean up for time parser
    timeStr = timeDescription.replace(/^最近\s*/, '').trim();
  } else {
    // Default to 1 hour if no time specified
    timeStr = '1h';
    timeDescription = '';
  }

  // Parse time
  const from = parseTime(timeStr);
  const to = Math.floor(Date.now() / 1000);

  // Extract keywords (remove time expression and common words)
  let cleanedDesc = trimmed.replace(timeDescription, '').trim();
  
  // Remove common stop words
  const stopWords = ['查询', '的', '日志', '查', '一下', '内', '最近'];
  for (const word of stopWords) {
    cleanedDesc = cleanedDesc.split(word).join(' ');
  }
  cleanedDesc = cleanedDesc.trim();
  
  // Split by spaces and punctuation, filter empty
  const keywords = cleanedDesc
    .split(/[\s,，]+/)
    .filter(word => word.length > 0);

  // Expand each keyword using aliases
  const expandedKeywords = keywords.map(k => expandKeywords(k));
  
  // Build query: if we have expanded keywords, use them; otherwise use level="ERROR" for common error terms
  let query: string;
  if (expandedKeywords.length > 0) {
    // Check if any keyword is an error-related term
    const hasErrorTerm = keywords.some(k => 
      ['error', 'ERROR', '错误', '异常', 'exception', 'fatal'].includes(k.toLowerCase())
    );
    
    if (hasErrorTerm && !expandedKeywords.some(k => k.includes('level='))) {
      query = `level="ERROR" AND (${expandedKeywords.join(' OR ')})`;
    } else {
      query = expandedKeywords.join(' OR ');
    }
  } else {
    // Default to showing all logs if no meaningful keywords
    query = '*';
  }

  return {
    query,
    from,
    to,
  };
}


