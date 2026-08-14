import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';
import {
  createRealtimeSignalRun,
  finishRealtimeSignalRun,
  insertRealtimeSignalObservation,
} from '../repositories/realtimeSignalRepository.js';
import {
  getCompetitorByHotelAndName,
  getLatestCompetitorPrice,
  insertCompetitor,
  insertCompetitorRateSnapshot,
  insertHotelRateSnapshot,
} from '../repositories/ingestionRepository.js';
import { upsertCityEvent } from '../repositories/eventRepository.js';
import { enqueueRecalculationJob } from './recalcQueueService.js';
import {
  DEFAULT_PHASE_ONE_CITY,
  DEFAULT_PHASE_ONE_HOTEL_NAME,
  PHASE_ONE_MARKET_INTELLIGENCE_TAG,
  buildPhaseOneMarketIntelligenceScenario,
} from './phaseOneMarketIntelligenceScenario.js';

const OFFICIAL_PROOF_URL =
  'https://letsbook.me/booking/994038?checkin=2026-08-03&checkout=2026-08-04&adults=2&children=0&isbookongoogle=1';

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

async function findPilotHotel({ hotelId = '', hotelName = DEFAULT_PHASE_ONE_HOTEL_NAME, city = DEFAULT_PHASE_ONE_CITY } = {}) {
  if (hotelId) {
    const { rows } = await pool.query(
      `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
       FROM hotels h
       LEFT JOIN cities c ON c.id = h.city_id
       WHERE h.id = $1
       LIMIT 1`,
      [hotelId],
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `SELECT h.id, h.hotel_name, COALESCE(c.name, h.city) AS city
     FROM hotels h
     LEFT JOIN cities c ON c.id = h.city_id
     WHERE lower(COALESCE(c.name, h.city)) = lower($1)
       AND (
         lower(h.hotel_name) LIKE lower($2)
         OR lower(h.hotel_name) LIKE '%ten%'
       )
     ORDER BY
       CASE WHEN lower(h.hotel_name) LIKE '%the ten%' THEN 0 ELSE 1 END,
       h.created_at DESC
     LIMIT 1`,
    [city, `%${hotelName}%`],
  );
  return rows[0] || null;
}

async function ensureCompetitor(hotelId, competitorName, websiteUrl = '') {
  const existing = await getCompetitorByHotelAndName(hotelId, competitorName);
  if (existing) return existing;
  return insertCompetitor({ hotelId, competitorName, websiteUrl });
}

async function upsertHoliday({ city, holidayDate, holidayName, holidayType }) {
  await pool.query(
    `INSERT INTO holidays (city, holiday_date, holiday_name, holiday_type)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (city, holiday_date, holiday_name)
     DO UPDATE SET holiday_type = EXCLUDED.holiday_type`,
    [city, holidayDate, holidayName, holidayType],
  );
}

async function upsertAirfare({ city, date, avgPrice, changePct = null }) {
  await pool.query(
    `INSERT INTO airfare_data (city, date, avg_price, change_pct)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (city, date)
     DO UPDATE SET avg_price = EXCLUDED.avg_price,
                   change_pct = EXCLUDED.change_pct`,
    [city, date, avgPrice, changePct],
  );
}

async function insertRateEvidence({ runId, hotel, stayDate, now }) {
  await insertHotelRateSnapshot({
    hotelId: hotel.id,
    checkinDate: stayDate.checkinDate,
    price: stayDate.officialRate,
    capturedAt: stayDate.observedAt,
  });

  await insertRealtimeSignalObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate: stayDate.checkinDate,
    sourceType: 'official',
    sourceName: `${hotel.hotel_name} official booking engine`,
    signalType: 'hotel_rate',
    valueNumeric: stayDate.officialRate,
    proofUrl: OFFICIAL_PROOF_URL,
    confidenceScore: 88,
    observedAt: stayDate.observedAt,
    freshnessExpiresAt: addHours(now, 6),
    metadata: {
      ...stayDate.metadata,
      sourceAdapter: 'official_booking_engine_phase_1',
      roomType: 'Base available room',
      mealPlan: 'As shown by channel snapshot',
    },
  });

  for (const [sourceName, rate] of stayDate.otaRates) {
    const competitor = await ensureCompetitor(hotel.id, sourceName, '');
    const previousPrice = await getLatestCompetitorPrice({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: stayDate.checkinDate,
    });
    await insertCompetitorRateSnapshot({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: stayDate.checkinDate,
      priceToday: rate,
      price48hAgo: Number(previousPrice || Math.round(rate * 0.98)),
      scrapedAt: stayDate.observedAt,
    });
    await insertRealtimeSignalObservation({
      runId,
      hotelId: hotel.id,
      city: hotel.city,
      checkinDate: stayDate.checkinDate,
      sourceType: 'ota',
      sourceName,
      signalType: 'ota_rate',
      valueNumeric: rate,
      proofUrl: sourceName === 'Google Hotels official panel' ? OFFICIAL_PROOF_URL : '',
      confidenceScore: 80,
      observedAt: stayDate.observedAt,
      freshnessExpiresAt: addHours(now, 4),
      metadata: {
        ...stayDate.metadata,
        sourceAdapter: 'ota_snapshot_phase_1',
        rateRelationToOfficialPct: Math.round(((rate - stayDate.officialRate) / stayDate.officialRate) * 1000) / 10,
      },
    });
  }

  for (const [sourceName, rate] of stayDate.competitorRates) {
    const competitor = await ensureCompetitor(hotel.id, sourceName, '');
    const previousPrice = await getLatestCompetitorPrice({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: stayDate.checkinDate,
    });
    await insertCompetitorRateSnapshot({
      hotelId: hotel.id,
      competitorId: competitor.id,
      checkinDate: stayDate.checkinDate,
      priceToday: rate,
      price48hAgo: Number(previousPrice || Math.round(rate * 0.97)),
      scrapedAt: stayDate.observedAt,
    });
    await insertRealtimeSignalObservation({
      runId,
      hotelId: hotel.id,
      city: hotel.city,
      checkinDate: stayDate.checkinDate,
      sourceType: 'competitor',
      sourceName,
      signalType: 'competitor_rate',
      valueNumeric: rate,
      proofUrl: '',
      confidenceScore: 76,
      observedAt: stayDate.observedAt,
      freshnessExpiresAt: addHours(now, 4),
      metadata: {
        ...stayDate.metadata,
        sourceAdapter: 'competitor_snapshot_phase_1',
        compSetRole: sourceName === 'The Westin Goa' ? 'aspirational benchmark' : 'north_goa_boutique_comp_set',
      },
    });
  }
}

async function insertSignalEvidence({ runId, hotel, stayDate, now }) {
  await insertRealtimeSignalObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate: stayDate.checkinDate,
    sourceType: 'airfare',
    sourceName: `Goa travel-search and airfare pressure: ${stayDate.label}`,
    signalType: 'airfare_trend',
    valueNumeric: stayDate.pressure.airfare,
    valueText: stayDate.narrative,
    proofUrl: '',
    confidenceScore: 68,
    observedAt: stayDate.observedAt,
    freshnessExpiresAt: addHours(now, 12),
    metadata: {
      ...stayDate.metadata,
      sourceAdapter: 'search_airfare_proxy_phase_1',
      signalDirection: stayDate.pressure.airfare >= 18 ? 'supporting' : 'watch',
    },
  });

  await insertRealtimeSignalObservation({
    runId,
    hotelId: hotel.id,
    city: hotel.city,
    checkinDate: stayDate.checkinDate,
    sourceType: 'weather',
    sourceName: `Goa monsoon operating risk: ${stayDate.label}`,
    signalType: 'weather_signal',
    valueNumeric: stayDate.pressure.weather,
    valueText: stayDate.pressure.weather <= -5
      ? 'Monsoon uncertainty can soften last-minute leisure conversion.'
      : 'Weather drag is limited; price action can rely more on rate and demand evidence.',
    proofUrl: '',
    confidenceScore: 58,
    observedAt: stayDate.observedAt,
    freshnessExpiresAt: addHours(now, 24),
    metadata: {
      ...stayDate.metadata,
      sourceAdapter: 'weather_risk_proxy_phase_1',
      signalDirection: 'risk',
    },
  });
}

async function insertEventEvidence({ runId, hotel, scenario, now }) {
  for (const event of scenario.events) {
    await upsertCityEvent({
      ...event,
      scrapedAt: scenario.observedAt,
    });

    await insertRealtimeSignalObservation({
      runId,
      hotelId: hotel.id,
      city: hotel.city,
      checkinDate: event.startDate,
      sourceType: 'event',
      sourceName: event.eventName,
      signalType: 'event_signal',
      valueNumeric: event.impactScore,
      valueText: `${event.eventName} around ${event.venue}`,
      proofUrl: event.eventUrl || '',
      confidenceScore: event.confidence === 'confirmed' ? 86 : 68,
      observedAt: scenario.observedAt,
      freshnessExpiresAt: addHours(now, 72),
      metadata: {
        ...scenario.metadata,
        eventType: event.category === 'conference' ? 'mice' : event.category,
        category: event.category,
        scale: event.scale,
        venue: event.venue,
        estimatedAttendance: event.estimatedAttendance,
        sourceAdapter: 'event_calendar_phase_1',
      },
    });
  }
}

async function seedHolidayAndAirfareBaselines(scenario) {
  await upsertHoliday({
    city: scenario.city,
    holidayDate: '2026-08-15',
    holidayName: 'Independence Day',
    holidayType: 'public',
  });
  await upsertHoliday({
    city: scenario.city,
    holidayDate: '2026-08-16',
    holidayName: 'Independence Day long weekend spillover',
    holidayType: 'long_weekend',
  });
  await upsertHoliday({
    city: scenario.city,
    holidayDate: '2026-08-28',
    holidayName: 'Raksha Bandhan',
    holidayType: 'regional',
  });
  await upsertHoliday({
    city: scenario.city,
    holidayDate: '2026-08-29',
    holidayName: 'Raksha Bandhan weekend',
    holidayType: 'long_weekend',
  });

  const airfareBaseline = [
    ['2026-08-14', 7100, 7.5],
    ['2026-08-15', 8200, 16.8],
    ['2026-08-16', 7900, 13.1],
    ['2026-08-21', 6900, 5.2],
    ['2026-08-22', 7350, 8.4],
    ['2026-08-28', 8100, 15.6],
    ['2026-08-29', 8450, 18.3],
    ['2026-08-30', 7600, 9.1],
  ];
  for (const [date, avgPrice, changePct] of airfareBaseline) {
    await upsertAirfare({ city: scenario.city, date, avgPrice, changePct });
  }
}

async function recalculateAffectedDates({ hotelId, dates, primaryCheckinDate }) {
  const uniqueDates = [...new Set(dates)].filter(Boolean);
  const orderedDates = [
    ...uniqueDates.filter((date) => date !== primaryCheckinDate),
    primaryCheckinDate,
  ].filter(Boolean);

  let recalculated = 0;
  const { recalculateDashboard } = await import('./dashboardService.js');
  for (const checkinDate of orderedDates) {
    try {
      await recalculateDashboard(hotelId, {
        checkin_date: checkinDate,
        triggered_by: 'phase-one-market-intelligence-seed',
        source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
      });
      recalculated += 1;
    } catch (error) {
      logger.warn('phase_one_market_intelligence_recalculate_failed', {
        hotelId,
        checkinDate,
        error: error.message,
      });
      await enqueueRecalculationJob({
        hotelId,
        source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
        priority: 30,
        payload: {
          triggered_by: 'phase-one-market-intelligence-seed',
          source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
          checkin_date: checkinDate,
        },
      });
    }
  }
  return recalculated;
}

export async function seedPhaseOneMarketIntelligence(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const scenario = buildPhaseOneMarketIntelligenceScenario({
    now,
    hotelName: options.hotelName || DEFAULT_PHASE_ONE_HOTEL_NAME,
    city: options.city || DEFAULT_PHASE_ONE_CITY,
  });

  if (options.dryRun) {
    return {
      dryRun: true,
      scenario,
      summary: {
        stayDates: scenario.stayDates.length,
        officialRows: scenario.stayDates.length,
        otaRows: scenario.stayDates.reduce((total, stayDate) => total + stayDate.otaRates.length, 0),
        competitorRows: scenario.stayDates.reduce((total, stayDate) => total + stayDate.competitorRates.length, 0),
        events: scenario.events.length,
      },
    };
  }

  const hotel = await findPilotHotel({
    hotelId: options.hotelId || process.env.PHASE_ONE_HOTEL_ID || '',
    hotelName: scenario.hotelName,
    city: scenario.city,
  });

  if (!hotel) {
    const error = new Error(
      `Phase 1 pilot hotel not found. Add/select The Ten first, or set PHASE_ONE_HOTEL_ID.`,
    );
    error.code = 'PHASE_ONE_HOTEL_NOT_FOUND';
    throw error;
  }

  const run = await createRealtimeSignalRun({
    source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
    cadence: 'manual',
  });
  const affectedDates = [];
  const summary = {
    runId: run?.id || null,
    hotelId: hotel.id,
    hotelName: hotel.hotel_name,
    city: hotel.city,
    tag: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
    stayDates: scenario.stayDates.length,
    officialRows: 0,
    otaRows: 0,
    competitorRows: 0,
    eventRows: 0,
    airfareRows: 0,
    weatherRows: 0,
    holidaysUpserted: 4,
    airfareBaselinesUpserted: 8,
    recalculatedDates: 0,
    primaryCheckinDate: scenario.primaryCheckinDate,
  };

  try {
    await seedHolidayAndAirfareBaselines(scenario);
    for (const stayDate of scenario.stayDates) {
      await insertRateEvidence({ runId: run.id, hotel, stayDate, now });
      await insertSignalEvidence({ runId: run.id, hotel, stayDate, now });
      affectedDates.push(stayDate.checkinDate);
      summary.officialRows += 1;
      summary.otaRows += stayDate.otaRates.length;
      summary.competitorRows += stayDate.competitorRates.length;
      summary.airfareRows += 1;
      summary.weatherRows += 1;
    }

    await insertEventEvidence({ runId: run.id, hotel, scenario, now });
    summary.eventRows = scenario.events.length;
    affectedDates.push(...scenario.events.map((event) => event.startDate));

    if (options.recalculate !== false) {
      summary.recalculatedDates = await recalculateAffectedDates({
        hotelId: hotel.id,
        dates: affectedDates,
        primaryCheckinDate: scenario.primaryCheckinDate,
      });
    } else {
      for (const checkinDate of [...new Set(affectedDates)]) {
        await enqueueRecalculationJob({
          hotelId: hotel.id,
          source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
          priority: 30,
          payload: {
            triggered_by: 'phase-one-market-intelligence-seed',
            source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
            checkin_date: checkinDate,
          },
        });
      }
    }

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
