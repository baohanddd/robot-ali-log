import { describe, it, expect } from 'vitest';
import { parseTime } from '../src/time-parser';

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

  it('should throw error for invalid format', () => {
    expect(() => parseTime('invalid')).toThrow('Invalid time format');
  });
});
