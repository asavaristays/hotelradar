import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelDemandSurgeClusterSignalEngine } from '../services/lead-radar/marketHotelDemandSurgeClusterSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelDemandSurgeClusterSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 7 complete:\n${summary.signalsCreated} demand surge cluster signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_demand_surge_cluster_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
