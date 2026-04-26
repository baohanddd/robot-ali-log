import { LogEntry, QueryResult } from './types.js';

export function formatAsMarkdown(
  result: QueryResult,
  options?: { fields?: string[]; format?: 'raw' | 'summary' }
): string {
  if (result.count === 0) {
    return 'No logs found.';
  }

  const logs = result.logs;

  // Collect all unique keys from log contents
  const allKeys = new Set<string>();
  logs.forEach(log => {
    Object.keys(log.content).forEach(key => allKeys.add(key));
  });

  // Filter keys if fields option is provided
  const keys = options?.fields
    ? options.fields.filter(f => f !== 'time' && f !== 'Time')
    : Array.from(allKeys);

  const headers = ['Time', ...keys];

  // Build header
  let md = '| ' + headers.join(' | ') + ' |\n';
  md += '|' + headers.map(() => ' --- ').join('|') + '|\n';

  // Build rows
  logs.forEach(log => {
    const time = new Date(log.time * 1000).toISOString();
    const values = keys.map(key => {
      const val = log.content[key];
      return val !== undefined ? String(val) : '';
    });
    md += '| ' + [time, ...values].join(' | ') + ' |\n';
  });

  // Add warnings for large result sets
  if (result.count >= 1000) {
    md += '\n⚠️ **Warning:** Large result set (' + result.count + ' rows). ';
    md += 'Consider narrowing time range or using `format: "summary"` for aggregation.\n';
  } else if (result.hasMore) {
    md += '\n*More results available. Use a smaller time range or increase limit.*';
  }

  return md;
}

export function formatAsText(logs: LogEntry[]): string {
  if (logs.length === 0) return '';

  return logs.map(log => {
    const time = new Date(log.time * 1000).toISOString();
    const level = log.content.level || 'UNKNOWN';
    const message = log.content.message || JSON.stringify(log.content);
    return `[${time}] ${level}: ${message}`;
  }).join('\n');
}
