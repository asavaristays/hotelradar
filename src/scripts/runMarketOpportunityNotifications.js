import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketOpportunityNotificationEngine } from '../services/lead-radar/marketOpportunityNotificationService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketOpportunityNotificationEngine(city ? { city } : {});

  process.stdout.write(
    `Step 20 complete:\n${summary.notificationsCreated} notifications generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_opportunity_notifications_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
