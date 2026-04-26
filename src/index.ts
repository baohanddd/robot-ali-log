import { startMcpServer } from './mcp-mode.js';
import { startDaemon } from './daemon-mode.js';

async function main() {
  const mode = process.env.RUN_MODE || 'mcp';

  if (mode === 'daemon') {
    console.log('Starting Ali Log Daemon...');
    const daemon = await startDaemon();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down daemon...');
      daemon.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      daemon.stop();
      process.exit(0);
    });
  } else {
    console.log('Starting Ali Log MCP Server...');
    await startMcpServer();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
