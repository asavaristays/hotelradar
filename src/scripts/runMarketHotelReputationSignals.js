import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelReputationSignalEngine } from '../services/lead-radar/marketHotelReputationSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelReputationSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 4 complete:\n${summary.signalsCreated} reputation weakness signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_reputation_signal_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
