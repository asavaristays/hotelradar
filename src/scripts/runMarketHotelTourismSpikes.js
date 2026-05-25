import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelTourismSpikeSignalEngine } from '../services/lead-radar/marketHotelTourismSpikeSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelTourismSpikeSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 12 complete:\n${summary.signalsCreated} tourism spike signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_tourism_spike_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
