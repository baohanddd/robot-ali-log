import { describe, it, expect } from 'vitest';
import { parseSmartQuery } from '../src/smart-parser';

describe('smart query integration', () => {
  it('should parse "查询最近七天的ERROR日志" with local parser', async () => {
    const result = await parseSmartQuery('查询最近七天的ERROR日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
    expect(result.from).toBeLessThan(result.to);
    // Should be approximately 7 days ago
    const now = Math.floor(Date.now() / 1000);
    expect(result.from).toBeGreaterThan(now - 7 * 86400 - 10);
  });

  it('should parse "过去十五分钟的异常" with local parser', async () => {
    const result = await parseSmartQuery('过去十五分钟的异常', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('error');
  });

  it('should fallback to * for unparseable input', async () => {
    const result = await parseSmartQuery('的', { useLLM: false });
    expect(result.query).toBe('*');
    expect(result.source).toBe('local');
  });

  it('should parse "15分钟内的ERROR"', async () => {
    const result = await parseSmartQuery('15分钟内的ERROR', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
  });

  it('should handle query without time (defaults to 1h)', async () => {
    const result = await parseSmartQuery('ERROR日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
    // Should default to 1 hour ago
    const now = Math.floor(Date.now() / 1000);
    expect(result.from).toBeGreaterThan(now - 3600 - 10);
  });
});
