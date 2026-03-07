import { logger } from '../config/logger.js';
import { runEventIngestionCycle } from '../services/ingestion/eventIngestionService.js';

async function main() {
  const summary = await runEventIngestionCycle({
    snapshotPath: process.env.EVENT_SNAPSHOT_FILE || '',
  });

  logger.info('event_ingestion_script_completed', summary);
}

main().catch((error) => {
  logger.error('event_ingestion_script_failed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
