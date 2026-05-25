import { logger } from '../config/logger.js';
import { runDailyOutcomeBootstrap } from '../services/intelligence-engine/calibrationFasttrackEngine.js';

async function main() {
  const summary = await runDailyOutcomeBootstrap({
    daysAhead: Number(process.env.OUTCOME_BOOTSTRAP_DAYS_AHEAD || 1),
    occupancyPct: Number(process.env.OUTCOME_BOOTSTRAP_OCCUPANCY_PCT || 72),
    pickupRooms: Number(process.env.OUTCOME_BOOTSTRAP_PICKUP_ROOMS || 6),
    fallbackAdr: Number(process.env.OUTCOME_BOOTSTRAP_FALLBACK_ADR || 5000),
    source: process.env.OUTCOME_BOOTSTRAP_SOURCE || 'system_bootstrap',
    uploadedBy: null,
  });

  logger.info('outcome_bootstrap_completed', summary);
}

main().catch((error) => {
  logger.error('outcome_bootstrap_failed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
