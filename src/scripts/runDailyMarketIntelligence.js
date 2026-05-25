import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { runDailyMarketIntelligence } from '../services/lead-radar/dailyMarketIntelligenceService.js';

function formatTime(date) {
  return date.toISOString().slice(11, 16);
}

async function main() {
  const city = String(process.argv[2] || '').trim();
  const summary = await runDailyMarketIntelligence(city ? { city } : {});

  const completedLines = summary.completedSteps.map((step) => `Step completed:\n${step}`).join('\n\n');
  const failedLines = summary.failedSteps.length
    ? `\n\nFailed stages:\n${summary.failedSteps.join('\n')}`
    : '';

  process.stdout.write(
    `Daily Intelligence Engine\nstart time: ${formatTime(new Date(summary.startTime))}\n\n${completedLines}${failedLines}\n\ntotal signals generated: ${summary.signalsGenerated}\ntotal opportunities generated: ${summary.feedEntries}\ntotal ranked opportunities: ${summary.rankedEntries}\ntotal notifications generated: ${summary.notificationsGenerated}\nruntime: ${Math.round(summary.durationMs / 1000)} seconds\n\nStep 19 complete:\ndaily intelligence engine ready.\n`,
  );
}

main()
  .catch((error) => {
    logger.error('daily_market_intelligence_script_failed', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
