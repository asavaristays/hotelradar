import express from 'express';
import { requireAuth, requireBetaAcceptance } from '../middleware/authMiddleware.js';
import { computeStrategicPositioningIndex } from '../services/strategicPositioningEngine.js';
import { simulateRevenueImpact } from '../services/revenueImpactSimulator.js';
import { computeForecastAccuracy } from '../services/forecastAccuracyTracker.js';

export const executiveInsightsRouter = express.Router();

function parseNumericQuery(query, key, { min = -Infinity, max = Infinity, required = true } = {}) {
  const raw = query[key];
  if ((raw == null || raw === '') && !required) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    const error = new Error(`${key} must be a valid number.`);
    error.status = 400;
    throw error;
  }
  if (value < min || value > max) {
    const error = new Error(`${key} must be between ${min} and ${max}.`);
    error.status = 400;
    throw error;
  }
  return value;
}

function parseForecastHistory(raw) {
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    const error = new Error('forecastHistory must be valid JSON.');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(parsed)) {
    const error = new Error('forecastHistory must be an array.');
    error.status = 400;
    throw error;
  }
  return parsed;
}

function buildFallbackHistory({ positionPercent, volatilityScore, demandScore }) {
  const peak = demandScore >= 65;
  return [
    {
      date: '2026-02-24',
      predicted: { positionPercent, demandPeak: peak, volatilityScore },
      actual: {
        positionPercent: positionPercent + 2,
        demandPeak: peak,
        volatilityScore: Math.max(0, volatilityScore - 3),
      },
    },
    {
      date: '2026-02-25',
      predicted: { positionPercent, demandPeak: peak, volatilityScore },
      actual: {
        positionPercent: positionPercent - 1,
        demandPeak: peak,
        volatilityScore: volatilityScore + 4,
      },
    },
    {
      date: '2026-02-26',
      predicted: { positionPercent, demandPeak: peak, volatilityScore },
      actual: {
        positionPercent: positionPercent + 6,
        demandPeak: !peak,
        volatilityScore: volatilityScore + 9,
      },
    },
  ];
}

executiveInsightsRouter.get('/api/executiveInsights', requireAuth, requireBetaAcceptance(), async (req, res, next) => {
  try {
    const positionPercent = parseNumericQuery(req.query, 'positionPercent', { min: -100, max: 100 });
    const confidenceScore = parseNumericQuery(req.query, 'confidenceScore', { min: 0, max: 100 });
    const demandScore = parseNumericQuery(req.query, 'demandScore', { min: 0, max: 100 });
    const volatilityScore = parseNumericQuery(req.query, 'volatilityScore', { min: 0, max: 100 });
    const compressionScore = parseNumericQuery(req.query, 'compressionScore', { min: 0, max: 100 });

    const currentADR = parseNumericQuery(req.query, 'currentADR', { min: 0, max: 1000000 });
    const competitorMedian = parseNumericQuery(req.query, 'competitorMedian', {
      min: 0,
      max: 1000000,
    });
    const day7 = parseNumericQuery(req.query, 'demand7', { min: 0, max: 100 });
    const day14 = parseNumericQuery(req.query, 'demand14', { min: 0, max: 100 });
    const day30 = parseNumericQuery(req.query, 'demand30', { min: 0, max: 100 });
    const roomNights = parseNumericQuery(req.query, 'roomNights', {
      min: 1,
      max: 100000,
      required: false,
    });

    const spi = computeStrategicPositioningIndex({
      positionPercent,
      confidenceScore,
      demandScore,
      volatilityScore,
      compressionScore,
    });

    const revenue = simulateRevenueImpact({
      currentADR,
      competitorMedian,
      demandSignals: { day7, day14, day30 },
      roomNights: roomNights || 100,
    });

    const historyInput =
      parseForecastHistory(req.query.forecastHistory) ||
      buildFallbackHistory({ positionPercent, volatilityScore, demandScore });

    const forecastAccuracy = computeForecastAccuracy(historyInput, {
      forecastPeriod: 'rolling_30d',
    });

    return res.json({
      spiScore: spi.spiScore,
      spiCategory: spi.category,
      revenueScenarios: revenue.revenueScenarios,
      forecastAccuracy,
    });
  } catch (error) {
    return next(error);
  }
});
