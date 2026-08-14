import {
  getCompetitorByHotelAndName,
  getLatestCompetitorPrice,
  insertCompetitor,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
} from '../repositories/ingestionRepository.js';
import { getHotelById } from '../repositories/hotelRepository.js';
import {
  createRealtimeSignalRun,
  finishRealtimeSignalRun,
  insertRealtimeSignalObservation,
} from '../repositories/realtimeSignalRepository.js';
import { upsertCityEvent } from '../repositories/eventRepository.js';
import { recalculateDashboard } from './dashboardService.js';

const RATE_SOURCE_TYPES = new Set(['official', 'ota', 'competitor']);
const SUPPORTING_SOURCE_TYPES = new Set(['event', 'mice', 'wedding', 'airfare', 'weather']);
const ALL_SOURCE_TYPES = new Set([...RATE_SOURCE_TYPES, ...SUPPORTING_SOURCE_TYPES]);

function validationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseDate(value, fieldName = 'checkin_date') {
  const raw = String(value || '').trim();
  if (!raw) throw validationError(`${fieldName} is required.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw validationError(`${fieldName} must be YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw validationError(`${fieldName} must be a valid calendar date.`);
  }
  return raw;
}

function parsePositiveNumber(value, fieldName = 'value') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw validationError(`${fieldName} must be greater than zero.`);
  }
  return Math.round(parsed * 100) / 100;
}

function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeSourceType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!ALL_SOURCE_TYPES.has(raw)) {
    throw validationError(`Unsupported source_type '${raw || '(blank)'}'.`);
  }
  return raw;
}

function signalTypeFor(sourceType) {
  if (sourceType === 'official') return 'hotel_rate';
  if (sourceType === 'ota') return 'ota_rate';
  if (sourceType === 'competitor') return 'competitor_rate';
  if (sourceType === 'airfare') return 'airfare_trend';
  if (sourceType === 'weather') return 'weather_signal';
  return 'event_signal';
}

function observationSourceType(sourceType) {
  if (sourceType === 'mice' || sourceType === 'wedding') return 'event';
  return sourceType;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function freshnessHoursFor(sourceType) {
  if (sourceType === 'official') return 6;
  if (sourceType === 'ota' || sourceType === 'competitor') return 4;
  if (sourceType === 'airfare') return 12;
  if (sourceType === 'weather') return 24;
  return 72;
}

async function ensureCompetitor(hotelId, sourceName, proofUrl = '') {
  const existing = await getCompetitorByHotelAndName(hotelId, sourceName);
  if (existing) return existing;
  return insertCompetitor({ hotelId, competitorName: sourceName, websiteUrl: proofUrl || null });
}

function normalizeEntries(input = {}) {
  const rows = Array.isArray(input.entries) ? input.entries : [input];
  return rows.filter((row) => row && typeof row === 'object');
}

function normalizeEntry(entry = {}, fallbackCheckinDate = '') {
  const sourceType = normalizeSourceType(entry.source_type || entry.sourceType);
  const checkinDate = parseDate(entry.checkin_date || entry.checkinDate || fallbackCheckinDate);
  const sourceName = String(entry.source_name || entry.sourceName || '').trim();
  if (!sourceName) throw validationError('source_name is required.');

  const numericValue = RATE_SOURCE_TYPES.has(sourceType)
    ? parsePositiveNumber(entry.value_numeric ?? entry.valueNumeric ?? entry.rate ?? entry.price, 'rate')
    : parseOptionalNumber(entry.value_numeric ?? entry.valueNumeric ?? entry.impact_score ?? entry.impactScore);

  const textValue = String(entry.value_text || entry.valueText || entry.note || '').trim();
  if (!RATE_SOURCE_TYPES.has(sourceType) && numericValue == null && !textValue) {
    throw validationError('Supporting signal requires either value_numeric or value_text.');
  }

  return {
    sourceType,
    checkinDate,
    sourceName,
    valueNumeric: numericValue,
    valueText: textValue,
    currency: String(entry.currency || 'INR').trim().toUpperCase() || 'INR',
    proofUrl: String(entry.proof_url || entry.proofUrl || '').trim(),
    confidenceScore: Math.max(0, Math.min(100, Number(entry.confidence_score ?? entry.confidenceScore ?? 72))),
    roomType: String(entry.room_type || entry.roomType || '').trim(),
    mealPlan: String(entry.meal_plan || entry.mealPlan || '').trim(),
    eventVenue: String(entry.venue || entry.eventVenue || '').trim(),
    eventScale: String(entry.scale || entry.eventScale || 'medium').trim().toLowerCase(),
    eventEndDate: entry.end_date || entry.endDate || checkinDate,
    metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
  };
}

async function persistRateEvidence({ hotel, runId, entry, observedAt, now }) {
  if (entry.sourceType === 'official') {
    await insertHotelRateSnapshot({
      hotelId: hotel.id,
      checkinDate: entry.checkinDate,
      price: entry.valueNumeric,
      capturedAt: observedAt,
    });
  } else {
    const competitor = await ensureCompetitor(hotel.id, entry.sourceName, entry.proofUrl);
    const previousPrice = await getLatestCompetitorPrice({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: entry.checkinDate,
    });
    await insertCompetitorRateSnapshot({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: entry.checkinDate,
      priceToday: entry.valueNumeric,
      price48hAgo: Number(previousPrice || entry.valueNumeric),
      scrapedAt: observedAt,
    });
  }

  await insertRealtimeSignalObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate: entry.checkinDate,
    sourceType: observationSourceType(entry.sourceType),
    sourceName: entry.sourceName,
    signalType: signalTypeFor(entry.sourceType),
    valueNumeric: entry.valueNumeric,
    valueText: entry.valueText,
    currency: entry.currency,
    proofUrl: entry.proofUrl,
    confidenceScore: entry.confidenceScore,
    observedAt,
    freshnessExpiresAt: addHours(now, freshnessHoursFor(entry.sourceType)),
    metadata: {
      ...entry.metadata,
      phase: 'phase_2_manual_input',
      sourceAdapter: 'manual_signal_input',
      originalSourceType: entry.sourceType,
      roomType: entry.roomType || null,
      mealPlan: entry.mealPlan || null,
    },
  });
}

async function persistSupportingEvidence({ hotel, runId, entry, observedAt, now }) {
  if (entry.sourceType === 'event' || entry.sourceType === 'mice' || entry.sourceType === 'wedding') {
    await upsertCityEvent({
      city: hotel.city,
      eventName: entry.sourceName,
      venue: entry.eventVenue || hotel.city,
      startDate: entry.checkinDate,
      endDate: parseDate(entry.eventEndDate, 'end_date'),
      category: entry.sourceType === 'mice' ? 'conference' : entry.sourceType,
      scale: ['small', 'medium', 'large'].includes(entry.eventScale) ? entry.eventScale : 'medium',
      source: 'manual_signal_input',
      confidence: entry.confidenceScore >= 80 ? 'confirmed' : 'tentative',
      eventUrl: entry.proofUrl,
      impactScore: entry.valueNumeric ?? 8,
      scrapedAt: observedAt,
    });
  }

  await insertRealtimeSignalObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate: entry.checkinDate,
    sourceType: observationSourceType(entry.sourceType),
    sourceName: entry.sourceName,
    signalType: signalTypeFor(entry.sourceType),
    valueNumeric: entry.valueNumeric,
    valueText: entry.valueText,
    currency: entry.currency,
    proofUrl: entry.proofUrl,
    confidenceScore: entry.confidenceScore,
    observedAt,
    freshnessExpiresAt: addHours(now, freshnessHoursFor(entry.sourceType)),
    metadata: {
      ...entry.metadata,
      phase: 'phase_2_manual_input',
      sourceAdapter: 'manual_signal_input',
      originalSourceType: entry.sourceType,
      eventType: entry.sourceType === 'mice' ? 'mice' : entry.sourceType === 'wedding' ? 'wedding' : null,
      venue: entry.eventVenue || null,
    },
  });
}

export async function captureManualMarketSignals(hotelId, payload = {}, context = {}) {
  const hotel = await getHotelById(hotelId);
  if (!hotel) throw validationError('Hotel not found.', 404);

  const now = new Date();
  const observedAt = new Date(payload.observed_at || payload.observedAt || now).toISOString();
  const fallbackCheckinDate = payload.checkin_date || payload.checkinDate || '';
  const entries = normalizeEntries(payload).map((entry) => normalizeEntry(entry, fallbackCheckinDate));
  if (!entries.length) throw validationError('At least one signal entry is required.');

  const run = await createRealtimeSignalRun({
    source: 'phase_2_manual_signal_input',
    cadence: 'manual',
  });

  const summary = {
    runId: run?.id || null,
    hotelId: hotel.id,
    hotelName: hotel.hotel_name,
    city: hotel.city,
    officialRows: 0,
    otaRows: 0,
    competitorRows: 0,
    eventRows: 0,
    airfareRows: 0,
    weatherRows: 0,
    recalculatedDates: 0,
    checkinDates: [],
    capturedBy: context.userId || null,
  };

  try {
    for (const entry of entries) {
      if (RATE_SOURCE_TYPES.has(entry.sourceType)) {
        await persistRateEvidence({ hotel, runId: run.id, entry, observedAt, now });
      } else {
        await persistSupportingEvidence({ hotel, runId: run.id, entry, observedAt, now });
      }

      if (entry.sourceType === 'official') summary.officialRows += 1;
      if (entry.sourceType === 'ota') summary.otaRows += 1;
      if (entry.sourceType === 'competitor') summary.competitorRows += 1;
      if (entry.sourceType === 'event' || entry.sourceType === 'mice' || entry.sourceType === 'wedding') summary.eventRows += 1;
      if (entry.sourceType === 'airfare') summary.airfareRows += 1;
      if (entry.sourceType === 'weather') summary.weatherRows += 1;
      summary.checkinDates.push(entry.checkinDate);
    }

    const uniqueDates = [...new Set(summary.checkinDates)];
    for (const checkinDate of uniqueDates) {
      await recalculateDashboard(hotel.id, {
        checkin_date: checkinDate,
        triggered_by: 'manual-signal-input',
        source: 'phase_2_manual_input',
        user_id: context.userId || null,
        user_role: context.userRole || null,
      });
      summary.recalculatedDates += 1;
    }

    summary.checkinDates = uniqueDates;
    await finishRealtimeSignalRun({ runId: run.id, status: 'completed', summary });
    return summary;
  } catch (error) {
    await finishRealtimeSignalRun({
      runId: run?.id,
      status: 'failed',
      summary,
      errorMessage: error.message,
    }).catch(() => {});
    throw error;
  }
}
