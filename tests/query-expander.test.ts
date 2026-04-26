import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing query-expander
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { expandKeywords, loadConfig, getDefaultProject, getDefaultLogstore, clearCache } from '../src/query-expander';
import * as fs from 'fs';

describe('query-expander', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should expand "sms" to all aliases', () => {
    const mockConfig = {
      defaultProject: 'test-project',
      defaultLogstore: 'test-logstore',
      queryAliases: {
        sms: ['sms', '短信', 'message', '验证码'],
        error: ['error', 'ERROR', '错误']
      }
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = expandKeywords('sms');
    expect(result).toContain('sms');
    expect(result).toContain('短信');
    expect(result).toContain('验证码');
  });

  it('should expand "短信" to all aliases', () => {
    const mockConfig = {
      queryAliases: {
        sms: ['sms', '短信', 'message', '验证码'],
      }
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = expandKeywords('短信');
    expect(result).toContain('sms');
    expect(result).toContain('短信');
  });

  it('should return original if no alias found', () => {
    const mockConfig = { queryAliases: {} };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const result = expandKeywords('unknown_keyword');
    expect(result).toBe('unknown_keyword');
  });

  it('should load config from file', () => {
    const mockConfig = {
      defaultProject: 'test-project',
      defaultLogstore: 'test-logstore',
      queryAliases: { test: ['a', 'b'] }
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    
    const config = loadConfig();
    expect(config.defaultProject).toBe('test-project');
    expect(config.defaultLogstore).toBe('test-logstore');
  });

  it('should return empty object if config file not found', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    
    const config = loadConfig();
    expect(config).toEqual({});
  });
});
