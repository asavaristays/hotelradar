import { average, clamp, round } from '../utils/math.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBinary(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value > 0 ? 1 : 0;
  const text = String(value || '').toLowerCase();
  return ['true', '1', 'yes', 'peak', 'high'].includes(text) ? 1 : 0;
}

function metricErrors(entry) {
  const predicted = entry?.predicted || {};
  const actual = entry?.actual || {};

  const positionError = Math.abs(
    toNumber(predicted.positionPercent, 0) - toNumber(actual.positionPercent, 0),
  );
  const volatilityError = Math.abs(
    toNumber(predicted.volatilityScore, 50) - toNumber(actual.volatilityScore, 50),
  );
  const demandPeakError = Math.abs(toBinary(predicted.demandPeak) - toBinary(actual.demandPeak));

  return {
    positionError,
    volatilityError,
    demandPeakError,
  };
}

function hitFromErrors(errors) {
  // A daily forecast is counted as hit when at least 2 of 3 dimensions are within tolerance.
  let hits = 0;
  if (errors.positionError <= 5) hits += 1;
  if (errors.volatilityError <= 8) hits += 1;
  if (errors.demandPeakError === 0) hits += 1;
  return hits >= 2;
}

/**
 * Append a normalized daily forecast log entry.
 * @param {Array<object>} history
 * @param {{
 *  date:string,
 *  predicted:{positionPercent:number,demandPeak:boolean|number|string,volatilityScore:number},
 *  actual:{positionPercent:number,demandPeak:boolean|number|string,volatilityScore:number}
 * }} entry
 * @returns {Array<object>}
 */
export function logDailyForecast(history = [], entry) {
  if (!entry || !entry.date) {
    const error = new Error('date is required for daily forecast logging.');
    error.status = 400;
    throw error;
  }
  const next = Array.isArray(history) ? [...history] : [];
  next.push({
    date: entry.date,
    predicted: entry.predicted || {},
    actual: entry.actual || {},
  });
  return next;
}

/**
 * Compute rolling forecast accuracy for position/demand peak/volatility predictions.
 * Improves model trust by making signal quality observable and measurable across time.
 *
 * @param {Array<object>} history
 * @param {{forecastPeriod?:string}} options
 * @returns {{
 *  forecastPeriod:string,
 *  accuracyPercentage:number,
 *  averageError:number,
 *  forecastHitRate:number,
 *  forecastErrorMargin:number
 * }}
 */
export function computeForecastAccuracy(history = [], options = {}) {
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) {
    return {
      forecastPeriod: options.forecastPeriod || 'rolling_30d',
      accuracyPercentage: 0,
      averageError: 0,
      forecastHitRate: 0,
      forecastErrorMargin: 0,
    };
  }

  const perRow = rows.map((entry) => {
    const errors = metricErrors(entry);
    return {
      ...errors,
      hit: hitFromErrors(errors),
    };
  });

  const hitRate = round((perRow.filter((row) => row.hit).length / perRow.length) * 100, 2);
  const avgPositionError = average(perRow.map((row) => row.positionError));
  const avgVolatilityError = average(perRow.map((row) => row.volatilityError));
  const avgDemandPeakError = average(perRow.map((row) => row.demandPeakError)) * 100;

  const averageError = round(
    clamp(avgPositionError * 0.45 + avgVolatilityError * 0.35 + avgDemandPeakError * 0.2, 0, 100),
    2,
  );

  return {
    forecastPeriod: options.forecastPeriod || 'rolling_30d',
    accuracyPercentage: hitRate,
    averageError,
    forecastHitRate: hitRate,
    forecastErrorMargin: averageError,
  };
}
