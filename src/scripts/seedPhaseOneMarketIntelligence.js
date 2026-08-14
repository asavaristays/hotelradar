import { logger } from '../config/logger.js';
import { PHASE_ONE_MARKET_INTELLIGENCE_TAG } from '../services/phaseOneMarketIntelligenceScenario.js';
import { seedPhaseOneMarketIntelligence } from '../services/phaseOneMarketIntelligenceSeed.js';
import { pool } from '../db/pool.js';

function parseArgs(argv = []) {
  const options = {
    dryRun: false,
    recalculate: true,
    hotelId: '',
    hotelName: '',
    city: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--skip-recalculate') options.recalculate = false;
    if (arg === '--hotel-id') options.hotelId = argv[index + 1] || '';
    if (arg === '--hotel-name') options.hotelName = argv[index + 1] || '';
    if (arg === '--city') options.city = argv[index + 1] || '';
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await seedPhaseOneMarketIntelligence(options);

  logger.info('phase_one_market_intelligence_seed_completed', {
    tag: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
    dryRun: Boolean(options.dryRun),
    result,
  });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        tag: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
        result,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    logger.error('phase_one_market_intelligence_seed_failed', {
      error: error.message,
      stack: error.stack,
    });
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          tag: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
          error: error.message,
          code: error.code || null,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
    process.exit(process.exitCode || 0);
  });
