import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelCorporateEventClusterSignalEngine } from '../services/lead-radar/marketHotelCorporateEventClusterSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelCorporateEventClusterSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 11 complete:\n${summary.signalsCreated} corporate event clusters detected.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_corporate_event_cluster_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
