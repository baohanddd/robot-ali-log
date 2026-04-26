import { describe, it, expect } from 'vitest';
import { parseSmartQuery, chineseToNumber, extractTimeExpression, filterTimeWords } from '../src/smart-parser';

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
});
