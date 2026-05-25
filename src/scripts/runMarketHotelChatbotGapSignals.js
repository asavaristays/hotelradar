import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runMarketHotelChatbotGapSignalEngine } from '../services/lead-radar/marketHotelChatbotGapSignalService.js';

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runMarketHotelChatbotGapSignalEngine(city ? { city } : {});

  process.stdout.write(
    `Step 5 complete:\n${summary.signalsCreated} chatbot gap signals generated.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('market_hotel_chatbot_gap_signal_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
