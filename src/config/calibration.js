import { getCalibrationRows } from '../repositories/calibrationRepository.js';

export const DEFAULT_CALIBRATION = {
  global: {
    thresholds: {
      scoreChange: 12,
      competitorMovement: 8,
      marketDeviation: 15,
      surgeWindowDays: 3,
      otaParityGap: 5,
      otaParityParityBand: 2,
    },
    dataHealth: {
      staleScrapeHours: 12,
      minCompetitorRows: 2,
      minOtaLiveRowsForAction: 2,
      minEventRowsFocusCity: 1,
      minAirfarePoints: 7,
      minConfidenceScore: 65,
      minSampleForAccuracy: 7,
      minForecastAccuracy: 60,
      maxVolatilityError: 25,
      resolvedWindowDays: 7,
      forceProductUnlock: false,
    },
    confidence: {
      ceiling: 95,
      min: 45,
      defaultBias: 0,
    },
    volatility: {
      stableMax: 35,
      volatileMax: 70,
    },
    riskMultipliers: {
      overpricedPenalty: 1.2,
      softDemandIncreasePenalty: 1.1,
    },
    weights: {
      default: {
        competitor_weight: 0.4,
        holiday_weight: 0.3,
        airfare_weight: 0.15,
        season_weight: 0.15,
      },
    },
  },
  security: {
    rateLimit: {
      windowMs: 60000,
      maxRecalculatePerWindow: 3,
    },
  },
  compression: {
    thresholds: {
      lowMax: 45,
      moderateMax: 70,
      priceVacuumPct: 12,
      opportunityMinFactor: 0.95,
      opportunityMaxFactor: 1.05,
    },
  },
  calibration: {
    maxWeightDelta: 0.05,
    minOutcomeThreshold: 8,
    maxCanaryPercentage: 0.2,
    revertAccuracyDropThreshold: 0.05,
  },
};

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) return override;

  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (!(key in out)) {
      out[key] = value;
      continue;
    }
    out[key] = deepMerge(out[key], value);
  }
  return out;
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const isLeaf = i === parts.length - 1;
    if (isLeaf) {
      cursor[part] = value;
      return;
    }
    if (!isObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
}

let calibrationCache = { ...DEFAULT_CALIBRATION };
let loadedAtMs = 0;

export async function getCalibration({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - loadedAtMs < 30000) {
    return calibrationCache;
  }

  try {
    const rows = await getCalibrationRows();
    const merged = JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
    for (const row of rows) {
      setByPath(merged, row.key, row.value_json);
    }

    calibrationCache = deepMerge(DEFAULT_CALIBRATION, merged);
    loadedAtMs = now;
    return calibrationCache;
  } catch {
    calibrationCache = DEFAULT_CALIBRATION;
    loadedAtMs = now;
    return calibrationCache;
  }
}
