import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelFestivalDemandSignalEngine } from '../services/lead-radar/marketHotelFestivalDemandSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelFestivalDemandSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 15 complete:\n${summary.signalsCreated} festival demand signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_festival_demand_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
