import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelWeddingDemandZoneSignalEngine } from '../services/lead-radar/marketHotelWeddingDemandZoneSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelWeddingDemandZoneSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 10 complete:\n${summary.signalsCreated} wedding demand zones detected.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_wedding_demand_zone_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
