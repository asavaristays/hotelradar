import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelWeekendCompressionSignalEngine } from '../services/lead-radar/marketHotelWeekendCompressionSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelWeekendCompressionSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 14 complete:\n${summary.signalsCreated} weekend compression signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_weekend_compression_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
