import fs from 'fs/promises';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const GOOGLE_CUSTOM_SEARCH_URL = 'https://customsearch.googleapis.com/customsearch/v1';
const GOOGLE_TRENDS_EXPLORE_URL = 'https://trends.google.com/trends/api/explore';
const GOOGLE_TRENDS_TIMESERIES_URL = 'https://trends.google.com/trends/api/widgetdata/multiline';

const QUERY_TEMPLATES = [
  {
    key: 'ceremony',
    signalType: 'WEDDING_DEMAND_ZONE',
    query: (city) => `${city} wedding venues destination wedding`,
    title: (city) => `Wedding momentum rising in ${city}`,
    recommendedAction:
      'Protect premium inventory and review ceremony-led package pricing.',
  },
  {
    key: 'business',
    signalType: 'CORPORATE_EVENT_CLUSTER',
    query: (city) => `${city} corporate events conference convention`,
    title: (city) => `Corporate demand window building in ${city}`,
    recommendedAction:
      'Push weekday corporate packages and tighten negotiated inventory controls.',
  },
  {
    key: 'events',
    signalType: 'EVENT_DEMAND_ZONE',
    query: (city) => `${city} concerts exhibitions live events`,
    title: (city) => `Event demand cluster active in ${city}`,
    recommendedAction:
      'Review event-zone pricing and late-booking restrictions.',
  },
  {
    key: 'travel',
    signalType: 'TOURISM_SPIKE',
    query: (city) => `${city} tourism travel things to do`,
    title: (city) => `Travel demand accelerating in ${city}`,
    recommendedAction:
      'Tighten leisure discounting and protect public pricing.',
  },
  {
    key: 'arrival',
    signalType: 'AIRPORT_DEMAND',
    query: (city) => `${city} airport arrivals flights today`,
    title: (city) => `Arrival pulse strengthening in ${city}`,
    recommendedAction:
      'Raise same-day and short-stay rates while monitoring pickup.',
  },
  {
    key: 'rate-pressure',
    signalType: 'PRICE_PRESSURE',
    query: (city) => `${city} hotel prices surge occupancy`,
    title: (city) => `Rate pressure surfacing in ${city}`,
    recommendedAction:
      'Review comp-set movement and tighten pricing guardrails.',
  },
  {
    key: 'ota',
    signalType: 'OTA_DEPENDENCE',
    query: (city) => `${city} hotels booking agoda makemytrip deals`,
    title: (city) => `OTA pressure visible in ${city}`,
    recommendedAction:
      'Push direct-channel offers and protect channel mix.',
  },
];

const TREND_TEMPLATES = [
  {
    key: 'hotel-search',
    signalType: 'TOURISM_SPIKE',
    keyword: (city) => `${city} hotels`,
    title: (city) => `Hotel search momentum rising in ${city}`,
    recommendedAction:
      'Review generic demand capture and protect direct-booking demand during this search window.',
  },
  {
    key: 'business-hotel',
    signalType: 'CORPORATE_EVENT_CLUSTER',
    keyword: (city) => `${city} business hotel`,
    title: (city) => `Business hotel search rising in ${city}`,
    recommendedAction:
      'Strengthen weekday corporate pricing and keep business-travel inventory ready.',
  },
  {
    key: 'wedding-hotel',
    signalType: 'WEDDING_DEMAND_ZONE',
    keyword: (city) => `${city} wedding hotel`,
    title: (city) => `Wedding hotel search rising in ${city}`,
    recommendedAction:
      'Lift premium package pricing and review wedding-led room inventory.',
  },
  {
    key: 'ceremony',
    signalType: 'WEDDING_DEMAND_ZONE',
    keyword: (city) => `${city} wedding`,
    title: (city) => `Wedding search momentum rising in ${city}`,
    recommendedAction:
      'Protect premium inventory and review ceremony-led package pricing.',
  },
  {
    key: 'business',
    signalType: 'CORPORATE_EVENT_CLUSTER',
    keyword: (city) => `${city} corporate event`,
    title: (city) => `Corporate search momentum rising in ${city}`,
    recommendedAction:
      'Push weekday corporate packages and tighten negotiated inventory controls.',
  },
  {
    key: 'events',
    signalType: 'EVENT_DEMAND_ZONE',
    keyword: (city) => `${city} concerts`,
    title: (city) => `Event search momentum active in ${city}`,
    recommendedAction:
      'Review event-zone pricing and late-booking restrictions.',
  },
  {
    key: 'travel',
    signalType: 'TOURISM_SPIKE',
    keyword: (city) => `${city} tourism`,
    title: (city) => `Travel search momentum building in ${city}`,
    recommendedAction:
      'Tighten leisure discounting and protect public pricing.',
  },
  {
    key: 'arrival',
    signalType: 'AIRPORT_DEMAND',
    keyword: (city) => `${city} airport`,
    title: (city) => `Arrival search momentum strengthening in ${city}`,
    recommendedAction:
      'Raise same-day and short-stay rates while monitoring pickup.',
  },
  {
    key: 'rate-pressure',
    signalType: 'PRICE_PRESSURE',
    keyword: (city) => `${city} hotel prices`,
    title: (city) => `Rate-search pressure visible in ${city}`,
    recommendedAction:
      'Review comp-set movement and tighten pricing guardrails.',
  },
  {
    key: 'ota',
    signalType: 'OTA_DEPENDENCE',
    keyword: (city) => `${city} hotel deals`,
    title: (city) => `Deal-search pressure visible in ${city}`,
    recommendedAction:
      'Push direct-channel offers and protect channel mix.',
  },
];

const defaultDeps = {
  fetchImpl: global.fetch.bind(global),
  readFile: fs.readFile,
};

function normalizeText(value = '') {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseGoogleXssiJson(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const sanitized = text.replace(/^\)\]\}',?\n/, '');
  return JSON.parse(sanitized);
}

function buildDescription(items = []) {
  const topTitles = items
    .map((item) => normalizeText(item?.title))
    .filter(Boolean)
    .slice(0, 3);

  if (!topTitles.length) {
    return '';
  }

  return `Top search themes: ${topTitles.join(' | ')}`;
}

function buildTrendDescription(keyword, series = []) {
  const latest = Number(series.at(-1)?.value || 0);
  const peak = Math.max(0, ...series.map((entry) => Number(entry?.value || 0)));
  return `Trending query: ${keyword} | latest interest ${latest} | peak interest ${peak}`;
}

function scoreFromSearchPayload(payload = {}, items = []) {
  const totalResults = toNumber(payload?.searchInformation?.totalResults, 0);
  const totalScore = totalResults > 0 ? Math.log10(totalResults + 1) * 22 : 0;
  const itemScore = items.length * 6;
  return clamp(Math.round(totalScore + itemScore), 0, 100);
}

function confidenceFromItems(items = []) {
  if (items.length >= 5) return 82;
  if (items.length >= 3) return 74;
  if (items.length >= 1) return 66;
  return 0;
}

async function queryGoogleCustomSearch(city, template, deps) {
  if (!env.googleSearchApiKey || !env.googleSearchEngineId) {
    return null;
  }

  const query = template.query(city);
  const url = new URL(GOOGLE_CUSTOM_SEARCH_URL);
  url.searchParams.set('key', env.googleSearchApiKey);
  url.searchParams.set('cx', env.googleSearchEngineId);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(clamp(env.googleSearchResultCount, 1, 10)));
  if (env.googleSearchLanguage) {
    url.searchParams.set('lr', env.googleSearchLanguage);
  }

  const response = await deps.fetchImpl(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Search API failed (${response.status}): ${text || 'unknown error'}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    return null;
  }

  return {
    id: `google-search:${city}:${template.key}`,
    city,
    source: 'google_custom_search',
    signalType: template.signalType,
    title: template.title(city),
    description: buildDescription(items),
    impactScore: scoreFromSearchPayload(payload, items),
    confidenceScore: confidenceFromItems(items),
    recommendedAction: template.recommendedAction,
    createdAt: new Date().toISOString(),
    details: items.slice(0, 5).map((item) => ({
      title: normalizeText(item?.title),
      link: normalizeText(item?.link),
      snippet: normalizeText(item?.snippet),
      displayLink: normalizeText(item?.displayLink),
    })),
  };
}

function normalizeTimeline(series = []) {
  return series
    .map((entry) => {
      const values = Array.isArray(entry?.value) ? entry.value : [];
      const value = toNumber(values[0], 0);
      return {
        time: normalizeText(entry?.formattedTime || entry?.time),
        value: clamp(Math.round(value), 0, 100),
      };
    })
    .filter((entry) => entry.time);
}

function scoreFromTrendSeries(series = []) {
  const values = series.map((entry) => Number(entry?.value || 0));
  const peak = Math.max(0, ...values);
  const latest = Number(values.at(-1) || 0);
  return clamp(Math.round(peak * 0.65 + latest * 0.35), 0, 100);
}

function confidenceFromTrendSeries(series = []) {
  const nonZero = series.filter((entry) => Number(entry?.value || 0) > 0).length;
  if (nonZero >= 6) return 82;
  if (nonZero >= 3) return 74;
  if (nonZero >= 1) return 66;
  return 0;
}

async function queryGoogleTrends(city, template, deps) {
  if (!env.enableGoogleTrendsLive) {
    return null;
  }

  const keyword = template.keyword(city);
  const reqPayload = {
    comparisonItem: [
      {
        keyword,
        geo: 'IN',
        time: env.googleTrendsTimeframe,
      },
    ],
    category: 0,
    property: '',
  };

  const exploreUrl = new URL(GOOGLE_TRENDS_EXPLORE_URL);
  exploreUrl.searchParams.set('hl', 'en-US');
  exploreUrl.searchParams.set('tz', '-330');
  exploreUrl.searchParams.set('req', JSON.stringify(reqPayload));

  const exploreResponse = await deps.fetchImpl(exploreUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
    },
  });

  if (!exploreResponse.ok) {
    const text = await exploreResponse.text().catch(() => '');
    throw new Error(`Google Trends explore failed (${exploreResponse.status}): ${text || 'unknown error'}`);
  }

  const explorePayload = parseGoogleXssiJson(await exploreResponse.text());
  const widgets = Array.isArray(explorePayload?.widgets) ? explorePayload.widgets : [];
  const timelineWidget = widgets.find((widget) => String(widget?.id || '').includes('TIMESERIES'));
  if (!timelineWidget?.token || !timelineWidget?.request) {
    return null;
  }

  const timelineUrl = new URL(GOOGLE_TRENDS_TIMESERIES_URL);
  timelineUrl.searchParams.set('hl', 'en-US');
  timelineUrl.searchParams.set('tz', '-330');
  timelineUrl.searchParams.set('req', JSON.stringify(timelineWidget.request));
  timelineUrl.searchParams.set('token', timelineWidget.token);

  const timelineResponse = await deps.fetchImpl(timelineUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
    },
  });

  if (!timelineResponse.ok) {
    const text = await timelineResponse.text().catch(() => '');
    throw new Error(`Google Trends timeseries failed (${timelineResponse.status}): ${text || 'unknown error'}`);
  }

  const timelinePayload = parseGoogleXssiJson(await timelineResponse.text());
  const series = normalizeTimeline(timelinePayload?.default?.timelineData || []);
  if (!series.length) {
    return null;
  }

  return {
    id: `google-trends-live:${city}:${template.key}`,
    city,
    source: 'google_trends_live',
    signalType: template.signalType,
    title: template.title(city),
    description: buildTrendDescription(keyword, series),
    impactScore: scoreFromTrendSeries(series),
    confidenceScore: confidenceFromTrendSeries(series),
    recommendedAction: template.recommendedAction,
    createdAt: new Date().toISOString(),
    details: series.slice(-7),
  };
}

async function loadGoogleTrendsSnapshot(city, deps) {
  if (!env.googleTrendsSnapshotFile) {
    return [];
  }

  try {
    const raw = await deps.readFile(env.googleTrendsSnapshotFile, 'utf8');
    const payload = JSON.parse(raw);
    const rows = Array.isArray(payload?.signals) ? payload.signals : Array.isArray(payload) ? payload : [];

    return rows
      .filter((entry) => normalizeText(entry?.city).toLowerCase() === normalizeText(city).toLowerCase())
      .map((entry, index) => ({
        id: normalizeText(entry?.id) || `google-trends:${city}:${index}`,
        city,
        source: 'google_trends',
        signalType: normalizeText(entry?.signalType || 'TOURISM_SPIKE').toUpperCase(),
        title: normalizeText(entry?.title || entry?.keyword || 'Search momentum rising'),
        description: normalizeText(entry?.description),
        impactScore: clamp(Math.round(toNumber(entry?.impactScore, entry?.interest || 0)), 0, 100),
        confidenceScore: clamp(Math.round(toNumber(entry?.confidenceScore, 70)), 0, 100),
        recommendedAction: normalizeText(
          entry?.recommendedAction || 'Review this search momentum and align city pricing response.',
        ),
        createdAt: normalizeText(entry?.createdAt) || new Date().toISOString(),
        details: Array.isArray(entry?.details) ? entry.details : [],
      }));
  } catch (error) {
    logger.warn('google_trends_snapshot_failed', {
      city,
      error: error?.message || String(error),
    });
    return [];
  }
}

export async function getLeadRadarExternalSignals({ city } = {}, deps = defaultDeps) {
  const safeCity = normalizeText(city);
  if (!safeCity) {
    return {
      city: '',
      signals: [],
      providers: {
        googleSearchEnabled: Boolean(env.googleSearchApiKey && env.googleSearchEngineId),
        googleTrendsEnabled: Boolean(env.googleTrendsSnapshotFile),
      },
    };
  }

  const signals = [];

  for (const template of QUERY_TEMPLATES) {
    try {
      const signal = await queryGoogleCustomSearch(safeCity, template, deps);
      if (signal) signals.push(signal);
    } catch (error) {
      logger.warn('google_custom_search_signal_failed', {
        city: safeCity,
        signalType: template.signalType,
        error: error?.message || String(error),
      });
    }
  }

  for (const template of TREND_TEMPLATES) {
    try {
      const signal = await queryGoogleTrends(safeCity, template, deps);
      if (signal) signals.push(signal);
    } catch (error) {
      logger.warn('google_trends_signal_failed', {
        city: safeCity,
        signalType: template.signalType,
        error: error?.message || String(error),
      });
    }
  }

  const trendSignals = await loadGoogleTrendsSnapshot(safeCity, deps);

  const dedupedSignals = new Map();
  for (const signal of [...signals, ...trendSignals]) {
    const key = `${signal.source}:${signal.signalType}:${signal.city}:${normalizeText(signal.title)}`;
    const existing = dedupedSignals.get(key);
    if (!existing || Number(signal.impactScore || 0) > Number(existing.impactScore || 0)) {
      dedupedSignals.set(key, signal);
    }
  }

  return {
    city: safeCity,
    signals: Array.from(dedupedSignals.values()).sort(
      (left, right) => Number(right?.impactScore || 0) - Number(left?.impactScore || 0),
    ),
    providers: {
      googleSearchEnabled: Boolean(env.googleSearchApiKey && env.googleSearchEngineId),
      googleTrendsEnabled: Boolean(env.enableGoogleTrendsLive || env.googleTrendsSnapshotFile),
    },
  };
}
