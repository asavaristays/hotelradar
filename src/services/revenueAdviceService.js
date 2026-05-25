import { getHotelById } from '../repositories/hotelRepository.js';
import { getDashboard } from './dashboardService.js';

const CACHE_TTL_MS = 30_000;
const responseCache = new Map();

function getCachedPayload(hotelId) {
  const cached = responseCache.get(hotelId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(hotelId);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(hotelId, payload) {
  responseCache.set(hotelId, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function round(value, digits = 0) {
  const safe = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function getExpectedRevenueGain(revenueImpact = {}) {
  const maintain = Number(revenueImpact?.maintain || 0);
  const recommended = String(revenueImpact?.recommended || 'maintain');

  let target = maintain;
  if (recommended === 'plus2') {
    target = Number(revenueImpact?.plus2 || 0);
  } else if (recommended === 'minus2') {
    target = Number(revenueImpact?.minus2 || 0);
  }

  return round(target - maintain, 0);
}

function buildVerification({ hotel, dashboard }) {
  const checks = [
    {
      key: 'hotel_context',
      label: 'Hotel context',
      passed: Boolean(String(hotel?.city || '').trim()),
    },
    {
      key: 'pricing_snapshot',
      label: 'Pricing snapshot',
      passed:
        Number.isFinite(Number(dashboard?.marketPosition?.hotelPrice ?? NaN)) &&
        Number.isFinite(Number(dashboard?.suggestedPricing?.base ?? NaN)),
    },
    {
      key: 'confidence_score',
      label: 'Confidence score',
      passed: Number.isFinite(Number(dashboard?.confidence?.score ?? NaN)),
    },
    {
      key: 'revenue_impact',
      label: 'Revenue impact',
      passed: Number.isFinite(Number(dashboard?.revenueImpact?.maintain ?? NaN)),
    },
  ];

  const passCount = checks.filter((check) => check.passed).length;
  const verified = passCount >= 2;

  return {
    status: verified ? 'verified' : 'review',
    label: verified ? 'Checked twice before display' : 'Needs review before display',
    pass_count: passCount,
    checks,
    checked_at: new Date().toISOString(),
  };
}

export async function getRevenueAdviceForUser(
  user,
  deps = {
    getHotelById,
    getDashboard,
  },
) {
  const hotelIds = Array.isArray(user?.hotels) ? user.hotels.filter(Boolean) : [];

  if (!hotelIds.length) {
    const error = new Error('Hotel context is required for revenue advice.');
    error.status = 400;
    throw error;
  }

  const hotelId = hotelIds[0];
  const cached = getCachedPayload(hotelId);
  if (cached) {
    return cached;
  }

  const hotel = await deps.getHotelById(hotelId);
  if (!hotel?.city) {
    const error = new Error('Unable to determine hotel city from authenticated context.');
    error.status = 404;
    throw error;
  }

  const dashboard = await deps.getDashboard(hotelId, {
    user_id: user?.id || null,
    user_role: user?.role || null,
  });

  const payload = {
    hotel_id: hotelId,
    city: hotel.city,
    market_demand: dashboard?.demandLevel || 'Unknown',
    current_price: round(dashboard?.marketPosition?.hotelPrice || 0, 0),
    suggested_price: round(dashboard?.suggestedPricing?.base || 0, 0),
    confidence_score: round(dashboard?.confidence?.score || 0, 0),
    risk_level: dashboard?.suggestedPricing?.riskLevel || 'Low',
    expected_revenue_gain: getExpectedRevenueGain(dashboard?.revenueImpact),
    generated_at: dashboard?.lastUpdated || new Date().toISOString(),
    verification: buildVerification({
      hotel,
      dashboard,
    }),
  };

  setCachedPayload(hotelId, payload);
  return payload;
}
