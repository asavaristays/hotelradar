import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { captureManualMarketSignals } from '../services/manualSignalInputService.js';

function parseArgs(argv = []) {
  const options = {
    hotelId: '',
    sourceType: '',
    checkinDate: '',
    sourceName: '',
    valueNumeric: '',
    valueText: '',
    proofUrl: '',
    confidenceScore: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--hotel-id') options.hotelId = argv[index + 1] || '';
    if (arg === '--source-type') options.sourceType = argv[index + 1] || '';
    if (arg === '--checkin-date') options.checkinDate = argv[index + 1] || '';
    if (arg === '--source-name') options.sourceName = argv[index + 1] || '';
    if (arg === '--value-numeric') options.valueNumeric = argv[index + 1] || '';
    if (arg === '--value-text') options.valueText = argv[index + 1] || '';
    if (arg === '--proof-url') options.proofUrl = argv[index + 1] || '';
    if (arg === '--confidence-score') options.confidenceScore = argv[index + 1] || '';
  }

  return options;
}

function required(value, label) {
  if (String(value || '').trim()) return String(value).trim();
  throw new Error(`${label} is required.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hotelId = required(args.hotelId || process.env.MANUAL_SIGNAL_HOTEL_ID, '--hotel-id');

  const payload = {
    source_type: required(args.sourceType, '--source-type'),
    checkin_date: required(args.checkinDate, '--checkin-date'),
    source_name: required(args.sourceName, '--source-name'),
    value_numeric: args.valueNumeric === '' ? null : Number(args.valueNumeric),
    value_text: args.valueText,
    proof_url: args.proofUrl,
    confidence_score: args.confidenceScore === '' ? 72 : Number(args.confidenceScore),
  };

  const result = await captureManualMarketSignals(hotelId, payload, {
    userId: 'manual-signal-cli',
    userRole: 'super_admin',
  });

  logger.info('manual_signal_cli_completed', result);
  console.log(JSON.stringify({ status: 'ok', result }, null, 2));
}

main()
  .catch((error) => {
    logger.error('manual_signal_cli_failed', {
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
