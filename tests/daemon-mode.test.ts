import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startDaemon } from '../src/daemon-mode';

vi.mock('../src/sls-client', () => ({
  SlsClient: vi.fn().mockImplementation(() => ({
    queryLogs: vi.fn().mockResolvedValue({
      logs: [
        { time: 1714118400, content: { level: 'ERROR', message: 'Test error' } },
      ],
      count: 1,
      hasMore: false,
    }),
  })),
}));

describe('daemon-mode', () => {
  const originalEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ALICLOUD_ACCESS_KEY_ID = 'test-key-id';
    process.env.ALICLOUD_ACCESS_KEY_SECRET = 'test-key-secret';
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('should validate required env vars', async () => {
    delete process.env.SLS_PROJECT;
    delete process.env.SLS_LOGSTORE;

    await expect(startDaemon()).rejects.toThrow('SLS_PROJECT environment variable is required');
  });

  it('should start daemon and query logs', async () => {
    process.env.SLS_PROJECT = 'test-project';
    process.env.SLS_LOGSTORE = 'test-logstore';
    process.env.POLL_INTERVAL = '1';
    process.env.DAEMON_OUTPUT = 'console';

    // Start daemon but stop after first poll
    const daemon = await startDaemon();
    
    // Wait a bit for first execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    daemon.stop();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
