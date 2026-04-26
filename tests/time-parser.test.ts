import { describe, it, expect } from 'vitest';
import { parseTime, chineseToNumber } from '../src/time-parser';

describe('time-parser', () => {
  const now = Math.floor(Date.now() / 1000);

  it('should parse unix timestamp', () => {
    const result = parseTime('1714118400');
    expect(result).toBe(1714118400);
  });

  it('should parse "1h ago"', () => {
    const result = parseTime('1h ago');
    expect(result).toBeGreaterThan(now - 3601);
    expect(result).toBeLessThanOrEqual(now - 3600);
  });

  it('should parse "30m ago"', () => {
    const result = parseTime('30m ago');
    expect(result).toBeGreaterThan(now - 1801);
    expect(result).toBeLessThanOrEqual(now - 1800);
  });

  it('should parse "1d ago"', () => {
    const result = parseTime('1d ago');
    expect(result).toBeGreaterThan(now - 86401);
    expect(result).toBeLessThanOrEqual(now - 86400);
  });

  it('should parse "5m ago"', () => {
    const result = parseTime('5m ago');
    expect(result).toBeGreaterThan(now - 301);
    expect(result).toBeLessThanOrEqual(now - 300);
  });

  it('should parse "4小时"', () => {
    const result = parseTime('4小时');
    expect(result).toBeGreaterThan(now - 4 * 3600 - 1);
    expect(result).toBeLessThanOrEqual(now - 4 * 3600);
  });

  it('should parse "30分钟"', () => {
    const result = parseTime('30分钟');
    expect(result).toBeGreaterThan(now - 1801);
    expect(result).toBeLessThanOrEqual(now - 1800);
  });

  it('should parse "1天"', () => {
    const result = parseTime('1天');
    expect(result).toBeGreaterThan(now - 86401);
    expect(result).toBeLessThanOrEqual(now - 86400);
  });

  it('should parse "昨天"', () => {
    const result = parseTime('昨天');
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    expect(result).toBe(Math.floor(d.getTime() / 1000));
  });

  it('should parse "今天"', () => {
    const result = parseTime('今天');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    expect(result).toBe(Math.floor(d.getTime() / 1000));
  });

  it('should throw error for invalid format', () => {
    expect(() => parseTime('invalid')).toThrow('Invalid time format');
  });
});

describe('chineseToNumber', () => {
  it('should convert single chinese digits', () => {
    expect(chineseToNumber('一')).toBe(1);
    expect(chineseToNumber('五')).toBe(5);
    expect(chineseToNumber('九')).toBe(9);
  });

  it('should convert compound chinese numbers', () => {
    expect(chineseToNumber('十')).toBe(10);
    expect(chineseToNumber('十五')).toBe(15);
    expect(chineseToNumber('二十')).toBe(20);
    expect(chineseToNumber('二十三')).toBe(23);
    expect(chineseToNumber('三十')).toBe(30);
    expect(chineseToNumber('九十九')).toBe(99);
  });

  it('should return null for invalid input', () => {
    expect(chineseToNumber('百')).toBeNull();
    expect(chineseToNumber('')).toBeNull();
    expect(chineseToNumber('abc')).toBeNull();
  });
});

describe('parseRelativeTime with chinese', () => {
  const now = Math.floor(Date.now() / 1000);

  it('should parse "七天"', () => {
    const result = parseTime('七天');
    expect(result).toBeGreaterThan(now - 7 * 86400 - 1);
    expect(result).toBeLessThanOrEqual(now - 7 * 86400);
  });

  it('should parse "十五分钟"', () => {
    const result = parseTime('十五分钟');
    expect(result).toBeGreaterThan(now - 15 * 60 - 1);
    expect(result).toBeLessThanOrEqual(now - 15 * 60);
  });

  it('should parse "三小时"', () => {
    const result = parseTime('三小时');
    expect(result).toBeGreaterThan(now - 3 * 3600 - 1);
    expect(result).toBeLessThanOrEqual(now - 3 * 3600);
  });
});