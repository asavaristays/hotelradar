import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { upsertVerifiedLiveDataSource } from '../repositories/verifiedLiveDataSourceRepository.js';

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function requireArg(args, key) {
  const value = String(args[key] || '').trim();
  if (!value) throw new Error(`Missing required argument --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

try {
  const args = parseArgs();
  const source = await upsertVerifiedLiveDataSource({
    hotelId: args.hotelId || null,
    city: args.city || null,
    sourceType: requireArg(args, 'sourceType'),
    sourceName: requireArg(args, 'sourceName'),
    adapterType: args.adapterType || 'json_manifest',
    sourceUrl: requireArg(args, 'sourceUrl'),
    enabled: !parseBoolean(args.disabled, false),
    cadenceMinutes: Number(args.cadenceMinutes || 60),
    proofRequired: parseBoolean(args.proofRequired, false),
    freshnessMinutes: Number(args.freshnessMinutes || 120),
    metadata: {
      registeredBy: 'registerVerifiedLiveDataSource',
      purpose: args.purpose || '',
    },
  });
  logger.info('verified_live_data_source_registered', {
    id: source.id,
    sourceType: source.source_type,
    sourceName: source.source_name,
    adapterType: source.adapter_type,
    enabled: source.enabled,
  });
  console.log(JSON.stringify(source, null, 2));
} catch (error) {
  logger.error('verified_live_data_source_register_failed', {
    error: error?.message || String(error),
  });
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
