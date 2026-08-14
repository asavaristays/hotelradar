import { pool } from '../db/pool.js';
import { focusCities } from '../config/productScope.js';

async function getNotificationsTableName() {
  const { rows } = await pool.query(
    `SELECT
       CASE
         WHEN to_regclass('public.market_notifications') IS NOT NULL THEN 'market_notifications'
         WHEN to_regclass('public.market_opportunity_notifications') IS NOT NULL THEN 'market_opportunity_notifications'
         ELSE ''
       END AS table_name`,
  );

  return String(rows[0]?.table_name || '').trim();
}

async function getCount(tableName) {
  const { rows } = await pool.query(`SELECT COUNT(*)::integer AS total FROM ${tableName}`);
  return Number(rows[0]?.total || 0);
}

async function getLatestTimestamp(tableName, columnName) {
  const { rows } = await pool.query(`SELECT MAX(${columnName}) AS observed_at FROM ${tableName}`);
  return rows[0]?.observed_at || null;
}

async function getDailyDelta(tableName, columnName = 'created_at') {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE ${columnName} >= CURRENT_DATE
       )::integer AS today_total,
       COUNT(*) FILTER (
         WHERE ${columnName} >= CURRENT_DATE - INTERVAL '1 day'
           AND ${columnName} < CURRENT_DATE
       )::integer AS yesterday_total
     FROM ${tableName}`,
  );

  const todayTotal = Number(rows[0]?.today_total || 0);
  const yesterdayTotal = Number(rows[0]?.yesterday_total || 0);

  return {
    today_total: todayTotal,
    yesterday_total: yesterdayTotal,
    delta: todayTotal - yesterdayTotal,
  };
}

async function getLiveSourceSummary() {
  const tableCheck = await pool.query(
    `SELECT to_regclass('public.verified_live_data_sources') IS NOT NULL AS exists`,
  );
  if (!tableCheck.rows[0]?.exists) {
    return {
      total_sources: 0,
      enabled_sources: 0,
      ok_sources: 0,
      partial_sources: 0,
      failed_sources: 0,
      never_checked_sources: 0,
      last_checked_at: null,
      sources: [],
    };
  }

  const { rows } = await pool.query(
    `WITH all_sources AS (
       SELECT
         s.id,
         s.hotel_id,
         COALESCE(h.hotel_name, 'Market-level source') AS hotel_name,
         COALESCE(c.name, h.city, s.city, '') AS city,
         s.source_type,
         s.source_name,
         s.adapter_type,
         s.enabled,
         s.cadence_minutes,
         s.proof_required,
         s.freshness_minutes,
         s.last_checked_at,
         s.last_status,
         s.last_error,
         s.updated_at
       FROM verified_live_data_sources s
       LEFT JOIN hotels h ON h.id = s.hotel_id
       LEFT JOIN cities c ON c.id = h.city_id
     ),
     visible AS (
       SELECT *
       FROM all_sources
       ORDER BY updated_at DESC
       LIMIT 30
     )
     SELECT
       (SELECT COUNT(*)::integer FROM all_sources) AS total_sources,
       (SELECT COUNT(*) FILTER (WHERE enabled)::integer FROM all_sources) AS enabled_sources,
       (SELECT COUNT(*) FILTER (WHERE enabled AND last_status = 'ok')::integer FROM all_sources) AS ok_sources,
       (SELECT COUNT(*) FILTER (WHERE enabled AND last_status = 'partial')::integer FROM all_sources) AS partial_sources,
       (SELECT COUNT(*) FILTER (WHERE enabled AND last_status = 'failed')::integer FROM all_sources) AS failed_sources,
       (SELECT COUNT(*) FILTER (WHERE enabled AND last_status = 'never_checked')::integer FROM all_sources) AS never_checked_sources,
       (SELECT MAX(last_checked_at) FROM all_sources WHERE enabled) AS last_checked_at,
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', id,
               'hotel_id', hotel_id,
               'hotel_name', hotel_name,
               'city', city,
               'source_type', source_type,
               'source_name', source_name,
               'adapter_type', adapter_type,
               'enabled', enabled,
               'cadence_minutes', cadence_minutes,
               'proof_required', proof_required,
               'freshness_minutes', freshness_minutes,
               'last_checked_at', last_checked_at,
               'last_status', last_status,
               'last_error', last_error
             )
           )
           FROM visible
         ),
         '[]'::jsonb
       ) AS sources`,
  );

  let sources = [];
  const rawSources = rows[0]?.sources;
  if (Array.isArray(rawSources)) {
    sources = rawSources;
  } else if (typeof rawSources === 'string') {
    try {
      const parsed = JSON.parse(rawSources);
      sources = Array.isArray(parsed) ? parsed : [];
    } catch {
      sources = [];
    }
  }

  return {
    total_sources: Number(rows[0]?.total_sources || 0),
    enabled_sources: Number(rows[0]?.enabled_sources || 0),
    ok_sources: Number(rows[0]?.ok_sources || 0),
    partial_sources: Number(rows[0]?.partial_sources || 0),
    failed_sources: Number(rows[0]?.failed_sources || 0),
    never_checked_sources: Number(rows[0]?.never_checked_sources || 0),
    last_checked_at: rows[0]?.last_checked_at || null,
    sources,
  };
}

function toIstDate(input) {
  const parsed = input ? new Date(input) : new Date();
  const utcMs = parsed.getTime();
  const istMs = utcMs + 330 * 60 * 1000;
  return new Date(istMs);
}

function formatIstDateKey(input) {
  const date = toIstDate(input);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesIntoIstDay(input) {
  const date = toIstDate(input);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function describeScrapeRun({ now = new Date(), lastHotelScrapeAt = null, lastSignalRefreshAt = null } = {}) {
  const scheduledMinutes = 17 * 60 + 30;
  const nowDateKey = formatIstDateKey(now);
  const nowMinutes = minutesIntoIstDay(now);

  const scrapeDateKey = lastHotelScrapeAt ? formatIstDateKey(lastHotelScrapeAt) : '';
  const signalDateKey = lastSignalRefreshAt ? formatIstDateKey(lastSignalRefreshAt) : '';
  const scrapeMinutes = lastHotelScrapeAt ? minutesIntoIstDay(lastHotelScrapeAt) : -1;
  const signalMinutes = lastSignalRefreshAt ? minutesIntoIstDay(lastSignalRefreshAt) : -1;

  const scrapeRanToday = scrapeDateKey === nowDateKey;
  const signalRanToday = signalDateKey === nowDateKey;
  const scrapeCompletedAfterWindow = scrapeRanToday && scrapeMinutes >= scheduledMinutes;
  const signalCompletedAfterWindow = signalRanToday && signalMinutes >= scheduledMinutes;

  if (scrapeCompletedAfterWindow && signalCompletedAfterWindow) {
    return {
      scrape_status: 'completed',
      system_message: '5:30 PM scrape completed. Hotel data and signals are refreshed.',
    };
  }

  if (scrapeCompletedAfterWindow && !signalCompletedAfterWindow) {
    return {
      scrape_status: 'delayed',
      system_message: 'Hotel scrape completed after 5:30 PM, but signal refresh is still pending.',
    };
  }

  if (!scrapeCompletedAfterWindow && signalCompletedAfterWindow) {
    return {
      scrape_status: 'delayed',
      system_message: 'Signals were refreshed, but today\'s 5:30 PM hotel scrape has not completed yet.',
    };
  }

  if (nowMinutes < scheduledMinutes) {
    return {
      scrape_status: 'pending',
      system_message: '5:30 PM scrape is pending. Hotel data and signals will refresh after the scheduled run.',
    };
  }

  if (scrapeRanToday || signalRanToday) {
    return {
      scrape_status: 'delayed',
      system_message:
        'Today\'s 5:30 PM scrape window has started, but hotel data and signals are not fully refreshed yet.',
    };
  }

  return {
    scrape_status: 'missed',
    system_message: '5:30 PM scrape has not run yet. Please run the daily hotel scrape and signal refresh.',
  };
}

export async function getSystemStatus(options = {}) {
  const notificationsTable = await getNotificationsTableName();

  const [
    hotelsIndexed,
    signalsGenerated,
    rankedOpportunities,
    notificationsGenerated,
    lastHotelScrapeAt,
    lastSignalRefreshAt,
    hotelDelta,
    signalDelta,
    rankedDelta,
    notificationDelta,
    liveSources,
  ] = await Promise.all([
    getCount('market_hotels'),
    getCount('market_hotel_signals'),
    getCount('market_ranked_opportunities'),
    notificationsTable ? getCount(notificationsTable) : Promise.resolve(0),
    getLatestTimestamp('market_hotels', 'updated_at'),
    getLatestTimestamp('market_hotel_signals', 'created_at'),
    getDailyDelta('market_hotels', 'updated_at'),
    getDailyDelta('market_hotel_signals'),
    getDailyDelta('market_ranked_opportunities'),
    notificationsTable ? getDailyDelta(notificationsTable) : Promise.resolve({ today_total: 0, yesterday_total: 0, delta: 0 }),
    getLiveSourceSummary(),
  ]);

  const statusSummary = describeScrapeRun({
    now: options.now || new Date(),
    lastHotelScrapeAt,
    lastSignalRefreshAt,
  });

  return {
    hotels_indexed: hotelsIndexed,
    signals_generated: signalsGenerated,
    ranked_opportunities: rankedOpportunities,
    notifications_generated: notificationsGenerated,
    hotels_delta: hotelDelta,
    signals_delta: signalDelta,
    ranked_opportunities_delta: rankedDelta,
    notifications_delta: notificationDelta,
    city_count: focusCities.length,
    cities: focusCities,
    last_hotel_scrape_at: lastHotelScrapeAt,
    last_signal_refresh_at: lastSignalRefreshAt,
    scrape_status: statusSummary.scrape_status,
    system_message: statusSummary.system_message,
    live_sources: liveSources,
    system_time: new Date().toISOString(),
  };
}
