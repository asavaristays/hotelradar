import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelReviewSignalEngine } from '../services/lead-radar/marketHotelReviewSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelReviewSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 3 complete:\n${summary.signalsCreated} review activity signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_review_signal_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
