import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelNeighborDetection } from '../services/lead-radar/marketHotelNeighborService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelNeighborDetection(city ? { city } : {});

  process.stdout.write(
    `Step 2 complete:\n${summary.totalNeighborsCreated} nearby relationships created.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_neighbor_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
