import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startMcpServer } from '../src/mcp-mode';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../src/auth', () => ({
  getCredentials: vi.fn().mockReturnValue({
    accessKeyId: 'test-key-id',
    accessKeySecret: 'test-key-secret',
    region: 'cn-hangzhou',
  }),
}));

const mockQueryLogs = vi.fn().mockResolvedValue({
  logs: [{ time: 1714118400, content: { message: 'test' } }],
  count: 1,
  hasMore: false,
});

vi.mock('../src/sls-client', () => ({
  SlsClient: vi.fn().mockImplementation(() => ({
    queryLogs: mockQueryLogs,
  })),
}));

vi.mock('../src/query-expander', () => ({
  getDefaultProject: vi.fn().mockReturnValue('test-project'),
  getDefaultLogstore: vi.fn().mockReturnValue('test-logstore'),
}));

describe('mcp-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create MCP server with correct config', async () => {
    const server = await startMcpServer();
    expect(server).toBeDefined();
  });

});
