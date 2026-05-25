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
    system_time: new Date().toISOString(),
  };
}
