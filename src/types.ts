export interface SlsCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
}

export interface QueryParams {
  project: string;
  logstore: string;
  query: string;
  from: number; // Unix timestamp in seconds
  to: number;   // Unix timestamp in seconds
  limit?: number;
}

export interface LogEntry {
  time: number;
  content: Record<string, unknown>;
}

export interface QueryResult {
  logs: LogEntry[];
  count: number;
  hasMore: boolean;
}

export interface DaemonConfig {
  project: string;
  logstore: string;
  pollInterval: number; // seconds
  errorQuery: string;
  outputMode: 'console' | 'file';
  logFilePath?: string;
}

export type RunMode = 'mcp' | 'daemon';
