import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing modules that use it
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { parseSmartQuery, chineseToNumber, extractTimeExpression, filterTimeWords } from '../src/smart-parser';
import { clearCache } from '../src/query-expander';
import * as fs from 'fs';

describe('chineseToNumber', () => {
  it('should convert chinese numbers', () => {
    expect(chineseToNumber('七')).toBe(7);
    expect(chineseToNumber('十五')).toBe(15);
    expect(chineseToNumber('二十三')).toBe(23);
    expect(chineseToNumber('三十')).toBe(30);
    expect(chineseToNumber('九十九')).toBe(99);
  });

  it('should return null for invalid numbers', () => {
    expect(chineseToNumber('百')).toBeNull();
    expect(chineseToNumber('')).toBeNull();
  });
});

describe('extractTimeExpression', () => {
  it('should extract "最近七天"', () => {
    const result = extractTimeExpression('查询最近七天的ERROR日志');
    expect(result?.timeStr).toBe('最近七天');
  });

  it('should extract "过去5小时"', () => {
    const result = extractTimeExpression('过去5小时的日志');
    expect(result?.timeStr).toBe('过去5小时');
  });

  it('should extract "15分钟内"', () => {
    const result = extractTimeExpression('15分钟内的异常');
    expect(result?.timeStr).toBe('15分钟内');
  });

  it('should return null for no time', () => {
    const result = extractTimeExpression('ERROR日志');
    expect(result).toBeNull();
  });
});

describe('filterTimeWords', () => {
  it('should filter time words', () => {
    const result = filterTimeWords(['查询', '七天', '的', 'ERROR', '日志']);
    expect(result).toContain('ERROR');
    expect(result).not.toContain('七天');
    expect(result).not.toContain('查询');
  });
});

describe('parseSmartQuery - local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
    // Default mock config to preserve existing test behavior
    const defaultConfig = {
      defaultProject: 'fu-project',
      defaultLogstore: 'pro',
      defaultRegion: 'cn-shenzhen',
      queryAliases: {
        sms: ['sms', '短信', 'message', '验证码'],
        error: ['error', 'ERROR', '错误', '异常', 'exception', 'fatal'],
        api: ['api', '接口', 'request', 'response', 'http']
      }
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(defaultConfig));
  });

  it('should parse "查询最近七天的ERROR日志"', async () => {
    const result = await parseSmartQuery('查询最近七天的ERROR日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
    expect(result.from).toBeLessThan(result.to);
  });

  it('should parse "过去十五分钟的异常"', async () => {
    const result = await parseSmartQuery('过去十五分钟的异常', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('error');
  });

  it('should fallback to * for empty query', async () => {
    const result = await parseSmartQuery('的', { useLLM: false });
    expect(result.query).toBe('*');
    expect(result.source).toBe('local');
  });

  it('should extract logstore from description', async () => {
    const mockConfig = {
      defaultProject: 'fu-project',
      defaultLogstore: 'pro',
      logstores: [
        {
          name: 'pro-match',
          project: 'fu-project',
          aliases: ['pro-match', '比赛', 'match']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = await parseSmartQuery('帮我查询最近10个小时的error日志, pro-match', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.project).toBe('fu-project');
    expect(result.logstore).toBe('pro-match');
    expect(result.query).toContain('ERROR');
  });

  it('should not set project/logstore when no logstore matched', async () => {
    const mockConfig = {
      defaultProject: 'fu-project',
      defaultLogstore: 'pro',
      logstores: []
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = await parseSmartQuery('查询最近1小时的error日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.project).toBeUndefined();
    expect(result.logstore).toBeUndefined();
    expect(result.query).toContain('ERROR');
  });
});
