import { getCalibration } from '../../config/calibration.js';
import { upsertCalibrationSetting } from '../../repositories/calibrationRepository.js';
import {
  createModelVersion,
  findHotelByNameInCity,
  getAlertFeedbackRate,
  getCityByName,
  getCityCalibrationDataset,
  getCityWeightsForUpdate,
  getLatestActiveOrCanaryModelVersionForCity,
  getPreviousModelVersionForCity,
  insertOutcomeBootstrapRows,
  insertCalibrationRun,
  linkModelVersionToRun,
  listActiveHotelsByCity,
  listOutcomeBootstrapTargets,
  listCalibrationRuns,
  listCanaryOverrides,
  listEnabledCanaryHotelsByCity,
  listOperationalCities,
  setCanaryOverride,
  updateModelVersionAccuracy,
  updateModelVersionStatus,
  upsertAlertFeedback,
  upsertHotelDailyOutcomes,
} from '../../repositories/calibrationFasttrackRepository.js';
import { clamp, round } from '../../utils/math.js';

const WEIGHT_KEYS = ['competitor_weight', 'holiday_weight', 'airfare_weight', 'season_weight'];

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function parseCsvRows(csvText) {
  const raw = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function directionFromAction(action) {
  const normalized = String(action || '').toLowerCase();
  if (normalized === 'increase') return 'up';
  if (normalized === 'reduce') return 'down';
  return 'stable';
}

function directionFromPct(deltaPct) {
  if (deltaPct > 1) return 'up';
  if (deltaPct < -1) return 'down';
  return 'stable';
}

function pickWeights(raw = {}) {
  return {
    competitor_weight: Number(raw.competitor_weight || 0),
    holiday_weight: Number(raw.holiday_weight || 0),
    airfare_weight: Number(raw.airfare_weight || 0),
    season_weight: Number(raw.season_weight || 0),
  };
}

function normalizeWeights(weights) {
  const safe = {
    competitor_weight: clamp(Number(weights.competitor_weight || 0), 0.05, 0.8),
    holiday_weight: clamp(Number(weights.holiday_weight || 0), 0.05, 0.8),
    airfare_weight: clamp(Number(weights.airfare_weight || 0), 0.05, 0.8),
    season_weight: clamp(Number(weights.season_weight || 0), 0.05, 0.8),
  };

  const total =
    safe.competitor_weight + safe.holiday_weight + safe.airfare_weight + safe.season_weight || 1;

  return {
    competitor_weight: round(safe.competitor_weight / total, 4),
    holiday_weight: round(safe.holiday_weight / total, 4),
    airfare_weight: round(safe.airfare_weight / total, 4),
    season_weight: round(safe.season_weight / total, 4),
  };
}

function proposeWeights(oldWeights, metrics) {
  const next = {
    competitor_weight: Number(oldWeights.competitor_weight || 0.4),
    holiday_weight: Number(oldWeights.holiday_weight || 0.3),
    airfare_weight: Number(oldWeights.airfare_weight || 0.15),
    season_weight: Number(oldWeights.season_weight || 0.15),
  };

  if (metrics.directionAccuracy < 65 && metrics.underPredictionRate > metrics.overPredictionRate) {
    next.competitor_weight += 0.03;
    next.holiday_weight += 0.02;
    next.airfare_weight -= 0.02;
    next.season_weight -= 0.03;
  }

  if (metrics.directionAccuracy < 65 && metrics.overPredictionRate > metrics.underPredictionRate) {
    next.competitor_weight -= 0.03;
    next.holiday_weight -= 0.01;
    next.airfare_weight += 0.02;
    next.season_weight += 0.02;
  }

  if (metrics.mape > 0.2) {
    next.competitor_weight -= 0.02;
    next.season_weight += 0.02;
  }

  if (metrics.alertUsefulRate != null && metrics.alertUsefulRate < 55) {
    next.holiday_weight -= 0.01;
    next.season_weight += 0.01;
  }

  if (metrics.alertUsefulRate != null && metrics.alertUsefulRate > 80) {
    next.competitor_weight += 0.01;
    next.holiday_weight += 0.01;
    next.airfare_weight -= 0.01;
    next.season_weight -= 0.01;
  }

  return normalizeWeights(next);
}

function clampAndRebalanceWeights(oldWeightsInput, proposedWeightsInput, maxDeltaPct) {
  const oldWeights = normalizeWeights(oldWeightsInput);
  const proposedWeights = normalizeWeights(proposedWeightsInput);
  const bounds = {};
  const clamped = {};

  for (const key of WEIGHT_KEYS) {
    const base = Number(oldWeights[key] || 0);
    const cap = Math.abs(base * Number(maxDeltaPct || 0.05));
    const min = Math.max(0.01, base - cap);
    const max = Math.min(0.99, base + cap);
    bounds[key] = { min, max };
    clamped[key] = clamp(Number(proposedWeights[key] || base), min, max);
  }

  let remaining = 1 - WEIGHT_KEYS.reduce((sum, key) => sum + Number(clamped[key] || 0), 0);
  let guard = 0;

  while (Math.abs(remaining) > 0.000001 && guard < 8) {
    const expandable = WEIGHT_KEYS.filter((key) =>
      remaining > 0 ? clamped[key] < bounds[key].max : clamped[key] > bounds[key].min,
    );
    if (!expandable.length) break;

    const room = expandable.reduce((sum, key) => {
      const delta = remaining > 0 ? bounds[key].max - clamped[key] : clamped[key] - bounds[key].min;
      return sum + Math.max(0, delta);
    }, 0);

    if (room <= 0) break;

    for (const key of expandable) {
      const localRoom =
        remaining > 0 ? bounds[key].max - clamped[key] : clamped[key] - bounds[key].min;
      const ratio = Math.max(0, localRoom) / room;
      const allocation = remaining * ratio;
      clamped[key] += allocation;
      clamped[key] = clamp(clamped[key], bounds[key].min, bounds[key].max);
    }

    remaining = 1 - WEIGHT_KEYS.reduce((sum, key) => sum + Number(clamped[key] || 0), 0);
    guard += 1;
  }

  const finalWeights = normalizeWeights(clamped);
  const deltas = {};
  for (const key of WEIGHT_KEYS) {
    const oldVal = Number(oldWeights[key] || 0);
    deltas[key] = oldVal > 0 ? round((finalWeights[key] - oldVal) / oldVal, 6) : 0;
  }

  return {
    clampedWeights: finalWeights,
    deltas,
  };
}

function computeMetrics(dataset) {
  const byHotel = new Map();
  for (const row of dataset) {
    const key = row.hotel_id;
    if (!byHotel.has(key)) byHotel.set(key, []);
    byHotel.get(key).push(row);
  }

  let directionSamples = 0;
  let directionMatches = 0;
  let underPrediction = 0;
  let overPrediction = 0;
  let mapeSum = 0;
  let mapeCount = 0;

  for (const rows of byHotel.values()) {
    rows.sort((a, b) => String(a.outcome_date).localeCompare(String(b.outcome_date)));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const actualAdr = Number(row.actual_adr || 0);
      const suggested = Number(row.suggested_base || 0);

      if (actualAdr > 0 && suggested > 0) {
        mapeSum += Math.abs(suggested - actualAdr) / actualAdr;
        mapeCount += 1;
      }

      if (i === rows.length - 1) continue;
      const next = rows[i + 1];
      const currentAdr = Number(row.actual_adr || 0);
      const nextAdr = Number(next.actual_adr || 0);
      if (currentAdr <= 0 || nextAdr <= 0) continue;

      const deltaPct = ((nextAdr - currentAdr) / currentAdr) * 100;
      const actualDirection = directionFromPct(deltaPct);
      const predictedDirection = directionFromAction(row.recommended_action);

      directionSamples += 1;
      if (actualDirection === predictedDirection) directionMatches += 1;
      if (actualDirection === 'up' && predictedDirection !== 'up') underPrediction += 1;
      if (predictedDirection === 'up' && actualDirection !== 'up') overPrediction += 1;
    }
  }

  const directionAccuracy = directionSamples ? (directionMatches / directionSamples) * 100 : 0;
  const underPredictionRate = directionSamples ? (underPrediction / directionSamples) * 100 : 0;
  const overPredictionRate = directionSamples ? (overPrediction / directionSamples) * 100 : 0;
  const mape = mapeCount ? mapeSum / mapeCount : 0;

  return {
    outcomeRows: dataset.length,
    directionSamples,
    directionAccuracy: round(directionAccuracy, 2),
    underPredictionRate: round(underPredictionRate, 2),
    overPredictionRate: round(overPredictionRate, 2),
    mape: round(mape, 4),
  };
}

function resolveBootstrapAdr(target, fallbackAdr) {
  const latestPrice = Number(target.latest_price || 0);
  if (Number.isFinite(latestPrice) && latestPrice > 0) return Math.round(latestPrice);

  const latestSuggestedBase = Number(target.latest_suggested_base || 0);
  if (Number.isFinite(latestSuggestedBase) && latestSuggestedBase > 0) {
    return Math.round(latestSuggestedBase);
  }

  const baseMin = Number(target.base_price_min || 0);
  const baseMax = Number(target.base_price_max || 0);
  if (Number.isFinite(baseMin) && Number.isFinite(baseMax) && baseMin > 0 && baseMax > 0) {
    return Math.round((baseMin + baseMax) / 2);
  }
  if (Number.isFinite(baseMax) && baseMax > 0) return Math.round(baseMax);
  if (Number.isFinite(baseMin) && baseMin > 0) return Math.round(baseMin);

  return Math.round(fallbackAdr);
}

function filterDatasetByHotelIds(dataset, hotelIds) {
  if (!Array.isArray(hotelIds) || !hotelIds.length) return [];
  const idSet = new Set(hotelIds);
  return dataset.filter((row) => idSet.has(row.hotel_id));
}

async function resolveCanarySelection({
  city,
  canaryFraction,
  maxCanaryPercentage,
}) {
  const hotels = await listActiveHotelsByCity(city);
  if (!hotels.length) {
    return { totalHotels: 0, canaryCount: 0, canaryHotelIds: [], source: 'none' };
  }

  const sortedHotels = [...hotels].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const existingCanary = await listEnabledCanaryHotelsByCity(city);
  const maxCount = Math.max(1, Math.floor(sortedHotels.length * clamp(maxCanaryPercentage, 0.01, 1)));
  const desiredCount = Math.max(
    1,
    Math.ceil(sortedHotels.length * clamp(Number(canaryFraction || 0.2), 0.01, 1)),
  );

  if (existingCanary.length) {
    const existingSet = new Set(existingCanary.map((row) => row.hotel_id));
    const inCityStable = sortedHotels
      .map((hotel) => hotel.id)
      .filter((hotelId) => existingSet.has(hotelId))
      .slice(0, maxCount);

    return {
      totalHotels: sortedHotels.length,
      canaryCount: inCityStable.length,
      canaryHotelIds: inCityStable,
      source: 'existing',
    };
  }

  const canaryCount = Math.min(maxCount, desiredCount);
  return {
    totalHotels: sortedHotels.length,
    canaryCount,
    canaryHotelIds: sortedHotels.slice(0, canaryCount).map((hotel) => hotel.id),
    source: 'new',
  };
}

async function applyCanaryVersionByCity({
  city,
  canaryHotelIds,
  weights,
  modelVersionId,
  triggeredBy,
}) {
  const hotels = await listActiveHotelsByCity(city);
  const canarySet = new Set(canaryHotelIds);

  await Promise.all(
    hotels.map((hotel) =>
      setCanaryOverride({
        hotelId: hotel.id,
        enabled: canarySet.has(hotel.id),
        overrideWeights: canarySet.has(hotel.id) ? weights : {},
        updatedBy: triggeredBy || null,
        modelVersionId: canarySet.has(hotel.id) ? modelVersionId : null,
      }),
    ),
  );

  return {
    totalHotels: hotels.length,
    canaryCount: canaryHotelIds.length,
    canaryHotelIds,
  };
}

function accuracyFromVersion(version) {
  if (!version) return null;
  const latest = Number(version.accuracy_latest);
  if (Number.isFinite(latest)) return latest;
  const baseline = Number(version.accuracy_baseline);
  return Number.isFinite(baseline) ? baseline : null;
}

function isRevertRequired({ accuracyBefore, accuracyAfter, revertAccuracyDropThreshold }) {
  if (!Number.isFinite(accuracyBefore) || accuracyBefore <= 0) return false;
  if (!Number.isFinite(accuracyAfter)) return false;
  const drop = (accuracyBefore - accuracyAfter) / accuracyBefore;
  return drop > Number(revertAccuracyDropThreshold || 0.05);
}

async function tuneAlertThresholdByFeedback({ metrics }) {
  if (metrics.alertUsefulRate == null) return null;

  const calibration = await getCalibration({ force: true });
  const current = Number(calibration?.global?.thresholds?.competitorMovement || 8);
  let next = current;

  if (metrics.alertUsefulRate < 55) next = Math.min(12, current + 0.5);
  if (metrics.alertUsefulRate > 80) next = Math.max(6, current - 0.5);

  if (next === current) {
    return { updated: false, previous: current, current: next };
  }

  await upsertCalibrationSetting('global.thresholds.competitorMovement', next);
  return { updated: true, previous: current, current: next };
}

/**
 * Ingest daily outcome data from CSV text.
 */
export async function ingestOutcomeCsv({ csvText, source = 'manual_csv', uploadedBy = null, defaultCity = '' }) {
  const parsed = parseCsvRows(csvText);
  if (!parsed.length) {
    return { inserted: 0, errors: [{ row: 0, message: 'No valid CSV rows found.' }] };
  }

  const hotelCache = new Map();
  const prepared = [];
  const errors = [];

  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    const rowNo = i + 2;
    const outcomeDate = parseDate(row.outcome_date || row.date);
    const actualAdr = parseNumber(row.actual_adr || row.adr);
    const occupancyPct = parseNumber(row.occupancy_pct || row.occupancy);
    const pickupRooms = parseNumber(row.pickup_rooms || row.pickup);

    if (!outcomeDate) {
      errors.push({ row: rowNo, message: 'Missing/invalid date.' });
      continue;
    }
    if (!Number.isFinite(actualAdr) || actualAdr < 0) {
      errors.push({ row: rowNo, message: 'Missing/invalid actual_adr.' });
      continue;
    }

    let hotelId = String(row.hotel_id || row.id || '').trim();
    if (!hotelId) {
      const hotelName = String(row.hotel_name || row.hotel || '').trim();
      const city = String(row.city || defaultCity || '').trim();
      if (!hotelName) {
        errors.push({ row: rowNo, message: 'hotel_id or hotel_name is required.' });
        continue;
      }

      const cacheKey = `${hotelName.toLowerCase()}::${city.toLowerCase()}`;
      if (!hotelCache.has(cacheKey)) {
        const hotel = await findHotelByNameInCity(city, hotelName);
        hotelCache.set(cacheKey, hotel?.id || null);
      }
      hotelId = hotelCache.get(cacheKey) || '';
    }

    if (!hotelId) {
      errors.push({ row: rowNo, message: 'Hotel not found for row.' });
      continue;
    }

    prepared.push({
      hotelId,
      outcomeDate,
      actualAdr,
      occupancyPct: occupancyPct == null ? null : clamp(occupancyPct, 0, 100),
      pickupRooms: pickupRooms == null ? null : Math.max(0, Math.round(pickupRooms)),
      source,
      uploadedBy,
    });
  }

  const insertedRows = await upsertHotelDailyOutcomes(prepared);
  return {
    inserted: insertedRows.length,
    parsed: parsed.length,
    errors,
  };
}

export async function labelAlert({ alertId, feedback, note = '', userId = null }) {
  const normalized = String(feedback || '').trim().toLowerCase();
  if (!['useful', 'noise', 'ignore'].includes(normalized)) {
    const error = new Error("feedback must be one of: 'useful', 'noise', 'ignore'.");
    error.status = 400;
    throw error;
  }

  const row = await upsertAlertFeedback({
    alertId,
    feedback: normalized,
    note: String(note || '').trim(),
    createdBy: userId,
  });

  if (!row) {
    const error = new Error('Alert not found.');
    error.status = 404;
    throw error;
  }
  return row;
}

export async function setHotelCanary({ hotelId, enabled, overrideWeights, userId = null }) {
  if (!enabled) {
    return setCanaryOverride({
      hotelId,
      enabled: false,
      overrideWeights: {},
      updatedBy: userId,
      modelVersionId: null,
    });
  }

  return setCanaryOverride({
    hotelId,
    enabled: true,
    overrideWeights: normalizeWeights(overrideWeights || {}),
    updatedBy: userId,
    modelVersionId: null,
  });
}

export async function runCityCalibration({
  city,
  days = 14,
  minObservations = null,
  canaryFraction = 0.2,
  triggeredBy = null,
  dryRun = false,
}) {
  const safeCity = String(city || '').trim();
  if (!safeCity) {
    const error = new Error('city is required for calibration run.');
    error.status = 400;
    throw error;
  }

  const calibration = await getCalibration();
  const governance = calibration?.calibration || {};
  const hasMinObservationOverride =
    minObservations !== null && minObservations !== undefined && String(minObservations).trim() !== '';
  const minOutcomeThreshold = hasMinObservationOverride
    ? Number(minObservations)
    : Number(governance.minOutcomeThreshold || 8);
  const maxWeightDelta = Number(governance.maxWeightDelta || 0.05);
  const maxCanaryPercentage = Number(governance.maxCanaryPercentage || 0.2);
  const revertAccuracyDropThreshold = Number(governance.revertAccuracyDropThreshold || 0.05);

  const [cityWeights, cityRow, dataset, feedback] = await Promise.all([
    getCityWeightsForUpdate(safeCity),
    getCityByName(safeCity),
    getCityCalibrationDataset(safeCity, days),
    getAlertFeedbackRate(safeCity, days),
  ]);

  if (!cityWeights) {
    const error = new Error(`No city_weights row found for city '${safeCity}'.`);
    error.status = 404;
    throw error;
  }
  if (!cityRow) {
    const error = new Error(`No cities row found for city '${safeCity}'.`);
    error.status = 404;
    throw error;
  }

  const oldWeights = normalizeWeights(pickWeights(cityWeights));
  const metrics = computeMetrics(dataset);
  const alertUsefulRate =
    Number(feedback.total_feedback || 0) > 0
      ? (Number(feedback.useful_feedback || 0) / Number(feedback.total_feedback || 1)) * 100
      : null;

  metrics.alertUsefulRate = alertUsefulRate == null ? null : round(alertUsefulRate, 2);
  metrics.feedbackSamples = Number(feedback.total_feedback || 0);

  const outcomeSampleSize = Number(metrics.outcomeRows || 0);
  if (outcomeSampleSize < minOutcomeThreshold) {
    const run = await insertCalibrationRun({
      scopeType: 'city',
      scopeValue: safeCity,
      status: 'insufficient_data',
      metrics: {
        ...metrics,
        minOutcomeThreshold,
      },
      oldWeights,
      newWeights: oldWeights,
      proposedWeights: oldWeights,
      appliedWeights: oldWeights,
      clampedWeights: oldWeights,
      outcomeSampleSize,
      versionCreated: false,
      revertFlag: false,
      accuracyBefore: null,
      accuracyAfter: null,
      notes: `Insufficient validated outcomes: ${outcomeSampleSize}/${minOutcomeThreshold}.`,
      triggeredBy,
    });

    return {
      run,
      applied: false,
      reason: 'insufficient_data',
      oldWeights,
      newWeights: oldWeights,
      proposedWeights: oldWeights,
      clampedWeights: oldWeights,
      metrics,
      canary: { totalHotels: 0, canaryCount: 0, canaryHotelIds: [] },
      thresholdTuning: null,
      version: null,
    };
  }

  const proposedWeights = proposeWeights(oldWeights, metrics);
  const { clampedWeights, deltas } = clampAndRebalanceWeights(oldWeights, proposedWeights, maxWeightDelta);
  const canaryPlan = await resolveCanarySelection({
    city: safeCity,
    canaryFraction,
    maxCanaryPercentage,
  });

  if (!canaryPlan.canaryCount) {
    const run = await insertCalibrationRun({
      scopeType: 'city',
      scopeValue: safeCity,
      status: 'skipped',
      metrics: {
        ...metrics,
        canarySource: 'none',
      },
      oldWeights,
      newWeights: oldWeights,
      proposedWeights,
      appliedWeights: oldWeights,
      clampedWeights,
      outcomeSampleSize,
      versionCreated: false,
      revertFlag: false,
      accuracyBefore: null,
      accuracyAfter: null,
      notes: `No active hotels found for city '${safeCity}'.`,
      triggeredBy,
    });

    return {
      run,
      applied: false,
      reason: 'no_hotels',
      oldWeights,
      newWeights: oldWeights,
      proposedWeights,
      clampedWeights,
      metrics,
      canary: canaryPlan,
      thresholdTuning: null,
      version: null,
    };
  }

  if (dryRun) {
    const run = await insertCalibrationRun({
      scopeType: 'city',
      scopeValue: safeCity,
      status: 'completed',
      metrics: {
        ...metrics,
        dryRun: true,
        canaryCount: canaryPlan.canaryCount,
        canaryTotal: canaryPlan.totalHotels,
        canarySource: canaryPlan.source,
        weightDeltas: deltas,
      },
      oldWeights,
      newWeights: clampedWeights,
      proposedWeights,
      appliedWeights: clampedWeights,
      clampedWeights,
      outcomeSampleSize,
      versionCreated: false,
      revertFlag: false,
      accuracyBefore: null,
      accuracyAfter: null,
      notes: 'Dry run only. Governance checks passed; no live canary mutation applied.',
      triggeredBy,
    });

    return {
      run,
      applied: false,
      reason: 'dry_run',
      oldWeights,
      newWeights: clampedWeights,
      proposedWeights,
      clampedWeights,
      metrics,
      canary: canaryPlan,
      thresholdTuning: null,
      version: null,
    };
  }

  const previousVersion = await getLatestActiveOrCanaryModelVersionForCity(cityRow.id);
  const version = await createModelVersion({
    cityId: cityRow.id,
    weightSnapshot: clampedWeights,
    parentVersion: previousVersion?.version_id || null,
    calibrationRunId: null,
    status: 'canary',
    accuracyBaseline: accuracyFromVersion(previousVersion),
    metadata: {
      canarySource: canaryPlan.source,
      canaryCount: canaryPlan.canaryCount,
      outcomeSampleSize,
      maxWeightDelta,
    },
  });

  const canary = await applyCanaryVersionByCity({
    city: safeCity,
    canaryHotelIds: canaryPlan.canaryHotelIds,
    weights: clampedWeights,
    modelVersionId: version.version_id,
    triggeredBy,
  });

  const thresholdTuning = await tuneAlertThresholdByFeedback({ metrics });
  const rollingDataset = await getCityCalibrationDataset(safeCity, 7);
  const rollingCanaryDataset = filterDatasetByHotelIds(rollingDataset, canaryPlan.canaryHotelIds);
  const rollingMetrics = computeMetrics(rollingCanaryDataset);
  const accuracyAfter = rollingMetrics.directionAccuracy;

  await updateModelVersionAccuracy(version.version_id, accuracyAfter);

  const previousAccuracy = accuracyFromVersion(previousVersion);
  const shouldRevert = isRevertRequired({
    accuracyBefore: previousAccuracy,
    accuracyAfter,
    revertAccuracyDropThreshold,
  });

  if (shouldRevert && previousVersion?.weight_snapshot_json) {
    const parentWeights = normalizeWeights(pickWeights(previousVersion.weight_snapshot_json));
    await applyCanaryVersionByCity({
      city: safeCity,
      canaryHotelIds: canaryPlan.canaryHotelIds,
      weights: parentWeights,
      modelVersionId: previousVersion.version_id,
      triggeredBy,
    });

    await updateModelVersionStatus(version.version_id, 'reverted', {
      revertReason: 'accuracy_drop_guardrail',
      accuracyBefore: previousAccuracy,
      accuracyAfter,
      revertThreshold: revertAccuracyDropThreshold,
    });

    const revivedVersion = await getPreviousModelVersionForCity(cityRow.id, version.version_no);
    if (revivedVersion) {
      await updateModelVersionStatus(revivedVersion.version_id, 'active', {
        activatedAt: new Date().toISOString(),
      });
    }

    const run = await insertCalibrationRun({
      scopeType: 'city',
      scopeValue: safeCity,
      status: 'reverted',
      metrics: {
        ...metrics,
        canaryCount: canary.canaryCount,
        canaryTotal: canary.totalHotels,
        canarySource: canaryPlan.source,
        weightDeltas: deltas,
        rollingDirectionAccuracy: rollingMetrics.directionAccuracy,
        rollingDirectionSamples: rollingMetrics.directionSamples,
      },
      oldWeights,
      newWeights: parentWeights,
      proposedWeights,
      appliedWeights: clampedWeights,
      clampedWeights,
      outcomeSampleSize,
      versionCreated: true,
      revertFlag: true,
      accuracyBefore: previousAccuracy,
      accuracyAfter,
      notes:
        `Guardrail revert executed. Accuracy drop exceeded ${(revertAccuracyDropThreshold * 100).toFixed(2)}%.` +
        ` Candidate version: v${version.version_no}.`,
      triggeredBy,
    });

    await linkModelVersionToRun(version.version_id, run.id);

    return {
      run,
      applied: false,
      reverted: true,
      oldWeights,
      newWeights: parentWeights,
      proposedWeights,
      clampedWeights,
      metrics,
      canary,
      thresholdTuning,
      version: {
        id: version.version_id,
        versionNo: version.version_no,
        status: 'reverted',
      },
      accuracy: {
        before: previousAccuracy,
        after: accuracyAfter,
      },
    };
  }

  const run = await insertCalibrationRun({
    scopeType: 'city',
    scopeValue: safeCity,
    status: 'completed',
    metrics: {
      ...metrics,
      canaryCount: canary.canaryCount,
      canaryTotal: canary.totalHotels,
      canarySource: canaryPlan.source,
      weightDeltas: deltas,
      rollingDirectionAccuracy: rollingMetrics.directionAccuracy,
      rollingDirectionSamples: rollingMetrics.directionSamples,
    },
    oldWeights,
    newWeights: clampedWeights,
    proposedWeights,
    appliedWeights: clampedWeights,
    clampedWeights,
    outcomeSampleSize,
    versionCreated: true,
    revertFlag: false,
    accuracyBefore: previousAccuracy,
    accuracyAfter,
    notes: 'Calibration applied to canary scope with governance guardrails.',
    triggeredBy,
  });

  await linkModelVersionToRun(version.version_id, run.id);

  return {
    run,
    applied: true,
    reverted: false,
    oldWeights,
    newWeights: clampedWeights,
    proposedWeights,
    clampedWeights,
    metrics,
    canary,
    thresholdTuning,
    version: {
      id: version.version_id,
      versionNo: version.version_no,
      status: 'canary',
    },
    accuracy: {
      before: previousAccuracy,
      after: accuracyAfter,
    },
  };
}

export async function getCalibrationRunHistory(limit = 50) {
  return listCalibrationRuns(limit);
}

export async function getCanaryList(city = '') {
  return listCanaryOverrides(city);
}

export async function runNightlyCalibration({
  days = 14,
  minObservations = null,
  canaryFraction = null,
  dryRun = false,
  triggeredBy = null,
} = {}) {
  const calibration = await getCalibration();
  const governance = calibration?.calibration || {};
  const hasMinObservationOverride =
    minObservations !== null && minObservations !== undefined && String(minObservations).trim() !== '';
  const hasCanaryOverride =
    canaryFraction !== null && canaryFraction !== undefined && String(canaryFraction).trim() !== '';
  const effectiveMinOutcomes = hasMinObservationOverride
    ? Number(minObservations)
    : Number(governance.minOutcomeThreshold || 8);
  const effectiveCanaryFraction = hasCanaryOverride
    ? Number(canaryFraction)
    : Number(governance.maxCanaryPercentage || 0.2);

  const cities = await listOperationalCities();
  const results = [];

  for (const city of cities) {
    try {
      const result = await runCityCalibration({
        city,
        days,
        minObservations: effectiveMinOutcomes,
        canaryFraction: effectiveCanaryFraction,
        dryRun,
        triggeredBy,
      });
      results.push({
        city,
        status: 'ok',
        runId: result.run?.id || null,
        applied: result.applied,
        reverted: Boolean(result.reverted),
        reason: result.reason || null,
        directionAccuracy: result.metrics?.directionAccuracy ?? null,
      });
    } catch (error) {
      results.push({
        city,
        status: 'error',
        message: error.message,
      });
    }
  }

  return {
    cities: results,
    total: results.length,
    success: results.filter((row) => row.status === 'ok').length,
    failed: results.filter((row) => row.status === 'error').length,
  };
}

/**
 * Insert synthetic daily outcomes for focus-city hotels only when a date has no recorded outcome.
 * This keeps calibration moving without overwriting manually uploaded ground-truth rows.
 */
export async function runDailyOutcomeBootstrap({
  daysAhead = 1,
  occupancyPct = 72,
  pickupRooms = 6,
  fallbackAdr = 5000,
  source = 'system_bootstrap',
  uploadedBy = null,
} = {}) {
  const horizonDays = Math.max(1, Math.min(30, Number(daysAhead || 1)));
  const safeOccupancy = clamp(Number(occupancyPct || 72), 1, 100);
  const safePickup = Math.max(0, Math.round(Number(pickupRooms || 6)));
  const safeFallbackAdr = Math.max(500, Number(fallbackAdr || 5000));

  const targets = await listOutcomeBootstrapTargets();
  if (!targets.length) {
    return {
      hotels: 0,
      attemptedRows: 0,
      insertedRows: 0,
      daysAhead: horizonDays,
      source,
    };
  }

  const today = new Date();
  const rows = [];

  for (const target of targets) {
    const adr = resolveBootstrapAdr(target, safeFallbackAdr);
    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offset);
      rows.push({
        hotelId: target.id,
        outcomeDate: date.toISOString().slice(0, 10),
        actualAdr: adr,
        occupancyPct: safeOccupancy,
        pickupRooms: safePickup,
        source,
        uploadedBy,
      });
    }
  }

  const inserted = await insertOutcomeBootstrapRows(rows);
  return {
    hotels: targets.length,
    attemptedRows: rows.length,
    insertedRows: inserted.length,
    daysAhead: horizonDays,
    source,
  };
}
