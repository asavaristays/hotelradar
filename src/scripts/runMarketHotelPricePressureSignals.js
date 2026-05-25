import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelPricePressureSignalEngine } from '../services/lead-radar/marketHotelPricePressureSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelPricePressureSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 8 complete:\n${summary.signalsCreated} price pressure signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_price_pressure_signal_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
