import { logger } from '../config/logger.js';
import { runEventCollectionCycle } from '../services/ingestion/eventCollectionService.js';

async function main() {
  const summary = await runEventCollectionCycle({
    outputPath: process.env.EVENT_SNAPSHOT_FILE || '',
    linkedinHintsFile: process.env.EVENT_LINKEDIN_HINTS_FILE || '',
  });

  logger.info('event_collection_script_completed', summary);
}

main().catch((error) => {
  logger.error('event_collection_script_failed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
