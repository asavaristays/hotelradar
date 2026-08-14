import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import {
  generateDailyRevenueIntelligenceBriefs,
  generateRevenueIntelligenceBrief,
} from '../services/revenueIntelligenceDeliveryService.js';

function parseArgs(argv = []) {
  const options = {
    hotelId: '',
    stayDate: '',
    channel: 'manual',
    recipientEmail: '',
    subject: '',
    limit: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--hotel-id') options.hotelId = argv[index + 1] || '';
    if (arg === '--stay-date') options.stayDate = argv[index + 1] || '';
    if (arg === '--channel') options.channel = argv[index + 1] || 'manual';
    if (arg === '--recipient-email') options.recipientEmail = argv[index + 1] || '';
    if (arg === '--subject') options.subject = argv[index + 1] || '';
    if (arg === '--limit') options.limit = Number(argv[index + 1] || 25);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.hotelId
    ? await generateRevenueIntelligenceBrief({
        hotelId: options.hotelId,
        stayDate: options.stayDate,
        channel: options.channel,
        recipientEmail: options.recipientEmail,
        subject: options.subject,
        generatedBy: null,
        userRole: 'system',
      })
    : await generateDailyRevenueIntelligenceBriefs({
        stayDate: options.stayDate,
        channel: options.channel,
        recipientEmail: options.recipientEmail,
        subject: options.subject,
        generatedBy: null,
        userRole: 'system',
        limit: options.limit,
      });

  logger.info('revenue_intelligence_morning_briefs_completed', {
    hotelId: options.hotelId || null,
    stayDate: options.stayDate || null,
    channel: options.channel,
    result,
  });
  console.log(JSON.stringify({ status: 'ok', result }, null, 2));
}

main()
  .catch((error) => {
    logger.error('revenue_intelligence_morning_briefs_failed', {
      error: error.message,
      stack: error.stack,
    });
    console.error(JSON.stringify({ status: 'failed', error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
    process.exit(process.exitCode || 0);
  });
