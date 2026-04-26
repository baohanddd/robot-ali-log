import { createRequire } from 'module';
import type { SlsCredentials, QueryParams, QueryResult, LogEntry } from './types.js';

const require = createRequire(import.meta.url);

export class SlsClient {
  private client: any;
  private sdk: any;

  constructor(credentials: SlsCredentials) {
    const mod = require('@alicloud/sls20201230');
    const Client = mod.default || mod;
    this.sdk = mod;
    this.client = new Client({
      endpoint: `${credentials.region}.log.aliyuncs.com`,
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
    });
  }

  async queryLogs(params: QueryParams): Promise<QueryResult> {
    const GetLogsRequest = this.sdk.GetLogsRequest;
    const request = new GetLogsRequest({
      query: params.query,
      from: params.from,
      to: params.to,
      line: params.limit || 100,
    });

    try {
      const response = await this.client.getLogs(
        params.project,
        params.logstore,
        request
      );
      const logs: LogEntry[] = (response.body || []).map((log: any) => ({
        time: log.time || 0,
        content: log.content || log.contents || {},
      }));

      return {
        logs,
        count: logs.length,
        hasMore: logs.length >= (params.limit || 100),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SLS query failed: ${message}`);
    }
  }
}
