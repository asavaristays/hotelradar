import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelIndex } from '../services/lead-radar/marketHotelIndexService.js';

async function main() {
  const city = String(process.argv[2] || 'Goa').trim() || 'Goa';
  const summary = await runMarketHotelIndex({ city });

  process.stdout.write(`Step 1 complete:\n${summary.finalStoredHotels}\nhotels indexed for ${city}.\n`);
}

main()
  .catch((error) => {
    logger.error('market_hotel_index_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
