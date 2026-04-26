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

  it('should filter fields when fields option is provided', () => {
    const resultWithSource: QueryResult = {
      logs: [
        { time: 1714118400, content: { level: 'ERROR', message: 'Connection failed', source: 'api' } },
        { time: 1714118460, content: { level: 'INFO', message: 'Server started', source: 'worker' } },
      ],
      count: 2,
      hasMore: false,
    };

    const output = formatAsMarkdown(resultWithSource, { fields: ['level', 'message'] });
    expect(output).toContain('| Time | level | message |');
    expect(output).not.toContain('source');
    expect(output).toContain('ERROR');
    expect(output).toContain('Connection failed');
  });

  it('should format summary result', () => {
    const summaryResult: QueryResult = {
      logs: [
        { time: 0, content: { level: 'ERROR', count: '42' } },
        { time: 0, content: { level: 'INFO', count: '128' } },
      ],
      count: 2,
      hasMore: false,
    };

    const output = formatAsMarkdown(summaryResult, { format: 'summary' });
    expect(output).toContain('ERROR');
    expect(output).toContain('42');
    expect(output).toContain('INFO');
    expect(output).toContain('128');
  });

  it('should show warning for large result sets', () => {
    const largeResult: QueryResult = {
      logs: Array.from({ length: 1000 }, (_, i) => ({
        time: 1714118400 + i,
        content: { level: 'INFO', message: 'Log entry ' + i },
      })),
      count: 1000,
      hasMore: true,
    };

    const output = formatAsMarkdown(largeResult);
    expect(output).toContain('⚠️');
    expect(output).toContain('Large result set');
    expect(output).toContain('1000');
  });
});
