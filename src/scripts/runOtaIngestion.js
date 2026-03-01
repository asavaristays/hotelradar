import { logger } from '../config/logger.js';
import { runOtaIngestionCycle } from '../services/ingestion/otaIngestionService.js';

async function main() {
  const summary = await runOtaIngestionCycle({
    snapshotPath: process.env.OTA_SNAPSHOT_FILE || '',
  });

  logger.info('ota_ingestion_script_completed', summary);
}

main().catch((error) => {
  logger.error('ota_ingestion_script_failed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});

