import { describe, it, expect } from 'vitest';
import { formatAsMarkdown, formatAsText } from '../src/formatter';
import { LogEntry, QueryResult } from '../src/types';

describe('formatter', () => {
  const mockLogs: LogEntry[] = [
    { time: 1714118400, content: { level: 'ERROR', message: 'Connection failed' } },
    { time: 1714118460, content: { level: 'INFO', message: 'Server started' } },
  ];

  const mockResult: QueryResult = {
    logs: mockLogs,
    count: 2,
    hasMore: false,
  };

  it('should format as markdown table', () => {
    const output = formatAsMarkdown(mockResult);
    expect(output).toContain('| Time | level | message |');
    expect(output).toContain('ERROR');
    expect(output).toContain('Server started');
  });

  it('should format empty result as markdown', () => {
    const emptyResult: QueryResult = { logs: [], count: 0, hasMore: false };
    const output = formatAsMarkdown(emptyResult);
    expect(output).toContain('No logs found');
  });

  it('should format as text for daemon mode', () => {
    const output = formatAsText(mockLogs);
    expect(output).toContain('[2024-04-26');
    expect(output).toContain('ERROR: Connection failed');
    expect(output).toContain('INFO: Server started');
  });

  it('should format empty logs as text', () => {
    const output = formatAsText([]);
    expect(output).toBe('');
  });
});
