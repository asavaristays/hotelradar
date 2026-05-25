import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelEventDemandZoneSignalEngine } from '../services/lead-radar/marketHotelEventDemandZoneSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelEventDemandZoneSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 9 complete:\n${summary.signalsCreated} event demand signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_event_demand_zone_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
