import { useEffect, useMemo, useState } from 'react';
import LeadTable from '../components/LeadTable.jsx';
import MarketOpportunityMap from '../components/MarketOpportunityMap.jsx';
import {
  getLeadRadarExternalSignals,
  getLeadRadarUpcomingEvents,
  getOpportunityFeed,
} from '../services/intelligenceApi.js';
import { getOpportunityScoreTone, normalizeOpportunityScore } from '../utils/leadRadarScore.js';
import hotelradarLogo from '../assets/hotelradar-logo.png';

const SUPPORTED_CITIES = ['Goa', 'Jaipur', 'Mumbai', 'Delhi', 'Gurugram'];
const SELECT_CITY = '';
const SAVED_LEADS_KEY = 'leadradar_saved_leads';
const DASHBOARD_WORKSPACE_KEY = 'dashboard_workspace_target';

const LEAD_SIGNAL_COPY = {
  WEDDING_DEMAND_ZONE: {
    title: 'Wedding momentum is building',
    description: 'Ceremony-led demand is building in this city and lifting short booking windows.',
    recommendedAction: 'Lift premium room pricing and prepare wedding bundle inventory.',
  },
  EVENT_DEMAND_ZONE: {
    title: 'Local event demand is building',
    description: 'Live events and venue activity are creating short-window city demand.',
    recommendedAction: 'Review event-zone pricing and tighten late discounting.',
  },
  CORPORATE_EVENT_CLUSTER: {
    title: 'Corporate event activity is rising',
    description: 'Business travel, exhibitions, and corporate gatherings are increasing weekday demand.',
    recommendedAction: 'Push weekday corporate packages and tighten negotiated inventory.',
  },
  AIRPORT_DEMAND: {
    title: 'Arrival pulse is strengthening',
    description: 'Flight-linked arrivals are pointing to fresh short-stay demand.',
    recommendedAction: 'Raise same-day and short-stay rates while monitoring pickup.',
  },
  TOURISM_SPIKE: {
    title: 'Travel demand is accelerating',
    description: 'Destination travel momentum is adding fresh leisure demand into the city.',
    recommendedAction: 'Protect public pricing and reduce unnecessary discounting.',
  },
  WEEKEND_COMPRESSION: {
    title: 'Weekend compression is forming',
    description: 'Weekend inventory pressure suggests near-term pricing movement.',
    recommendedAction: 'Lift weekend pricing and tighten minimum-stay rules where needed.',
  },
  PRICE_PRESSURE: {
    title: 'Rate pressure is visible',
    description: 'Visible pricing pressure suggests near-term market rate movement.',
    recommendedAction: 'Review comp-set movement and tighten pricing guardrails.',
  },
  OTA_DEPENDENCE: {
    title: 'OTA reliance is elevated',
    description: 'Distribution mix suggests dependence on OTA-driven demand.',
    recommendedAction: 'Push direct-channel offers and protect contribution margin.',
  },
  FESTIVAL_DEMAND: {
    title: 'Festival demand is building',
    description: 'Festival-linked demand is lifting city visibility and booking intent.',
    recommendedAction: 'Open premium inventory and review package-led pricing.',
  },
};

const CITY_SIGNAL_CATEGORIES = [
  {
    key: 'wedding-events',
    label: 'Wedding & Ceremony Demand',
    eyebrow: 'Ceremony Pulse',
    narrative: 'Weddings, ceremonies, festivals, and social demand are lifting short booking windows in this city.',
    matches: (signal) =>
      signal.signalType === 'WEDDING_DEMAND_ZONE' ||
      signal.signalType === 'EVENT_DEMAND_ZONE' ||
      signal.signalType === 'FESTIVAL_DEMAND' ||
      /wedding/i.test(signal.title) ||
      /wedding/i.test(signal.description),
  },
  {
    key: 'corporate-events',
    label: 'Corporate Events & Exhibitions',
    eyebrow: 'Business Pulse',
    narrative: 'Corporate gatherings, exhibitions, convention movement, and business travel are pushing premium demand clusters.',
    matches: (signal) =>
      signal.signalType === 'CORPORATE_EVENT_CLUSTER' ||
      /exhibition|expo|convention/i.test(signal.title) ||
      /exhibition|expo|convention/i.test(signal.description),
  },
  {
    key: 'compression',
    label: 'Compression & Price Pressure',
    eyebrow: 'Rate Pressure',
    narrative: 'Market compression and visible pricing pressure suggest near-term pricing movement and urgency.',
    matches: (signal) =>
      signal.signalType === 'WEEKEND_COMPRESSION' ||
      signal.signalType === 'PRICE_PRESSURE',
  },
  {
    key: 'travel-demand',
    label: 'Travel Demand',
    eyebrow: 'Arrival Pulse',
    narrative: 'Airport, tourism, and travel-linked signals are pointing to fresh arrival-driven demand.',
    matches: (signal) =>
      signal.signalType === 'AIRPORT_DEMAND' ||
      signal.signalType === 'TOURISM_SPIKE',
  },
  {
    key: 'ota-pressure',
    label: 'Distribution & OTA Pressure',
    eyebrow: 'OTA Pulse',
    narrative: 'Channel mix and OTA-heavy visibility suggest conversion and margin pressure in the city.',
    matches: (signal) => signal.signalType === 'OTA_DEPENDENCE',
  },
];

function toCsvCell(value) {
  const safeValue = value == null ? '' : String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function buildCsvFilename(city) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCity = city ? String(city).trim().toLowerCase() : 'all_markets';
  return `leadradar_city_intelligence_${safeCity}_${timestamp}.csv`;
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isFreshSignal(createdAt) {
  const parsed = normalizeDate(createdAt);
  if (!parsed) return false;
  const elapsed = Date.now() - parsed.getTime();
  return elapsed <= 24 * 60 * 60 * 1000;
}

function sortSignals(signals = []) {
  return [...signals].sort((left, right) => {
    const impactGap = Number(right?.impactScore || 0) - Number(left?.impactScore || 0);
    if (impactGap !== 0) return impactGap;
    return Number(right?.confidenceScore || 0) - Number(left?.confidenceScore || 0);
  });
}

function dedupeSignals(signals = []) {
  const byKey = new Map();

  for (const signal of sortSignals(signals)) {
    const key = [
      String(signal?.city || '').trim().toLowerCase(),
      String(signal?.signalType || '').trim().toUpperCase(),
      String(signal?.title || '').trim().toLowerCase(),
      String(signal?.recommendedAction || '').trim().toLowerCase(),
    ].join('::');

    if (!key || byKey.has(key)) continue;
    byKey.set(key, signal);
  }

  return Array.from(byKey.values());
}

function summarizeCategories(signals = []) {
  return CITY_SIGNAL_CATEGORIES.map((category) => {
    const matchedSignals = dedupeSignals(signals.filter(category.matches));
    const strongestSignals = matchedSignals.slice(0, 4);
    return {
      key: category.key,
      label: category.label,
      eyebrow: category.eyebrow,
      narrative: category.narrative,
      count: matchedSignals.length,
      topSignal: strongestSignals[0] || null,
      signals: strongestSignals,
    };
  });
}

function strongestSignalLabel(signal) {
  if (!signal) return 'No active signal';
  return signal.title || signal.signalType || 'Active signal';
}

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function enrichLeadSignal(signal = {}) {
  const signalType = String(signal.signalType || '').trim().toUpperCase();
  const copy = LEAD_SIGNAL_COPY[signalType] || {};

  return {
    ...signal,
    signalType,
    title: String(copy.title || signal.title || formatSignalLabel(signalType) || 'Active signal').trim(),
    description: String(copy.description || signal.description || '').trim(),
    recommendedAction: String(
      copy.recommendedAction || signal.recommendedAction || 'Review this city signal and adjust pricing response.',
    ).trim(),
  };
}

function formatFreshSignalText(count) {
  if (count <= 0) return 'No fresh movement';
  if (count === 1) return '1 fresh signal';
  return `${count} fresh signals`;
}

function formatSourceLabel(value = '') {
  const source = String(value || '').trim();
  if (!source) return 'Market Signal';
  if (source === 'google_custom_search') return 'Google Search';
  if (source === 'google_trends_live') return 'Google Trends Live';
  if (source === 'google_trends') return 'Google Trends';
  return source.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSourceTone(value = '') {
  const source = String(value || '').trim();
  if (source === 'google_custom_search') return 'leadRadarSource-google';
  if (source === 'google_trends_live' || source === 'google_trends') return 'leadRadarSource-trends';
  return 'leadRadarSource-market';
}

function formatSignalTime(value = '') {
  const parsed = normalizeDate(value);
  if (!parsed) return 'Latest';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

function collectSearchResults(signals = []) {
  const results = [];

  for (const signal of signals) {
    if (signal.source !== 'google_custom_search' || !Array.isArray(signal.details)) continue;
    for (const detail of signal.details) {
      results.push({
        signalType: signal.signalType,
        signalTitle: signal.title,
        title: String(detail?.title || '').trim(),
        link: String(detail?.link || '').trim(),
        snippet: String(detail?.snippet || '').trim(),
        displayLink: String(detail?.displayLink || '').trim(),
      });
    }
  }

  return results.filter((entry) => entry.title);
}

function collectNewsItems(results = []) {
  return (Array.isArray(results) ? results : []).slice(0, 6);
}

function formatEventDate(value = '') {
  const parsed = normalizeDate(value);
  if (!parsed) return 'TBD';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function collectTrendDrivers(signals = []) {
  return signals
    .filter((signal) => signal.source === 'google_trends_live' || signal.source === 'google_trends')
    .slice(0, 8);
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const safeValue = String(value || '').trim();
    if (safeValue) return safeValue;
  }
  return '';
}

function resolveSignalLocation(signal = {}) {
  const metadata = signal?.metadata && typeof signal.metadata === 'object' ? signal.metadata : {};
  const details = Array.isArray(signal?.details) ? signal.details : [];
  const firstDetail = details[0] && typeof details[0] === 'object' ? details[0] : {};

  return firstNonEmpty([
    metadata.address,
    metadata.venue,
    metadata.location,
    firstDetail.address,
    firstDetail.venue,
    firstDetail.location,
    signal.sourceRef,
  ]);
}

function normalizeTrendSeries(details = []) {
  return (Array.isArray(details) ? details : [])
    .slice(-7)
    .map((detail, index) => ({
      label: String(detail?.time || `T${index + 1}`).trim(),
      value: Number(detail?.value ?? 0),
    }))
    .filter((point) => Number.isFinite(point.value));
}

function buildSparklinePath(points = [], width = 320, height = 96, padding = 12) {
  if (!Array.isArray(points) || !points.length) return '';
  if (points.length === 1) {
    const y = height / 2;
    return `M ${padding} ${y} L ${width - padding} ${y}`;
  }

  const values = points.map((point) => Number(point.value || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  if (max === min) {
    const y = height / 2;
    return points
      .map((point, index) => {
        const x = padding + (plotWidth * index) / Math.max(1, points.length - 1);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }

  const range = max - min;

  return points
    .map((point, index) => {
      const x = padding + (plotWidth * index) / (points.length - 1);
      const y = height - padding - ((Number(point.value || 0) - min) / range) * plotHeight;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function isFlatTrendSeries(points = []) {
  if (!Array.isArray(points) || !points.length) return false;
  return points.every((point) => Number(point?.value || 0) === Number(points[0]?.value || 0));
}

function buildSparklinePoints(points = [], width = 320, height = 96, padding = 12) {
  if (!Array.isArray(points) || !points.length) return [];

  const values = points.map((point) => Number(point.value || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  if (max === min) {
    const y = height / 2;
    return points.map((point, index) => ({
      ...point,
      x: padding + (plotWidth * index) / Math.max(1, points.length - 1),
      y,
    }));
  }

  const range = max - min;
  return points.map((point, index) => ({
    ...point,
    x: padding + (plotWidth * index) / Math.max(1, points.length - 1),
    y: height - padding - ((Number(point.value || 0) - min) / range) * plotHeight,
  }));
}

function trendSeriesStats(points = []) {
  const values = (Array.isArray(points) ? points : []).map((point) => Number(point?.value || 0));
  const peak = Math.max(0, ...values);
  const latest = Number(values.at(-1) || 0);
  const nonZeroCount = values.filter((value) => value > 0).length;

  return {
    peak,
    latest,
    nonZeroCount,
    isFlat: values.length > 0 && values.every((value) => value === values[0]),
  };
}

function isRelevantTrendSignal(signal = {}) {
  const points = normalizeTrendSeries(signal.details);
  const stats = trendSeriesStats(points);
  const title = String(signal.title || '').toLowerCase();
  const hotelFocused =
    /hotel search|business hotel|wedding hotel|event search|arrival pulse|travel demand|corporate event/i.test(title);

  if (stats.peak >= 40 || stats.latest >= 25) return true;
  if (hotelFocused && stats.nonZeroCount >= 2) return true;
  if (!stats.isFlat && stats.nonZeroCount >= 1) return true;
  return false;
}

function buildThemeTag(value = '') {
  const normalized = String(value || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');

  return normalized ? `#${normalized}` : '';
}

function collectTrendingThemes({ searchResults = [], trendDrivers = [], eventWatchSignals = [] }) {
  const themes = new Map();

  for (const signal of eventWatchSignals) {
    const tag = buildThemeTag(signal.title || signal.signalType);
    if (!tag || themes.has(tag)) continue;
    themes.set(tag, {
      tag,
      label: signal.title || formatSignalLabel(signal.signalType),
      source: formatSourceLabel(signal.source),
    });
  }

  for (const result of searchResults) {
    const tag = buildThemeTag(result.title || result.signalType);
    if (!tag || themes.has(tag)) continue;
    themes.set(tag, {
      tag,
      label: result.title || formatSignalLabel(result.signalType),
      source: result.displayLink || 'Search',
    });
  }

  for (const signal of trendDrivers) {
    const tag = buildThemeTag(signal.title || signal.signalType);
    if (!tag || themes.has(tag)) continue;
    themes.set(tag, {
      tag,
      label: signal.title || formatSignalLabel(signal.signalType),
      source: formatSourceLabel(signal.source),
    });
  }

  return Array.from(themes.values()).slice(0, 6);
}

function tagAccentClass(index = 0) {
  const accents = ['leadRadarTagCard-accentA', 'leadRadarTagCard-accentB', 'leadRadarTagCard-accentC'];
  return accents[index % accents.length];
}

function newsAccentClass(index = 0) {
  const accents = ['leadRadarTagCard-newsA', 'leadRadarTagCard-newsB', 'leadRadarTagCard-newsC'];
  return accents[index % accents.length];
}

function eventAccentClass(index = 0) {
  const accents = ['leadRadarTagCard-eventA', 'leadRadarTagCard-eventB', 'leadRadarTagCard-eventC'];
  return accents[index % accents.length];
}

function getPrimaryOpportunity(hotel) {
  if (!hotel?.opportunities?.length) {
    return {
      opportunity: 'No clear opportunity',
      action: 'No action suggested',
    };
  }

  return {
    opportunity: hotel.opportunities[0]?.opportunity || 'No clear opportunity',
    action: hotel.opportunities[0]?.action || 'No action suggested',
  };
}

function buildOpportunityRows(opportunities = []) {
  const grouped = new Map();

  for (const entry of sortSignals(opportunities)) {
    const groupKey = String(entry.hotelId || `${entry.hotelName || entry.title}-${entry.city}`).trim();
    if (!groupKey) continue;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        hotelId: entry.hotelId || groupKey,
        hotelName: entry.hotelName || 'Tracked Property',
        city: entry.city || '',
        rawOpportunityScore: 0,
        opportunityScore: 0,
        latitude: Number.isFinite(Number(entry.latitude)) ? Number(entry.latitude) : null,
        longitude: Number.isFinite(Number(entry.longitude)) ? Number(entry.longitude) : null,
        signals: [],
        opportunities: [],
      });
    }

    const bucket = grouped.get(groupKey);
    bucket.rawOpportunityScore = Math.max(
      Number(bucket.rawOpportunityScore || 0),
      Number(entry.rawScore || entry.impactScore || 0),
    );
    bucket.opportunityScore = normalizeOpportunityScore(bucket.rawOpportunityScore);
    if (bucket.latitude == null && Number.isFinite(Number(entry.latitude))) {
      bucket.latitude = Number(entry.latitude);
    }
    if (bucket.longitude == null && Number.isFinite(Number(entry.longitude))) {
      bucket.longitude = Number(entry.longitude);
    }

    if (entry.signalType && !bucket.signals.includes(entry.signalType)) {
      bucket.signals.push(entry.signalType);
    }

    bucket.opportunities.push({
      opportunity: entry.title || 'Market opportunity',
      action: entry.recommendedAction || 'Review this signal and pricing response.',
      signalType: entry.signalType || '',
      confidenceScore: Number(entry.confidenceScore || 0),
      impactScore: Number(entry.impactScore || 0),
      createdAt: entry.createdAt || '',
    });
  }

  return Array.from(grouped.values()).sort(
    (left, right) => Number(right.rawOpportunityScore || 0) - Number(left.rawOpportunityScore || 0),
  );
}

export default function LeadRadarPage({ session, onLogout, onNavigate }) {
  const [selectedCity, setSelectedCity] = useState(SELECT_CITY);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [savedLeads, setSavedLeads] = useState([]);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signals, setSignals] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [externalSignalProviders, setExternalSignalProviders] = useState({
    googleSearchEnabled: false,
    googleTrendsEnabled: false,
  });
  const [activeSignalFilter, setActiveSignalFilter] = useState('');
  const [opportunityError, setOpportunityError] = useState('');
  const [signalError, setSignalError] = useState('');
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 1024;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const selectedCitySignals = useMemo(() => {
    const city = String(selectedCity || '').trim();
    return dedupeSignals(
      signals.filter(
        (signal) =>
          (!city || signal.city === city) &&
          String(signal.source || '').trim() !== 'market_signal_engine',
      ),
    );
  }, [selectedCity, signals]);

  const signalCategories = useMemo(
    () => summarizeCategories(selectedCitySignals),
    [selectedCitySignals],
  );

  const freshSignalCount = useMemo(
    () => selectedCitySignals.filter((signal) => isFreshSignal(signal.createdAt)).length,
    [selectedCitySignals],
  );
  const sourceSummary = useMemo(() => {
    const counts = new Map();
    for (const signal of selectedCitySignals) {
      const source = formatSourceLabel(signal.source);
      counts.set(source, Number(counts.get(source) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [selectedCitySignals]);

  const strongestSignal = selectedCitySignals[0] || null;
  const searchResults = useMemo(
    () => collectSearchResults(selectedCitySignals).slice(0, 20),
    [selectedCitySignals],
  );
  const newsItems = useMemo(
    () => collectNewsItems(searchResults),
    [searchResults],
  );
  const trendDrivers = useMemo(
    () => dedupeSignals(collectTrendDrivers(selectedCitySignals)).filter(isRelevantTrendSignal).slice(0, 6),
    [selectedCitySignals],
  );
  const hotelSearchTrendDrivers = useMemo(
    () =>
      trendDrivers.filter((signal) =>
        /hotel search|business hotel|wedding hotel/i.test(String(signal.title || '')),
      ),
    [trendDrivers],
  );
  const eventWatchSignals = useMemo(
    () =>
      dedupeSignals(
        selectedCitySignals.filter((signal) =>
          ['WEDDING_DEMAND_ZONE', 'EVENT_DEMAND_ZONE', 'CORPORATE_EVENT_CLUSTER', 'FESTIVAL_DEMAND'].includes(
            signal.signalType,
          ),
        ),
      ),
    [selectedCitySignals],
  );
  const otaPressureSignals = useMemo(
    () =>
      dedupeSignals(selectedCitySignals.filter((signal) =>
        ['OTA_DEPENDENCE', 'PRICE_PRESSURE', 'WEEKEND_COMPRESSION'].includes(signal.signalType),
      )),
    [selectedCitySignals],
  );
  const tourismPulseSignals = useMemo(
    () =>
      dedupeSignals(selectedCitySignals.filter((signal) =>
        ['TOURISM_SPIKE', 'AIRPORT_DEMAND'].includes(signal.signalType),
      )),
    [selectedCitySignals],
  );
  const liveDemandDrivers = useMemo(
    () =>
      dedupeSignals([
        ...eventWatchSignals,
        ...tourismPulseSignals,
        ...otaPressureSignals,
      ]).slice(0, 5),
    [eventWatchSignals, tourismPulseSignals, otaPressureSignals],
  );
  const trendingThemes = useMemo(
    () => collectTrendingThemes({ searchResults, trendDrivers, eventWatchSignals }),
    [searchResults, trendDrivers, eventWatchSignals],
  );
  const selectedCityOpportunities = useMemo(() => {
    const city = String(selectedCity || '').trim();
    return opportunities.filter((entry) => !city || entry.city === city);
  }, [opportunities, selectedCity]);

  const activeHotels = useMemo(
    () => buildOpportunityRows(selectedCityOpportunities),
    [selectedCityOpportunities],
  );
  const filteredHotels = useMemo(() => {
    if (!activeSignalFilter) return activeHotels;
    return activeHotels.filter((hotel) => {
      const hotelSignals = Array.isArray(hotel?.signals) ? hotel.signals : [];
      return hotelSignals.includes(activeSignalFilter);
    });
  }, [activeHotels, activeSignalFilter]);
  const visibleSignalCategories = useMemo(
    () => signalCategories.filter((category) => category.signals.length > 0),
    [signalCategories],
  );
  const hasSignalMap = useMemo(
    () => filteredHotels.some((hotel) => Number.isFinite(Number(hotel.latitude)) && Number.isFinite(Number(hotel.longitude))),
    [filteredHotels],
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [selectedCity, activeSignalFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function syncViewport() {
      setIsCompactViewport(window.innerWidth <= 1024);
    }

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      setSignalsLoading(true);
      setSignalError('');
      try {
        const externalPayload = selectedCity
          ? await getLeadRadarExternalSignals(session.token, selectedCity)
          : { signals: [], providers: {} };
        if (!active) return;
        const externalSignals = Array.isArray(externalPayload?.signals)
          ? externalPayload.signals.map(enrichLeadSignal)
          : [];
        setSignals(externalSignals);
        setExternalSignalProviders({
          googleSearchEnabled: Boolean(externalPayload?.providers?.googleSearchEnabled),
          googleTrendsEnabled: Boolean(externalPayload?.providers?.googleTrendsEnabled),
        });
      } catch (loadError) {
        if (!active) return;
        setSignals([]);
        setExternalSignalProviders({
          googleSearchEnabled: false,
          googleTrendsEnabled: false,
        });
        setSignalError(loadError.message || 'Unable to load city signals.');
      } finally {
        if (active) setSignalsLoading(false);
      }
    }

    loadSignals();
    return () => {
      active = false;
    };
  }, [selectedCity, session.token]);

  useEffect(() => {
    if (!selectedCity) {
      setOpportunities([]);
      setUpcomingEvents([]);
      setSelectedHotel(null);
      setActiveSignalFilter('');
      return undefined;
    }

    let active = true;

    async function loadCityOpportunities() {
      setLoadingOpportunities(true);
      setOpportunityError('');
      try {
        const payload = await getOpportunityFeed(session.token, selectedCity);
        if (!active) return;
        const nextOpportunities = Array.isArray(payload) ? payload : payload?.opportunities || [];
        setOpportunities(nextOpportunities);
      } catch (loadError) {
        if (!active) return;
        setOpportunities([]);
        setSelectedHotel(null);
        setOpportunityError(loadError.message || 'Unable to load city opportunity detail.');
      } finally {
        if (active) setLoadingOpportunities(false);
      }
    }

    loadCityOpportunities();
    return () => {
      active = false;
    };
  }, [selectedCity, session.token]);

  useEffect(() => {
    if (!selectedCity) {
      setUpcomingEvents([]);
      return undefined;
    }

    let active = true;

    async function loadUpcomingEvents() {
      try {
        const payload = await getLeadRadarUpcomingEvents(session.token, selectedCity, 15);
        if (!active) return;
        setUpcomingEvents(Array.isArray(payload?.events) ? payload.events : []);
      } catch {
        if (!active) return;
        setUpcomingEvents([]);
      }
    }

    loadUpcomingEvents();
    return () => {
      active = false;
    };
  }, [selectedCity, session.token]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_LEADS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedLeads(parsed.filter((item) => item && typeof item === 'object'));
      }
    } catch {
      setSavedLeads([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedHotel?.hotelId) return;
    const stillVisible = filteredHotels.some((hotel) => hotel.hotelId === selectedHotel.hotelId);
    if (!stillVisible) {
      setSelectedHotel(filteredHotels[0] || null);
    }
  }, [filteredHotels, selectedHotel]);

  useEffect(() => {
    if (selectedHotel?.hotelId || !filteredHotels.length) return;
    setSelectedHotel(filteredHotels[0]);
  }, [filteredHotels, selectedHotel]);

  function handleMarketChange(event) {
    const nextCity = String(event.target.value || SELECT_CITY).trim();
    setSelectedCity(nextCity);
    setActiveSignalFilter('');
    setOpportunityError('');
    setSignalError('');
  }

  function persistSavedLeads(nextSavedLeads) {
    setSavedLeads(nextSavedLeads);
    try {
      localStorage.setItem(SAVED_LEADS_KEY, JSON.stringify(nextSavedLeads));
    } catch {
      // ignore storage failures
    }
  }

  function handleToggleSavedLead(hotel) {
    if (!hotel?.hotelId) return;

    const leadRecord = {
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName || hotel.hotelId,
      city: hotel.city || '',
      opportunityScore: Number(hotel.opportunityScore || hotel.leadScore || 0),
      opportunity: hotel.opportunities?.[0]?.opportunity || '',
      action: hotel.opportunities?.[0]?.action || '',
      savedAt: new Date().toISOString(),
    };

    const isSaved = savedLeads.some((item) => item.hotelId === hotel.hotelId);
    const nextSavedLeads = isSaved
      ? savedLeads.filter((item) => item.hotelId !== hotel.hotelId)
      : [leadRecord, ...savedLeads.filter((item) => item.hotelId !== hotel.hotelId)];

    persistSavedLeads(nextSavedLeads);
  }

  function handleExportCsv() {
    if (!selectedCitySignals.length) return;

    const header = ['Signal Type', 'Title', 'City', 'Impact Score', 'Confidence Score', 'Recommended Action'];
    const rows = selectedCitySignals.map((signal) => [
      signal.signalType,
      signal.title,
      signal.city,
      Number(signal.impactScore || 0),
      Number(signal.confidenceScore || 0),
      signal.recommendedAction || '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => toCsvCell(value)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildCsvFilename(selectedCity);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function openDashboardWorkspace(workspace) {
    try {
      localStorage.setItem(DASHBOARD_WORKSPACE_KEY, workspace);
    } catch {
      // ignore storage failures and still navigate
    }
    onNavigate('/');
  }

  function renderSidebarFooter(className = '') {
    return (
      <footer className={className}>
        <p className="metaLabel">© 2026 HotelRADAR</p>
        <div className="sidebarLegalLinks">
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/privacy')}>Privacy</button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/terms')}>Terms</button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/disclaimer')}>Disclaimer</button>
        </div>
        <p className="metaLabel sidebarSupport">
          Support : support@hotelradar.in | Mobile No. +91-9828981000
        </p>
      </footer>
    );
  }

  function renderNavigationButtons() {
    return (
      <>
        <button type="button" className="premiumNavItem" onClick={() => onNavigate('/admin')}>Admin</button>
        <button type="button" className="premiumNavItem" onClick={() => onNavigate('/research')}>Property Research</button>
        <button type="button" className="premiumNavItem" onClick={() => onNavigate('/')}>HotelRADAR</button>
        <button type="button" className="premiumNavItem active">LeadRADAR</button>
        <button type="button" className="premiumNavItem" onClick={() => openDashboardWorkspace('admin-control')}>
          Super Admin Control
        </button>
        <button type="button" className="premiumNavItem" onClick={() => openDashboardWorkspace('system-updates')}>
          System Updates
        </button>
        <button type="button" className="premiumNavItem" onClick={onLogout}>Logout</button>
      </>
    );
  }

  return (
    <main className="premiumShell">
      {!isCompactViewport ? (
        <aside className="premiumSidebar" aria-label="Primary navigation">
          <div className="premiumBrand">
            <img className="premiumBrandLogo" src={hotelradarLogo} alt="HotelRADAR AI Agency Goa" width="740" height="158" />
            <p>Revenue Intelligence Cockpit</p>
          </div>
          <nav className="premiumNav">{renderNavigationButtons()}</nav>
          {renderSidebarFooter('premiumSidebarFooter')}
        </aside>
      ) : null}

      <section className="premiumMain">
        <header className="premiumTopbar">
          {isCompactViewport ? (
            <div className="premiumMobileMenuBar">
              <div className="premiumMobileBrand" aria-label="HotelRADAR beta">
                <img className="premiumMobileBrandLogo" src={hotelradarLogo} alt="HotelRADAR AI Agency Goa" width="740" height="158" />
              </div>
              <button
                type="button"
                className="premiumMobileMenuButton"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-expanded={mobileNavOpen}
                aria-controls="premium-mobile-nav"
                aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              >
                <span className="premiumMobileMenuIcon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          ) : null}

          <div className="premiumTopbarIntro">
            <span className="workspaceEyebrow">City Intelligence Workspace</span>
            <h2>LeadRADAR</h2>
            <p className="metaLabel headerScope">What is happening in your city, what signals are new, and where the commercial pressure is building.</p>
          </div>
        </header>

        {isCompactViewport && mobileNavOpen ? (
          <section id="premium-mobile-nav" className="premiumMobileNavPanel" aria-label="Mobile navigation menu">
            <div className="premiumMobileNav">{renderNavigationButtons()}</div>
          </section>
        ) : null}

        <div className="premiumContent leadRadarLayout">
          <section className="panel leadRadarCitySelectorPanel">
            <header className="panelHeader">
              <div className="gridMetaBlock">
                <span className="workspaceEyebrow">Market Input</span>
                <h3>Choose City</h3>
                <p className="metaLabel">Start with a city like Mumbai and review the latest city demand signals.</p>
              </div>
            </header>
            <div className="controls">
              <label className="controlLabel" htmlFor="lead-radar-market-select">City</label>
              <select id="lead-radar-market-select" value={selectedCity} onChange={handleMarketChange}>
                <option value={SELECT_CITY}>Select city</option>
                {SUPPORTED_CITIES.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </section>

          {!selectedCity ? (
            <section className="panel">
              <p className="metaLabel">Select a city to view city intelligence and live demand signals.</p>
            </section>
          ) : (
            <>
              <section className="panel leadRadarHeroPanel">
                <div className="leadRadarHeroSummary">
                  <div className="gridMetaBlock">
                    <span className="workspaceEyebrow">{selectedCity}</span>
                    <h3>City Overview</h3>
                    <p className="metaLabel">
                      LeadRADAR gives revenue managers a live city view of demand drivers, travel momentum, OTA pressure, and upcoming commercial shifts in {selectedCity}.
                    </p>
                  </div>
                  <div className="leadRadarHeroHighlight">
                    <span className={`leadScoreBadge ${getOpportunityScoreTone(strongestSignal?.impactScore)}`}>
                      {normalizeOpportunityScore(strongestSignal?.impactScore)}
                    </span>
                    <strong>{strongestSignalLabel(strongestSignal)}</strong>
                    <p>{strongestSignal?.recommendedAction || 'Watch the latest city movement and adjust pricing response.'}</p>
                  </div>
                </div>

                {tourismPulseSignals.length ? (
                  <section className="leadRadarLiveDriversPanel" aria-label="Live demand drivers">
                    <header className="panelHeader">
                      <div className="gridMetaBlock">
                        <span className="workspaceEyebrow">What Is Happening Now</span>
                        <h3>Arrival Pulse</h3>
                        <p className="metaLabel">Travel and arrival movement that is currently visible and usable.</p>
                      </div>
                    </header>
                    <div className="leadRadarLiveDriverGrid">
                      {tourismPulseSignals.slice(0, 1).map((signal, index) => (
                        <article
                          key={`${signal.id || signal.signalType}-${signal.createdAt || index}-driver`}
                          className="leadRadarLiveDriverCard"
                        >
                          <div className="leadRadarInsightHeader">
                            <div>
                              <span className={`leadRadarSourceChip ${getSourceTone(signal.source)}`}>
                                {formatSourceLabel(signal.source)}
                              </span>
                              <h4>{signal.title}</h4>
                            </div>
                            <span className={`leadScoreBadge ${getOpportunityScoreTone(signal.impactScore)}`}>
                              {Math.round(Number(signal.impactScore || 0))}
                            </span>
                          </div>
                          <p className="leadRadarInsightText">
                            {signal.description || 'Demand movement is building in this city.'}
                          </p>
                          {resolveSignalLocation(signal) ? (
                            <p className="leadRadarSignalLocation">
                              Venue / Address: {resolveSignalLocation(signal)}
                            </p>
                          ) : null}
                          <div className="leadRadarInsightMeta">
                            <span>{formatSignalLabel(signal.signalType)}</span>
                            <span>{Math.round(Number(signal.confidenceScore || 0))}% confidence</span>
                            <span>{formatSignalTime(signal.createdAt)}</span>
                          </div>
                          <p className="leadRadarDriverAction">{signal.recommendedAction}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {newsItems.length ? (
                  <section className="leadRadarTrendingPanel" aria-label="Latest city news">
                    <header className="panelHeader">
                      <div className="gridMetaBlock">
                        <span className="workspaceEyebrow">Latest City News</span>
                        <h3>News & Search Highlights</h3>
                        <p className="metaLabel">Current public web signals influencing demand and traveler attention in {selectedCity}.</p>
                      </div>
                    </header>
                    <div className="leadRadarTagRow">
                      {newsItems.map((entry, index) => (
                        <article key={`${entry.link || entry.title}-${index}`} className={`leadRadarTagCard ${newsAccentClass(index)}`}>
                          <strong>{entry.displayLink || 'Web Source'}</strong>
                          <span>{entry.title}</span>
                          <small>{entry.snippet || 'Latest city visibility signal'}</small>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {upcomingEvents.length ? (
                  <section className="leadRadarTrendingPanel" aria-label="Latest events next 15 days">
                    <header className="panelHeader">
                      <div className="gridMetaBlock">
                        <span className="workspaceEyebrow">Latest Events Next 15 Days</span>
                        <h3>Upcoming City Events</h3>
                        <p className="metaLabel">Confirmed physical events from the city event pipeline that may influence hotel demand.</p>
                      </div>
                    </header>
                    <div className="leadRadarTagRow">
                      {upcomingEvents.slice(0, 6).map((event, index) => (
                        <article key={`${event.id}-${index}`} className={`leadRadarTagCard ${eventAccentClass(index)}`}>
                          <strong>{formatEventDate(event.startDate)}</strong>
                          <span>{event.eventName}</span>
                          <small>
                            {event.venue ? `${event.venue} | ` : ''}
                            {event.source || 'Event pipeline'}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="leadRadarSummaryGrid" aria-label="LeadRADAR city summary">
                  <article className="panel leadRadarSummaryCard">
                    <strong>{signalsLoading ? '...' : tourismPulseSignals.length}</strong>
                    <span>Arrival signals</span>
                  </article>
                  <article className="panel leadRadarSummaryCard">
                    <strong>{newsItems.length}</strong>
                    <span>News items</span>
                  </article>
                  <article className="panel leadRadarSummaryCard">
                    <strong>{upcomingEvents.length}</strong>
                    <span>Events next 15 days</span>
                  </article>
                  <article className="panel leadRadarSummaryCard">
                    <strong>{signalsLoading ? '...' : freshSignalCount}</strong>
                    <span>Fresh updates</span>
                  </article>
                </div>
              </section>

              {signalError ? (
                <section className="panel">
                  <p className="errorText">{signalError}</p>
                </section>
              ) : null}
              {opportunityError ? (
                <section className="panel">
                  <p className="errorText">{opportunityError}</p>
                </section>
              ) : null}

              <details className="collapsiblePanel leadRadarAccordion" open>
                <summary>What Changed in {selectedCity}</summary>
                <div className="leadRadarAccordionBody">
                  <section className="panel leadRadarPulsePanel">
                    <div className="leadRadarPulseStat">
                      <span className="workspaceEyebrow">Fresh Movement</span>
                      <strong>{formatFreshSignalText(freshSignalCount)}</strong>
                    </div>
                    <div className="leadRadarPulseStat">
                      <span className="workspaceEyebrow">Strongest Driver</span>
                      <strong>{strongestSignalLabel(strongestSignal)}</strong>
                    </div>
                    <div className="leadRadarPulseStat">
                      <span className="workspaceEyebrow">Top Action</span>
                      <strong>{strongestSignal?.recommendedAction || 'Watch city movement closely.'}</strong>
                    </div>
                  </section>
                  {sourceSummary.length ? null : null}
                </div>
              </details>
            </>
          )}
        </div>
        {isCompactViewport ? renderSidebarFooter('premiumMobileFooter') : null}
      </section>
    </main>
  );
}
