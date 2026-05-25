import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelOtaDependenceSignalEngine } from '../services/lead-radar/marketHotelOtaDependenceSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelOtaDependenceSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 6 complete:\n${summary.signalsCreated} OTA dependence signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_ota_dependence_signal_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
