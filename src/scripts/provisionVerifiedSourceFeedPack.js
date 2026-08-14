import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import { provisionVerifiedSourceFeedPack } from '../services/verifiedSourceFeedPackService.js';

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

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

try {
  const args = parseArgs();
  const result = await provisionVerifiedSourceFeedPack({
    hotelId: args.hotelId || '',
    hotelName: args.hotelName || 'The Ten Resort Siolim Goa',
    city: args.city || 'Goa',
    slug: args.slug || 'the-ten',
    baseDir: args.baseDir || '',
    overwrite: parseBoolean(args.overwrite, false),
  });

  const payload = {
    hotel: result.hotel,
    baseDir: result.baseDir,
    files: result.files,
    sources: result.sources.map((source) => ({
      id: source.id,
      source_type: source.source_type,
      source_name: source.source_name,
      adapter_type: source.adapter_type,
      source_url: source.source_url,
      enabled: source.enabled,
      last_status: source.last_status,
    })),
  };

  logger.info('verified_source_feed_pack_provisioned', {
    hotelId: result.hotel.id,
    hotelName: result.hotel.hotel_name,
    sourceCount: result.sources.length,
    baseDir: result.baseDir,
  });
  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  logger.error('verified_source_feed_pack_failed', {
    error: error?.message || String(error),
    stack: error?.stack,
  });
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
