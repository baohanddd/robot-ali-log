import { SlsClient } from './sls-client.js';
import { getCredentials } from './auth.js';
import { formatAsText } from './formatter.js';
import { DaemonConfig } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export interface DaemonHandle {
  stop: () => void;
}

export async function startDaemon(): Promise<DaemonHandle> {
  const config = getDaemonConfig();
  const credentials = getCredentials();
  const slsClient = new SlsClient(credentials);

  let lastQueryTime = Math.floor(Date.now() / 1000) - config.pollInterval;
  const seenHashes = new Set<string>();
  let intervalId: ReturnType<typeof setInterval>;

  async function poll() {
    const now = Math.floor(Date.now() / 1000);
    
    try {
      const result = await slsClient.queryLogs({
        project: config.project,
        logstore: config.logstore,
        query: config.errorQuery,
        from: lastQueryTime,
        to: now,
        limit: 1000,
      });

      const newLogs = result.logs.filter(log => {
        const hash = `${log.time}-${JSON.stringify(log.content)}`;
        if (seenHashes.has(hash)) return false;
        seenHashes.add(hash);
        return true;
      });

      // Keep seenHashes size bounded
      if (seenHashes.size > 1000) {
        const arr = Array.from(seenHashes);
        seenHashes.clear();
        arr.slice(-500).forEach(h => seenHashes.add(h));
      }

      if (newLogs.length > 0) {
        const output = formatAsText(newLogs);
        
        if (config.outputMode === 'file' && config.logFilePath) {
          const dir = path.dirname(config.logFilePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.appendFileSync(config.logFilePath, output + '\n');
        } else {
          console.log(output);
        }
      }

      lastQueryTime = now;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Daemon] Query failed: ${message}`);
    }
  }

  // Run immediately
  await poll();

  // Schedule periodic polling
  intervalId = setInterval(poll, config.pollInterval * 1000);

  return {
    stop: () => {
      clearInterval(intervalId);
    },
  };
}

function getDaemonConfig(): DaemonConfig {
  const project = process.env.SLS_PROJECT;
  const logstore = process.env.SLS_LOGSTORE;

  if (!project) {
    throw new Error('SLS_PROJECT environment variable is required in daemon mode');
  }

  if (!logstore) {
    throw new Error('SLS_LOGSTORE environment variable is required in daemon mode');
  }

  return {
    project,
    logstore,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '300', 10),
    errorQuery: process.env.ERROR_QUERY || 'level: ERROR',
    outputMode: (process.env.DAEMON_OUTPUT as 'console' | 'file') || 'console',
    logFilePath: process.env.LOG_FILE_PATH || './logs/error.log',
  };
}
