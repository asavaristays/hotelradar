import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelBenchmarkEngine } from '../services/lead-radar/marketHotelBenchmarkService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelBenchmarkEngine(city ? { city } : {});

  process.stdout.write(
    `Step 18 complete:\n${summary.hotelsProcessed} hotel benchmarks generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_benchmarks_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
