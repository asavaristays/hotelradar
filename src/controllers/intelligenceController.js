import { analyzeHotelPositioning } from '../services/intelligence-engine/positioningAnalysisEngine.js';
import {
  consistencyFromNormalizedRows,
  normalizeCompetitorRates,
} from '../services/intelligence-engine/rateNormalizationEngine.js';
import {
  computeMarketConfidenceIndex,
  computeMarketConfidenceSeries,
} from '../services/intelligence-engine/marketConfidenceEngine.js';
import { getCompetitorIntelligenceForUser } from '../services/competitorIntelligenceService.js';
import { getDemandCalendar } from '../services/demandCalendarService.js';
import { getDemandForecastForUser } from '../services/demandForecastService.js';
import { getDirectBookingOpportunityForUser } from '../services/directBookingOpportunityService.js';
import { getIntelligenceAlertsForUser } from '../services/intelligenceAlertsService.js';
import { getMarketCompressionForUser } from '../services/marketCompressionService.js';
import { getMarketPositionIntelligenceForUser } from '../services/marketPositionIntelligenceService.js';
import { getMissedRevenueForUser } from '../services/missedRevenueService.js';
import { getMorningBriefForUser } from '../services/morningBriefService.js';
import { getTodayMarketIntelligenceForUser } from '../services/todayIntelligenceService.js';
import { getMarketIntelligenceMapPayload } from '../services/intelligenceMapService.js';
import { getMarketOpportunityFeed } from '../services/opportunityFeedService.js';
import { getRadarScoreForUser } from '../services/radarScoreService.js';
import { getRevenueAdviceForUser } from '../services/revenueAdviceService.js';
import { getSystemStatus } from '../services/systemStatusService.js';
import { getReleasedLeadRadarSignals } from '../services/liveSignalReleaseService.js';
import { listUpcomingEventsByCity } from '../repositories/eventRepository.js';

function resolveIntelligenceUser(req) {
  const requestedHotelId = String(req.query?.hotel_id || '').trim();
  if (!requestedHotelId) {
    return req.user;
  }

  const user = req.user;
  if (!user) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }

  if (user.role === 'hotel_user' && !user.hotels.includes(requestedHotelId)) {
    const error = new Error('Forbidden: hotel access denied.');
    error.status = 403;
    throw error;
  }

  return {
    ...user,
    hotels: [requestedHotelId],
  };
}

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

export async function getTodayMarketIntelligence(req, res, next) {
  try {
    const payload = await getTodayMarketIntelligenceForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMarketIntelligenceMap(req, res, next) {
  try {
    const payload = await getMarketIntelligenceMapPayload();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getCompetitorIntelligence(req, res, next) {
  try {
    const payload = await getCompetitorIntelligenceForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getRevenueAdvice(req, res, next) {
  try {
    const payload = await getRevenueAdviceForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getRadarScore(req, res, next) {
  try {
    const payload = await getRadarScoreForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getDemandCalendarEntries(req, res, next) {
  try {
    const payload = await getDemandCalendar();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getDemandForecast(req, res, next) {
  try {
    const payload = await getDemandForecastForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getDirectBookingOpportunity(req, res, next) {
  try {
    const payload = await getDirectBookingOpportunityForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMarketCompression(req, res, next) {
  try {
    const payload = await getMarketCompressionForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMarketPositionIntelligence(req, res, next) {
  try {
    const payload = await getMarketPositionIntelligenceForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMissedRevenue(req, res, next) {
  try {
    const payload = await getMissedRevenueForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMorningBrief(req, res, next) {
  try {
    const payload = await getMorningBriefForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getIntelligenceAlerts(req, res, next) {
  try {
    const payload = await getIntelligenceAlertsForUser(resolveIntelligenceUser(req));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getMarketIntelligenceOpportunities(req, res, next) {
  try {
    const payload = await getMarketOpportunityFeed({
      city: req.query?.city || null,
      signalType: req.query?.signalType || null,
      limitPerCity: req.query?.limitPerCity || 20,
      limit: req.query?.limit || 200,
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getLeadRadarExternalSignalFeed(req, res, next) {
  try {
    const payload = await getReleasedLeadRadarSignals({
      city: req.query?.city || '',
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getLeadRadarUpcomingEvents(req, res, next) {
  try {
    const city = String(req.query?.city || '').trim();
    const horizonDays = Number(req.query?.horizonDays || 15);
    const events = city ? await listUpcomingEventsByCity(city, { horizonDays }) : [];
    return res.json({ city, events });
  } catch (error) {
    return next(error);
  }
}

export async function getDebugSystemStatus(req, res, next) {
  try {
    const payload = await getSystemStatus();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}
