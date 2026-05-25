import dotenv from 'dotenv';

const envFileCandidates = [
  process.env.RADAR_LIGHT_ENV_FILE,
  '/opt/radar_light/.env',
  '/opt/radar_light/shared/.env',
  '.env',
].filter(Boolean);

for (const envFile of envFileCandidates) {
  const result = dotenv.config({ path: envFile, override: true });
  if (result.parsed) break;
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const isDevelopment = !isProduction && !isTest;

const runtimeDefaults = isProduction
  ? {
      databaseUrl: '',
      authSecret: '',
      authPepper: '',
      logLevel: 'info',
      enableConsoleLogs: false,
      corsOrigins: [],
      trustProxy: true,
      schemaCheckStrict: true,
    }
  : {
      databaseUrl: 'postgresql:///radar_light',
      authSecret: 'radar-dev-secret',
      authPepper: 'radar-dev-pepper',
      logLevel: 'debug',
      enableConsoleLogs: true,
      corsOrigins: ['http://localhost:5173'],
      trustProxy: false,
      schemaCheckStrict: false,
    };

function readOptionalString(name, fallback = '') {
  const raw = process.env[name];
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  return fallback;
}

function readRequiredString(names) {
  for (const name of names) {
    const raw = process.env[name];
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  }
  return '';
}

const env = {
  nodeEnv,
  isProduction,
  isTest,
  isDevelopment,
  port: parseNumber(process.env.PORT, 3000),
  databaseUrl: readRequiredString(['DATABASE_URL', 'DB_URL']) || runtimeDefaults.databaseUrl,
  logLevel: readOptionalString('LOG_LEVEL', runtimeDefaults.logLevel),
  logDir: readOptionalString('LOG_DIR', 'logs'),
  enableConsoleLogs: parseBoolean(process.env.ENABLE_CONSOLE_LOGS, runtimeDefaults.enableConsoleLogs),

  authSecret: readRequiredString(['JWT_SECRET', 'AUTH_SECRET']) || runtimeDefaults.authSecret,
  authPepper: readRequiredString(['AUTH_PEPPER']) || runtimeDefaults.authPepper,
  tokenTtlMinutes: parseNumber(process.env.TOKEN_TTL_MINUTES, 720),

  requireApiKey: parseBoolean(process.env.REQUIRE_API_KEY, false),
  internalApiKey: readOptionalString('INTERNAL_API_KEY', ''),

  requestBodyLimit: readOptionalString('REQUEST_BODY_LIMIT', '1mb'),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS, runtimeDefaults.corsOrigins),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, runtimeDefaults.trustProxy),
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, 240),

  recalcQueuePollMs: parseNumber(process.env.RECALC_QUEUE_POLL_MS, 2000),
  recalcQueueMaxAttempts: parseNumber(process.env.RECALC_QUEUE_MAX_ATTEMPTS, 3),
  recalcQueueRetryBaseSeconds: parseNumber(process.env.RECALC_QUEUE_RETRY_BASE_SECONDS, 20),
  recalcQueueRetryMaxSeconds: parseNumber(process.env.RECALC_QUEUE_RETRY_MAX_SECONDS, 300),
  allowMockCompetitorFallback: parseBoolean(
    process.env.ALLOW_MOCK_COMPETITOR_FALLBACK,
    !isProduction,
  ),
  allowEstimatedOtaParity: parseBoolean(
    process.env.ALLOW_ESTIMATED_OTA_PARITY,
    !isProduction,
  ),
  otaSnapshotFile: readOptionalString('OTA_SNAPSHOT_FILE', ''),
  eventSnapshotFile: readOptionalString('EVENT_SNAPSHOT_FILE', ''),
  eventSourceUrls: readOptionalString('EVENT_SOURCE_URLS', ''),
  eventLinkedinHintsFile: readOptionalString('EVENT_LINKEDIN_HINTS_FILE', ''),
  eventCollectTimeoutMs: parseNumber(process.env.EVENT_COLLECT_TIMEOUT_MS, 15000),
  enableWeddingSignalGenerator: parseBoolean(
    process.env.ENABLE_WEDDING_SIGNAL_GENERATOR,
    true,
  ),
  enableOnDemandOtaRefresh: parseBoolean(
    process.env.ENABLE_ON_DEMAND_OTA_REFRESH,
    false,
  ),
  otaCollectorCommand: readOptionalString('OTA_COLLECT_COMMAND', ''),
  onDemandOtaRefreshTimeoutMs: parseNumber(
    process.env.ON_DEMAND_OTA_REFRESH_TIMEOUT_MS,
    45000,
  ),
  onDemandOtaRefreshCooldownSec: parseNumber(
    process.env.ON_DEMAND_OTA_REFRESH_COOLDOWN_SEC,
    180,
  ),
  googleMapsApiKey: readOptionalString('GOOGLE_MAPS_API_KEY', ''),
  googleSearchApiKey: readOptionalString('GOOGLE_SEARCH_API_KEY', ''),
  googleSearchEngineId: readOptionalString('GOOGLE_SEARCH_ENGINE_ID', ''),
  googleSearchResultCount: parseNumber(process.env.GOOGLE_SEARCH_RESULT_COUNT, 5),
  googleSearchLanguage: readOptionalString('GOOGLE_SEARCH_LANGUAGE', 'lang_en'),
  enableGoogleTrendsLive: parseBoolean(process.env.ENABLE_GOOGLE_TRENDS_LIVE, true),
  googleTrendsTimeframe: readOptionalString('GOOGLE_TRENDS_TIMEFRAME', 'now 7-d'),
  googleTrendsSnapshotFile: readOptionalString('GOOGLE_TRENDS_SNAPSHOT_FILE', ''),
  marketHotelBatchSize: parseNumber(process.env.MARKET_HOTEL_BATCH_SIZE, 50),
  marketHotelCollectTimeoutMs: parseNumber(process.env.MARKET_HOTEL_COLLECT_TIMEOUT_MS, 15000),
  marketHotelCollectMinDelayMs: parseNumber(process.env.MARKET_HOTEL_COLLECT_MIN_DELAY_MS, 1200),
  marketHotelGridRadiusMeters: parseNumber(process.env.MARKET_HOTEL_GRID_RADIUS_METERS, 2500),
  marketHotelGridStepMeters: parseNumber(process.env.MARKET_HOTEL_GRID_STEP_METERS, 2200),
  marketHotelNearbyResultCount: parseNumber(process.env.MARKET_HOTEL_NEARBY_RESULT_COUNT, 20),
  marketHotelNeighborInsertBatchSize: parseNumber(
    process.env.MARKET_HOTEL_NEIGHBOR_INSERT_BATCH_SIZE,
    500,
  ),
  marketHotelNeighborProcessingBatchSize: parseNumber(
    process.env.MARKET_HOTEL_NEIGHBOR_PROCESSING_BATCH_SIZE,
    100,
  ),
  marketHotelNeighborMaxDistanceKm: parseNumber(
    process.env.MARKET_HOTEL_NEIGHBOR_MAX_DISTANCE_KM,
    5,
  ),
  marketHotelNeighborMaxCount: parseNumber(
    process.env.MARKET_HOTEL_NEIGHBOR_MAX_COUNT,
    20,
  ),
  marketHotelSignalBatchSize: parseNumber(
    process.env.MARKET_HOTEL_SIGNAL_BATCH_SIZE,
    500,
  ),
  marketHotelHighReviewRatioThreshold: parseNumber(
    process.env.MARKET_HOTEL_HIGH_REVIEW_RATIO_THRESHOLD,
    2,
  ),
  marketHotelReputationWeakRatingThreshold: parseNumber(
    process.env.MARKET_HOTEL_REPUTATION_WEAK_RATING_THRESHOLD,
    4,
  ),
  focusCities: parseCsv(process.env.FOCUS_CITIES, ['Goa', 'Mumbai', 'Jaipur']),

  migrationBaselineExisting: parseBoolean(process.env.MIGRATION_BASELINE_EXISTING, true),
  schemaCheckStrict: parseBoolean(process.env.SCHEMA_CHECK_STRICT, runtimeDefaults.schemaCheckStrict),
};

const validationErrors = [];
if (!env.databaseUrl) validationErrors.push('DATABASE_URL (or DB_URL) is required.');
if (!env.authSecret) validationErrors.push('JWT_SECRET (or AUTH_SECRET) is required.');
if (!env.authPepper) validationErrors.push('AUTH_PEPPER is required.');
if (env.requireApiKey && !env.internalApiKey) {
  validationErrors.push('INTERNAL_API_KEY is required when REQUIRE_API_KEY=true.');
}
if (env.port <= 0 || env.port > 65535) validationErrors.push('PORT must be between 1 and 65535.');
if (env.tokenTtlMinutes < 5) validationErrors.push('TOKEN_TTL_MINUTES must be >= 5.');
if (env.rateLimitWindowMs < 1000) validationErrors.push('RATE_LIMIT_WINDOW_MS must be >= 1000.');
if (env.rateLimitMax < 1) validationErrors.push('RATE_LIMIT_MAX must be >= 1.');
if (env.isProduction && env.corsOrigins.length === 0) {
  validationErrors.push('CORS_ORIGINS must be set in production (comma-separated list).');
}

if (validationErrors.length) {
  throw new Error(`Invalid environment configuration:\n- ${validationErrors.join('\n- ')}`);
}

export { env };
