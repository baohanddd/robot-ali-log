import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCredentials, getRegion } from '../src/auth';

vi.mock('../src/query-expander', () => ({
  getDefaultRegion: vi.fn().mockReturnValue(undefined),
  getDefaultProject: vi.fn().mockReturnValue(undefined),
  getDefaultLogstore: vi.fn().mockReturnValue(undefined),
  expandKeywords: vi.fn().mockImplementation((keyword) => keyword),
  clearCache: vi.fn(),
}));

describe('auth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return credentials from environment variables', () => {
    process.env.ALICLOUD_ACCESS_KEY_ID = 'test-key-id';
    process.env.ALICLOUD_ACCESS_KEY_SECRET = 'test-key-secret';

    const creds = getCredentials();
    expect(creds.accessKeyId).toBe('test-key-id');
    expect(creds.accessKeySecret).toBe('test-key-secret');
  });

  it('should throw error when access key id is missing', () => {
    delete process.env.ALICLOUD_ACCESS_KEY_ID;
    process.env.ALICLOUD_ACCESS_KEY_SECRET = 'test-key-secret';

    expect(() => getCredentials()).toThrow('ALICLOUD_ACCESS_KEY_ID environment variable is required');
  });

  it('should throw error when access key secret is missing', () => {
    process.env.ALICLOUD_ACCESS_KEY_ID = 'test-key-id';
    delete process.env.ALICLOUD_ACCESS_KEY_SECRET;

    expect(() => getCredentials()).toThrow('ALICLOUD_ACCESS_KEY_SECRET environment variable is required');
  });

  it('should return default region when not set', () => {
    delete process.env.ALICLOUD_REGION;
    expect(getRegion()).toBe('cn-hangzhou');
  });

  it('should return custom region when set', () => {
    process.env.ALICLOUD_REGION = 'cn-beijing';
    expect(getRegion()).toBe('cn-beijing');
  });
});
