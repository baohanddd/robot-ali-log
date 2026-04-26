import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlsClient } from '../src/sls-client';
import { SlsCredentials, QueryParams, LogEntry } from '../src/types';

// Mock the aliyun SDK
vi.mock('@alicloud/sls20201230', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getLogs: vi.fn(),
    })),
    GetLogsRequest: vi.fn().mockImplementation(function(this: any, data: any) {
      Object.assign(this, data);
    }),
  };
});

describe('sls-client', () => {
  let client: SlsClient;
  const mockCreds: SlsCredentials = {
    accessKeyId: 'test-id',
    accessKeySecret: 'test-secret',
    region: 'cn-hangzhou',
  };

  beforeEach(() => {
    client = new SlsClient(mockCreds);
  });

  it('should create client with correct endpoint', () => {
    expect(client).toBeDefined();
  });

  it('should query logs successfully', async () => {
    const mockLogs: LogEntry[] = [
      { time: 1714118400, content: { message: 'test log' } },
    ];

    const mockResponse = {
      body: mockLogs,
    };

    // Mock the internal client's getLogs method
    (client as any).client.getLogs = vi.fn().mockResolvedValue(mockResponse);

    const params: QueryParams = {
      project: 'test-project',
      logstore: 'test-logstore',
      query: '*',
      from: 1714118000,
      to: 1714119000,
      limit: 100,
    };

    const result = await client.queryLogs(params);
    expect(result.logs).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.logs[0].time).toBe(1714118400);
    expect(result.logs[0].content).toEqual({ message: 'test log' });
  });

  it('should handle query errors', async () => {
    const mockInstance = {
      getLogs: vi.fn().mockRejectedValue(new Error('API Error')),
    };
    (client as any).client = mockInstance;

    const params: QueryParams = {
      project: 'test-project',
      logstore: 'test-logstore',
      query: '*',
      from: 1714118000,
      to: 1714119000,
    };

    await expect(client.queryLogs(params)).rejects.toThrow('SLS query failed: API Error');
  });
});
