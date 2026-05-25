import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelAirportDemandSignalEngine } from '../services/lead-radar/marketHotelAirportDemandSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelAirportDemandSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 13 complete:\n${summary.signalsCreated} airport demand signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_airport_demand_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
