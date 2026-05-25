import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelContactEnrichment } from '../services/lead-radar/marketHotelContactEnrichmentService.js';

async function main() {
  const summary = await runMarketHotelContactEnrichment();

  process.stdout.write(
    `Market hotel contact enrichment complete:\nstart count: ${summary.startCount}\nprocessed: ${summary.processed}\nupdated rows: ${summary.updatedRows}\nerrors: ${summary.errors}\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_contact_enrichment_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
