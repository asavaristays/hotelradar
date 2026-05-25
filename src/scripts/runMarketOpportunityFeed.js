import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketOpportunityFeedEngine } from '../services/lead-radar/marketOpportunityFeedService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketOpportunityFeedEngine(city ? { city } : {});

  process.stdout.write(
    `Step 16 complete:\n${summary.signalsInserted} opportunity feed entries generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_opportunity_feed_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
