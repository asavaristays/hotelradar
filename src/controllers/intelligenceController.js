import { analyzeHotelPositioning } from '../services/intelligence-engine/positioningAnalysisEngine.js';
import {
  consistencyFromNormalizedRows,
  normalizeCompetitorRates,
} from '../services/intelligence-engine/rateNormalizationEngine.js';
import {
  computeMarketConfidenceIndex,
  computeMarketConfidenceSeries,
} from '../services/intelligence-engine/marketConfidenceEngine.js';

export async function postNormalizeRates(req, res, next) {
  try {
    const input = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(input)) {
      const error = new Error('Input must be an array of competitor pricing rows.');
      error.status = 400;
      throw error;
    }

    const normalized = normalizeCompetitorRates(input);
    return res.json(normalized);
  } catch (error) {
    return next(error);
  }
}

export async function postMarketConfidence(req, res, next) {
  try {
    const input = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (Array.isArray(input)) {
      const output = computeMarketConfidenceSeries(input);
      return res.json(output);
    }

    const payload = req.body || {};
    if (!payload.date) {
      const error = new Error('date is required for market confidence calculation.');
      error.status = 400;
      throw error;
    }

    // If consistency not supplied, compute a deterministic fallback from normalized rows.
    if (!Number.isFinite(Number(payload.consistency_score)) && Array.isArray(payload.normalized_rows)) {
      payload.consistency_score = consistencyFromNormalizedRows(payload.normalized_rows);
    }

    return res.json(computeMarketConfidenceIndex(payload));
  } catch (error) {
    return next(error);
  }
}

export async function postPositionAnalysis(req, res, next) {
  try {
    const payload = req.body || {};
    if (!payload.hotel) {
      const error = new Error('hotel is required.');
      error.status = 400;
      throw error;
    }

    if (!Array.isArray(payload.hotelRates) || !Array.isArray(payload.competitorNormalizedRates)) {
      const error = new Error('hotelRates and competitorNormalizedRates arrays are required.');
      error.status = 400;
      throw error;
    }

    const output = analyzeHotelPositioning({
      hotel: payload.hotel,
      hotelRates: payload.hotelRates,
      competitorNormalizedRates: payload.competitorNormalizedRates,
      marketConfidenceIndex: Array.isArray(payload.marketConfidenceIndex)
        ? payload.marketConfidenceIndex
        : [],
    });

    return res.json(output);
  } catch (error) {
    return next(error);
  }
}
