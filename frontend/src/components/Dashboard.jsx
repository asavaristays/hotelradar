import { useMemo } from 'react';

const REVENUE_HORIZON_DAYS = 15;

function LoadingSkeleton() {
  return (
    <section className="gmDashboard" aria-label="Loading dashboard">
      <div className="gmPanel gmSkeleton">
        <div />
        <div />
        <div />
      </div>
    </section>
  );
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value) {
  const parsed = numericOrNull(value);
  return parsed !== null && parsed > 0;
}

function formatCurrency(value) {
  const amount = numericOrNull(value);
  if (amount === null || amount <= 0) return 'Not captured';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value, options = {}) {
  if (!value) return 'Not selected';
  const raw = String(value).slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', {
    weekday: options.weekday || 'short',
    day: 'numeric',
    month: 'short',
    year: options.year || undefined,
    timeZone: 'UTC',
  });
}

function formatTimestamp(value) {
  if (!value) return 'Not captured';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not captured';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeComparableName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function approvedCompSet(dashboard = {}) {
  const raw =
    dashboard?.approvedCompSet ||
    dashboard?.hotel?.approvedCompSet ||
    dashboard?.marketContext?.approvedCompSet ||
    [];
  return Array.isArray(raw) ? raw.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function matchesApprovedCompSetName(name = '', approvedKeys = new Set()) {
  const rowKey = normalizeComparableName(name);
  if (!rowKey) return false;
  if (approvedKeys.has(rowKey)) return true;
  return Array.from(approvedKeys).some((approvedKey) => (
    approvedKey.length >= 6 &&
    (rowKey.includes(approvedKey) || approvedKey.includes(rowKey))
  ));
}

function currentIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateString, days) {
  const parsed = new Date(`${dateString}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isBetween(date, start, end) {
  return date >= start && date <= end;
}

function buildFreshStartDates(dashboard = {}) {
  const selectedDate = String(dashboard?.marketContext?.checkinDate || currentIndiaDate()).slice(0, 10);
  const importantDates = Array.isArray(dashboard?.marketContext?.importantDates)
    ? dashboard.marketContext.importantDates
    : [];
  const horizonDates = Array.from({ length: REVENUE_HORIZON_DAYS }, (_, index) => addDays(selectedDate, index));

  const knownAugustDates = [
    {
      date: '2026-08-08',
      endDate: '2026-08-10',
      label: 'Weekend demand watch',
      pressure: 'Watch',
      driver: 'Weekend leisure demand',
      tone: 'watch',
    },
    {
      date: '2026-08-15',
      endDate: '2026-08-17',
      label: 'Independence Day long weekend',
      pressure: 'High',
      driver: 'National holiday + leisure compression',
      tone: 'high',
    },
    {
      date: '2026-08-28',
      endDate: '2026-08-30',
      label: 'Rakhi family travel window',
      pressure: 'Watch',
      driver: 'Family travel and weekend overlap',
      tone: 'watch',
    },
  ];

  const fromBackend = importantDates.map((entry) => ({
    date: String(entry.date || '').slice(0, 10),
    endDate: String(entry.endDate || entry.date || '').slice(0, 10),
    label: entry.label || entry.name || 'Market date',
    pressure: entry.confidence === 'high' ? 'High' : 'Watch',
    driver: entry.type || entry.source || 'Market signal',
    tone: entry.confidence === 'high' ? 'high' : 'watch',
  })).filter((entry) => entry.date);

  const combined = [...fromBackend, ...knownAugustDates];
  const dateMap = new Map(horizonDates.map((date, index) => [
    date,
    {
      date,
      endDate: date,
      label: index === 0 ? 'Selected stay date' : 'Stay date proof pending',
      pressure: 'Proof pending',
      driver: 'Awaiting official, OTA and competitor rate evidence',
      tone: 'missing',
    },
  ]));

  combined.forEach((entry) => {
    horizonDates.forEach((date) => {
      if (!isBetween(date, entry.date, entry.endDate || entry.date)) return;
      const existing = dateMap.get(date);
      const shouldReplace =
        !existing ||
        existing.tone === 'missing' ||
        entry.tone === 'high' ||
        (entry.tone === 'watch' && existing.tone !== 'high');
      if (!shouldReplace) return;
      dateMap.set(date, {
        ...entry,
        date,
        endDate: entry.endDate || entry.date,
      });
    });
  });

  return horizonDates.map((date) => dateMap.get(date));
}

function buildRevenueDates(dashboard = {}, model = null) {
  const enterpriseDates = Array.isArray(model?.enterpriseBrief?.next15Days)
    ? model.enterpriseBrief.next15Days
    : [];
  if (enterpriseDates.length) {
    return enterpriseDates.map((date) => ({
      date: date.date,
      endDate: date.date,
      label: date.primarySignal || date.pressure || 'Stay date',
      pressure: date.pressure || 'Proof pending',
      driver: date.driver || date.recommendedAction || 'Revenue Intelligence',
      tone: date.tone || 'missing',
      tariff: numericOrNull(date.tariff),
      tariffLabel: date.tariffLabel || formatCurrency(date.tariff),
      marketTariff: numericOrNull(date.marketTariff),
      marketTariffLabel: date.marketTariffLabel || formatCurrency(date.marketTariff),
      tariffEvidenceRows: numericOrNull(date.tariffEvidenceRows) || 0,
      recommendedAction: date.recommendedAction || '',
    }));
  }
  return buildFreshStartDates(dashboard);
}

function signalStatus({ ready, supporting }) {
  if (ready) return 'ready';
  if (supporting) return 'supporting';
  return 'missing';
}

function statusCopy(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'supporting') return 'Supporting';
  if (status === 'stale') return 'Stale';
  return 'Missing';
}

function realtimeRows(dashboard = {}) {
  return Array.isArray(dashboard?.realtimeSignals?.rows) ? dashboard.realtimeSignals.rows : [];
}

function realtimeCount(dashboard = {}, key) {
  const fromSummary = dashboard?.realtimeSignals?.counts?.[key];
  if (Number.isFinite(Number(fromSummary))) return Number(fromSummary);
  return 0;
}

function importantDatesByType(dashboard = {}, typePattern) {
  const dates = Array.isArray(dashboard?.marketContext?.importantDates)
    ? dashboard.marketContext.importantDates
    : [];
  return dates.filter((entry) => typePattern.test(`${entry?.type || ''} ${entry?.label || ''}`.toLowerCase()));
}

function signalRowsByType(dashboard = {}, typePattern) {
  return realtimeRows(dashboard).filter((row) =>
    typePattern.test(`${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''} ${row?.metadata?.eventType || ''} ${row?.metadata?.category || ''}`.toLowerCase()));
}

function median(values = []) {
  const sorted = values
    .map((value) => numericOrNull(value))
    .filter((value) => value !== null && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildCompetitorAnalysis(dashboard = {}, selectedDate = '') {
  const stayDate = String(selectedDate || dashboard?.marketContext?.checkinDate || '').slice(0, 10);
  const approved = approvedCompSet(dashboard);
  const approvedKeys = new Set(approved.map(normalizeComparableName).filter(Boolean));
  const rows = realtimeRows(dashboard)
    .filter((row) => String(row?.checkinDate || '').slice(0, 10) === stayDate)
    .filter((row) =>
      row?.sourceType === 'competitor' ||
      row?.signalType === 'competitor_rate' ||
      /competitor/.test(`${row?.sourceType || ''} ${row?.signalType || ''}`.toLowerCase()))
    .filter((row) => !/official panel|official rate|own rate|direct rate/i.test(`${row?.sourceName || ''} ${row?.valueText || ''}`))
    .filter((row) => matchesApprovedCompSetName(row?.sourceName || row?.metadata?.competitorName || '', approvedKeys))
    .map((row, index) => {
      const rate = numericOrNull(row?.valueNumeric);
      if (rate === null || rate <= 0) return null;
      return {
        key: `${row?.sourceName || 'competitor'}-${row?.checkinDate || stayDate}-${rate}-${index}`,
        name: String(row?.sourceName || row?.metadata?.competitorName || 'Competitor').trim() || 'Competitor',
        rate,
        currency: row?.currency || 'INR',
        proofUrl: row?.proofUrl || '',
        confidenceScore: numericOrNull(row?.confidenceScore),
        observedAt: row?.observedAt || row?.capturedAt || '',
        basis: row?.metadata?.basis || row?.metadata?.rate_basis || 'Approved comp-set',
        verified: Boolean(row?.verified || row?.clientReady || row?.metadata?.verified || row?.metadata?.clientReady || row?.metadata?.basisMatched),
      };
    })
    .filter(Boolean);

  const deduped = Array.from(rows.reduce((map, row) => {
    const key = row.name.toLowerCase();
    const existing = map.get(key);
    if (!existing || row.rate < existing.rate) map.set(key, row);
    return map;
  }, new Map()).values()).sort((a, b) => a.rate - b.rate);

  const ownRate = numericOrNull(dashboard?.marketPosition?.hotelPrice);
  const visibleRates = deduped.map((row) => row.rate);
  const computedMedian = deduped.length >= 3 ? median(visibleRates) : null;
  const marketAvg = deduped.length >= 3 ? (numericOrNull(dashboard?.marketPosition?.marketAvg) || computedMedian) : null;
  const lowestRate = visibleRates.length ? Math.min(...visibleRates) : null;
  const highestRate = visibleRates.length ? Math.max(...visibleRates) : null;
  const ownVsMarketPct = ownRate !== null && marketAvg ? ((ownRate - marketAvg) / marketAvg) * 100 : null;
  const ownVsLowestPct = ownRate !== null && lowestRate ? ((ownRate - lowestRate) / lowestRate) * 100 : null;
  const lowerThanOwn = ownRate !== null ? visibleRates.filter((rate) => rate < ownRate).length : null;
  const clientReadyRows = deduped.filter((row) => row.verified).length;
  const isClientReady = deduped.length >= 3 && clientReadyRows === deduped.length;

  let headline = 'Approved comp-set rates are not captured for this stay date.';
  let guidance = approved.length
    ? `Capture approved comp-set only: ${approved.slice(0, 4).join(', ')}${approved.length > 4 ? '...' : ''}.`
    : 'Approve the comp-set before using competitor analysis.';
  if (deduped.length && ownRate !== null && marketAvg) {
    if (isClientReady) {
      const direction = ownVsMarketPct > 8 ? 'above' : ownVsMarketPct < -8 ? 'below' : 'close to';
      headline = `Own public rate is ${formatGapPct(ownVsMarketPct)} ${direction} the verified comp-set average.`;
      guidance = ownVsMarketPct > 8
        ? 'Protect premium positioning only if direct conversion, room inclusion and pickup support the higher price.'
        : ownVsMarketPct < -8
          ? 'Rate is below verified comp-set pressure; review if demand dates can support stronger pricing.'
          : 'Rate is aligned with the verified comp-set; focus on conversion and channel parity.';
    } else {
      headline = 'Approved comp-set evidence is present but basis-match is pending.';
      guidance = 'Treat this as approved comp-set evidence, not a final pricing claim, until room category, inclusion, tax and cancellation basis are matched.';
    }
  } else if (deduped.length) {
    headline = `${deduped.length} approved comp-set rate${deduped.length === 1 ? '' : 's'} captured; market average is locked.`;
    guidance = 'Capture at least three approved comp-set rates with source and timestamp before showing market-average or vs-market claims.';
  }
  const trackerRows = (approved.length ? approved : deduped.map((row) => row.name)).map((name) => {
    const captured = deduped.find((row) => matchesApprovedCompSetName(row.name, new Set([normalizeComparableName(name)])));
    return captured || {
      key: `missing-${normalizeComparableName(name) || name}`,
      name,
      rate: null,
      currency: 'INR',
      proofUrl: '',
      observedAt: '',
      basis: 'Approved comp-set',
      verified: false,
      missing: true,
    };
  });

  return {
    stayDate,
    rows: deduped,
    trackerRows,
    ownRate,
    marketAvg,
    lowestRate,
    highestRate,
    ownVsMarketPct,
    ownVsLowestPct,
    lowerThanOwn,
    clientReadyRows,
    isClientReady,
    approvedCompSet: approved,
    headline,
    guidance,
  };
}

function buildSignals(dashboard = {}) {
  const modelSignals = buildSignalsFromModel(dashboard?.revenueIntelligenceModel);
  if (modelSignals.length) return modelSignals;

  const signalQuality = dashboard.signalQuality || {};
  const signalBreakdown = dashboard.signalBreakdown || {};
  const competitorRows = Math.max(
    Number(signalQuality.competitorRows || 0),
    Number(dashboard?.marketContext?.competitorRows || 0),
    realtimeCount(dashboard, 'competitor'),
  );
  const otaRows = Math.max(
    Number(signalQuality.otaLiveRows || 0),
    Number(dashboard?.marketContext?.otaRows || 0),
    realtimeCount(dashboard, 'ota'),
  );
  const ownRateReady = positiveNumber(dashboard?.marketPosition?.hotelPrice);
  const marketAvgReady = positiveNumber(dashboard?.marketPosition?.marketAvg);
  const observedAt = dashboard?.realtimeSignals?.latestCapturedAt || dashboard?.marketContext?.observedAt || dashboard?.lastScrapedAt;
  const eventRows = Math.max(
    realtimeCount(dashboard, 'event'),
    importantDatesByType(dashboard, /event|holiday|festival|weekend|rakhi|independence/).length,
  );
  const miceRows = Math.max(
    realtimeCount(dashboard, 'mice'),
    signalRowsByType(dashboard, /mice|corporate|conference|offsite|expo|summit/).length,
    importantDatesByType(dashboard, /mice|corporate|conference|offsite|expo|summit/).length,
  );
  const weddingRows = Math.max(
    realtimeCount(dashboard, 'wedding'),
    signalRowsByType(dashboard, /wedding|marriage|bridal|banquet/).length,
    importantDatesByType(dashboard, /wedding|marriage|bridal|banquet/).length,
  );
  const travelPressureRows = Math.max(
    realtimeCount(dashboard, 'airfare'),
    realtimeCount(dashboard, 'search'),
    signalRowsByType(dashboard, /airfare|airport|arrival|tourism|travel|hotel_search|price_pressure|google_trends/).length,
  );
  const freshRows = realtimeCount(dashboard, 'fresh');

  return [
    {
      key: 'own-rate',
      label: 'Own rate',
      status: signalStatus({ ready: ownRateReady }),
      value: ownRateReady ? formatCurrency(dashboard.marketPosition.hotelPrice) : 'Not captured',
      detail: 'Hotel stay-date selling rate',
      tone: 'rate',
    },
    {
      key: 'ota',
      label: 'OTA rate evidence',
      status: signalStatus({ ready: otaRows >= 2, supporting: otaRows > 0 }),
      value: otaRows ? `${otaRows} rows` : 'Not connected',
      detail: 'Google Hotels, Agoda, Booking.com, MMT',
      tone: 'ota',
    },
    {
      key: 'competitors',
      label: 'Competitor evidence',
      status: signalStatus({ ready: competitorRows >= 3, supporting: competitorRows > 0 }),
      value: competitorRows ? `${competitorRows} rows` : 'Not captured',
      detail: 'Fresh comp-set prices for selected stay date',
      tone: 'competitor',
    },
    {
      key: 'market-average',
      label: 'Market price',
      status: signalStatus({ ready: marketAvgReady }),
      value: marketAvgReady ? formatCurrency(dashboard.marketPosition.marketAvg) : 'Unavailable',
      detail: 'Normalized market average',
      tone: 'market',
    },
    {
      key: 'events',
      label: 'Events / holidays',
      status: signalStatus({ ready: eventRows >= 2 || Math.abs(Number(signalBreakdown.holidayImpact || 0)) > 0.2, supporting: eventRows > 0 }),
      value: eventRows ? `${eventRows} signals` : 'Not connected',
      detail: 'Independence Day, Rakhi, weekends, local events',
      tone: 'event',
    },
    {
      key: 'airfare',
      label: 'Travel / airfare pressure',
      status: signalStatus({ ready: travelPressureRows >= 3, supporting: travelPressureRows > 0 || Math.abs(Number(signalBreakdown.airfareImpact || 0)) > 0 }),
      value: travelPressureRows ? `${travelPressureRows} trend signal${travelPressureRows > 1 ? 's' : ''}` : Math.abs(Number(signalBreakdown.airfareImpact || 0)) > 0 ? 'Watch' : 'Not connected',
      detail: travelPressureRows ? 'Google Trends travel/search pressure' : 'Flight-search and fare movement signal',
      tone: 'airfare',
    },
    {
      key: 'mice',
      label: 'MICE / corporate',
      status: signalStatus({ ready: miceRows >= 2, supporting: miceRows > 0 }),
      value: miceRows ? `${miceRows} watch signal${miceRows > 1 ? 's' : ''}` : 'Not connected',
      detail: miceRows ? 'Corporate offsite / group movement watch' : 'Conference, offsite, group movement feed',
      tone: 'mice',
    },
    {
      key: 'wedding',
      label: 'Wedding demand',
      status: signalStatus({ ready: weddingRows >= 2, supporting: weddingRows > 0 }),
      value: weddingRows ? `${weddingRows} watch signal${weddingRows > 1 ? 's' : ''}` : 'Not connected',
      detail: weddingRows ? 'Destination wedding / luxury group pressure watch' : 'Destination wedding and luxury group pressure',
      tone: 'wedding',
    },
    {
      key: 'freshness',
      label: 'Freshness',
      status: signalStatus({ ready: freshRows > 0, supporting: Boolean(observedAt) }),
      value: formatTimestamp(observedAt),
      detail: 'Last live market observation',
      tone: 'freshness',
    },
  ];
}

const MODEL_EVIDENCE_TO_SIGNAL = {
  official_rate: { key: 'own-rate', tone: 'rate' },
  ota_rate: { key: 'ota', tone: 'ota' },
  competitor_rate: { key: 'competitors', tone: 'competitor' },
  market_price: { key: 'market-average', tone: 'market' },
  event_pressure: { key: 'events', tone: 'event' },
  travel_pressure: { key: 'airfare', tone: 'airfare' },
  mice_pressure: { key: 'mice', tone: 'mice' },
  wedding_pressure: { key: 'wedding', tone: 'wedding' },
  weather_risk: { key: 'weather', tone: 'weather' },
  freshness: { key: 'freshness', tone: 'freshness' },
};

function buildSignalsFromModel(model = null) {
  const evidence = Array.isArray(model?.evidence) ? model.evidence : [];
  return evidence
    .map((item) => {
      const mapping = MODEL_EVIDENCE_TO_SIGNAL[item?.key];
      if (!mapping) return null;
      return {
        key: mapping.key,
        label: item.label || mapping.key,
        status: item.status || 'missing',
        value: item.value || (item.status === 'missing' || item.status === 'stale' ? 'Not connected' : 'Captured'),
        detail: item.clientMeaning || item.missingAction || 'Revenue Intelligence evidence',
        tone: mapping.tone,
        requiredForStrongAction: Boolean(item.requiredForStrongAction),
        missingAction: item.missingAction || '',
        category: item.category || '',
      };
    })
    .filter(Boolean);
}

function buildExecutiveCall(dashboard = {}, signals = []) {
  const missingCritical = signals.filter((signal) =>
    ['own-rate', 'ota', 'competitors', 'market-average'].includes(signal.key) && signal.status !== 'ready');
  const ownRateReady = !missingCritical.some((signal) => signal.key === 'own-rate');
  const revenueSupportSignals = signals.filter((signal) =>
    ['events', 'airfare', 'mice', 'wedding', 'freshness'].includes(signal.key) && signal.status !== 'missing');

  if (missingCritical.length) {
    const missingLabels = missingCritical.map((signal) => signal.label.toLowerCase()).join(', ');
    if (ownRateReady) {
      return {
        label: 'Revenue Intelligence Verdict',
        title: 'Protect rate. Complete OTA and competitor proof.',
        message: `${formatCurrency(dashboard?.marketPosition?.hotelPrice)} is captured as the official rate for this stay date. ${revenueSupportSignals.length} revenue signal${revenueSupportSignals.length === 1 ? '' : 's'} support watch status, but final pricing action stays locked until ${missingLabels} are captured.`,
        tone: 'watch',
      };
    }
    return {
      label: 'Revenue Intelligence Verdict',
      title: 'Hold action until rate evidence is complete.',
      message: `Revenue Intelligence is waiting for ${missingLabels}. The view will not create fake pricing advice from missing evidence.`,
      tone: 'missing',
    };
  }

  const action = String(dashboard?.actionSummary?.action || dashboard?.suggestedPricing?.action || 'Hold / Watch');
  return {
    label: 'Revenue Intelligence Verdict',
    title: action,
    message: dashboard?.narrative?.actionGuidance || 'Revenue Intelligence has enough evidence to support a controlled pricing decision.',
    tone: action.toLowerCase().includes('increase') ? 'high' : action.toLowerCase().includes('reduce') ? 'watch' : 'ready',
  };
}

function EvidenceLedger({ signals }) {
  const coreRows = signals.filter((signal) =>
    ['own-rate', 'ota', 'competitors', 'market-average', 'freshness'].includes(signal.key));

  return (
    <section className="gmPanel gmEvidencePanel" aria-label="Revenue Intelligence evidence">
      <header className="gmSectionHeader">
        <span>Revenue Intelligence Evidence</span>
        <h2>Verified inputs behind the recommendation</h2>
      </header>
      <div className="gmEvidenceList">
        {coreRows.map((signal) => (
          <article key={signal.key} className={`gmEvidenceRow gmStatus-${signal.status}`}>
            <div>
              <strong>{signal.label}</strong>
              <small>{signal.detail}</small>
            </div>
            <span>{signal.value}</span>
            <em>{statusCopy(signal.status)}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function DateMatrix({ dates }) {
  return (
    <section className="gmPanel gmDateMatrixPanel" aria-label="Revenue Intelligence date matrix">
      <header className="gmSectionHeader">
        <span>Revenue Intelligence Calendar</span>
        <h2>Upcoming stay dates requiring revenue attention</h2>
      </header>
      <div className="gmDateMatrix">
        {dates.map((date) => (
          <article key={`${date.date}-${date.label}`} className={`gmDateCard gmDate-${date.tone}`}>
            <span>{formatDate(date.date, { weekday: 'short' })}</span>
            <strong>{date.label}</strong>
            <small>{date.endDate && date.endDate !== date.date ? `${formatDate(date.date)} - ${formatDate(date.endDate)}` : formatDate(date.date)}</small>
            <em>{date.pressure}</em>
            <p>{date.driver}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SignalMap({ signals }) {
  return (
    <section className="gmPanel gmSignalMapPanel" aria-label="Revenue Intelligence signal map">
      <header className="gmSectionHeader">
        <span>Revenue Intelligence Signals</span>
        <h2>Commercial pressure separated by evidence type</h2>
      </header>
      <div className="gmSignalMap">
        {signals.map((signal) => (
          <article key={signal.key} className={`gmSignalCard gmSignal-${signal.tone} gmStatus-${signal.status}`}>
            <div>
              <span>{signal.label}</span>
              <em>{statusCopy(signal.status)}</em>
            </div>
            <strong>{signal.value}</strong>
            <p>{signal.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function NextBuildPanel() {
  return (
    <section className="gmPanel gmBuildPanel" aria-label="Revenue Intelligence activation path">
      <header className="gmSectionHeader">
        <span>Revenue Intelligence Activation</span>
        <h2>What remains before automated pricing confidence</h2>
      </header>
      <div className="gmBuildGrid">
        <article>
          <strong>1. Official rate evidence</strong>
          <p>Own hotel rate by stay date, room type, guest count, and last captured time.</p>
        </article>
        <article>
          <strong>2. OTA revenue evidence</strong>
          <p>Google Hotels, Agoda, Booking.com, MMT, Expedia, and Hotels.com rates with proof and timestamp.</p>
        </article>
        <article>
          <strong>3. Competitor revenue set</strong>
          <p>3-7 comparable hotels around the property, normalized by room type and stay date.</p>
        </article>
        <article>
          <strong>4. Revenue pressure layer</strong>
          <p>Holiday, travel search, wedding, MICE, local events, and seasonality shown as separate signals.</p>
        </article>
      </div>
    </section>
  );
}

function compactNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(signal) {
  if (!signal) return 'Missing';
  return statusCopy(signal.status);
}

function signalByKey(signals, key) {
  return signals.find((signal) => signal.key === key) || null;
}

function evidencePct(signals = []) {
  if (!signals.length) return 0;
  const score = signals.reduce((total, signal) => {
    if (signal.status === 'ready') return total + 1;
    if (signal.status === 'supporting') return total + 0.55;
    return total;
  }, 0);
  return Math.round((score / signals.length) * 100);
}

function ClientKpiGrid({ dashboard, signals, selectedDate, otaRows, competitorRows, model }) {
  const ownRate = signalByKey(signals, 'own-rate');
  const events = signalByKey(signals, 'events');
  const travel = signalByKey(signals, 'airfare');
  const readiness = numericOrNull(model?.executiveSummary?.confidenceScore) ?? evidencePct(signals);

  const items = [
    {
      label: 'Official rate',
      value: formatCurrency(dashboard?.marketPosition?.hotelPrice),
      trend: ownRate?.status === 'ready' ? 'captured' : 'pending',
      tone: ownRate?.status || 'missing',
    },
    {
      label: 'OTA evidence',
      value: compactNumber(otaRows),
      trend: otaRows > 0 ? 'sources' : 'pending',
      tone: otaRows > 0 ? 'supporting' : 'missing',
    },
    {
      label: 'Competitor evidence',
      value: compactNumber(competitorRows),
      trend: competitorRows > 0 ? 'hotels' : 'pending',
      tone: competitorRows > 0 ? 'supporting' : 'missing',
    },
    {
      label: 'Revenue readiness',
      value: `${readiness}%`,
      trend: `${signals.filter((signal) => signal.status === 'missing').length} gaps`,
      tone: readiness >= 70 ? 'ready' : readiness >= 40 ? 'supporting' : 'missing',
    },
    {
      label: 'Demand dates',
      value: compactNumber(realtimeCount(dashboard, 'event')),
      trend: formatDate(selectedDate),
      tone: events?.status || 'missing',
    },
    {
      label: 'Travel pressure',
      value: travel?.value || compactNumber(realtimeCount(dashboard, 'airfare')),
      trend: travel?.status === 'ready' ? 'trend active' : statusLabel(travel).toLowerCase(),
      tone: travel?.status || 'missing',
    },
  ];

  return (
    <div className="riKpiGrid" aria-label="Revenue Intelligence KPIs">
      {items.map((item) => (
        <article key={item.label} className={`riKpi riTone-${item.tone}`}>
          <span className="riKpiLabel">{item.label}</span>
          <span className="riKpiValue">{item.value}</span>
          <span className="riKpiTrend">{item.trend}</span>
        </article>
      ))}
    </div>
  );
}

function toneForReadiness(value) {
  const score = Number(value || 0);
  if (score >= 75) return 'ready';
  if (score >= 55) return 'supporting';
  return 'missing';
}

function firstAvailable(items = []) {
  return items.find((item) => String(item || '').trim()) || '';
}

function buildGmCommand({ dashboard = {}, model = null, signals = [], dates = [], market = '', selectedDate = '' }) {
  const summary = model?.executiveSummary || {};
  const evidence = Array.isArray(model?.evidence) ? model.evidence : [];
  const opportunities = Array.isArray(model?.opportunityRows) ? model.opportunityRows : [];
  const missing = Array.isArray(model?.missingDataActions) ? model.missingDataActions : [];
  const morningBullets = Array.isArray(model?.morningBrief?.bullets) ? model.morningBrief.bullets : [];
  const confidenceScore = numericOrNull(summary.confidenceScore) ?? evidencePct(signals);
  const missingRequired = evidence.filter((item) => item.requiredForStrongAction && item.status !== 'ready');
  const activeSignals = evidence.filter((item) => item.status === 'ready' || item.status === 'supporting');
  const watchDates = dates.filter((date) => date.tone === 'high' || date.tone === 'watch').slice(0, 5);
  const official = evidence.find((item) => item.key === 'official_rate') || signalByKey(signals, 'own-rate');
  const ota = evidence.find((item) => item.key === 'ota_rate') || signalByKey(signals, 'ota');
  const competitor = evidence.find((item) => item.key === 'competitor_rate') || signalByKey(signals, 'competitors');
  const freshness = evidence.find((item) => item.key === 'freshness') || signalByKey(signals, 'freshness');
  const demandSignals = evidence.filter((item) =>
    ['event_pressure', 'travel_pressure', 'mice_pressure', 'wedding_pressure'].includes(item.key) &&
    item.status !== 'missing');

  const action = summary.pricingAction || summary.title || dashboard?.actionSummary?.action || 'Hold / Watch';
  const attention =
    missingRequired.length > 0
      ? `Strong rate action is locked until ${missingRequired.map((item) => item.label.toLowerCase()).join(', ')} are ready.`
      : 'Required pricing evidence is ready for a controlled revenue decision.';

  const headline = firstAvailable([
    morningBullets[4],
    opportunities[0]?.opportunity,
    activeSignals.length ? `${activeSignals.length} evidence layers are active for ${formatDate(selectedDate)}.` : '',
    'Revenue Intelligence is waiting for verified market evidence.',
  ]);

  return {
    action,
    confidenceScore,
    trustStatus: String(summary.trustStatus || '').replace(/_/g, ' ') || 'watch only',
    headline,
    attention,
    market,
    selectedDate,
    sourceRows: [
      {
        label: 'Official rate',
        status: official?.status || 'missing',
        value: official?.value || formatCurrency(dashboard?.marketPosition?.hotelPrice),
        note: official?.clientMeaning || official?.detail || 'Direct selling rate',
      },
      {
        label: 'OTA proof',
        status: ota?.status || 'missing',
        value: ota?.value || 'Not connected',
        note: ota?.clientMeaning || ota?.detail || 'Public channel evidence',
      },
      {
        label: 'Competitor proof',
        status: competitor?.status || 'missing',
        value: competitor?.value || 'Not captured',
        note: competitor?.clientMeaning || competitor?.detail || 'Comparable market pressure',
      },
      {
        label: 'Demand pressure',
        status: demandSignals.length >= 2 ? 'ready' : demandSignals.length ? 'supporting' : 'missing',
        value: demandSignals.length ? `${demandSignals.length} active` : 'Not connected',
        note: 'Event, travel, MICE, wedding signals',
      },
      {
        label: 'Freshness',
        status: freshness?.status || 'missing',
        value: freshness?.value || formatTimestamp(dashboard?.realtimeSignals?.latestCapturedAt),
        note: freshness?.clientMeaning || freshness?.detail || 'Last verified observation',
      },
    ],
    actionCards: [
      {
        owner: 'Revenue',
        title: action,
        detail: attention,
        tone: toneForReadiness(confidenceScore),
      },
      {
        owner: 'Sales',
        title: opportunities.find((item) => item.type === 'sales')?.opportunity || 'Watch group demand windows',
        detail: opportunities.find((item) => item.type === 'sales')?.action || 'Use MICE and wedding signals to start opportunity validation.',
        tone: demandSignals.length ? 'supporting' : 'missing',
      },
      {
        owner: 'Data ops',
        title: missing.length ? `${missing.length} evidence gap${missing.length === 1 ? '' : 's'} to close` : 'Evidence contract healthy',
        detail: missing[0]?.action || 'Keep proof-bearing source capture fresh before the morning brief.',
        tone: missing.length ? 'supporting' : 'ready',
      },
    ],
    watchDates,
  };
}

function GmCommandPanel({ dashboard, model, signals, dates, market, selectedDate }) {
  const command = buildGmCommand({ dashboard, model, signals, dates, market, selectedDate });

  return (
    <section className="riPanel riCommandPanel" aria-label="GM morning command view">
      <div className="riCommandHero">
        <div>
          <span>GM Morning Command View</span>
          <h2>{command.headline}</h2>
          <p>{command.attention}</p>
        </div>
        <article>
          <span>Action</span>
          <strong>{command.action}</strong>
          <small>{command.trustStatus} · {command.confidenceScore}% readiness</small>
        </article>
      </div>

      <div className="riCommandGrid">
        <div className="riCommandBlock">
          <span>Source confidence</span>
          <div className="riSourceStack">
            {command.sourceRows.map((row) => (
              <article key={row.label} className={`riSourceRow riTone-${row.status}`}>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.note}</small>
                </div>
                <em>{statusCopy(row.status)}</em>
                <span>{row.value}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="riCommandBlock">
          <span>Today’s operating focus</span>
          <div className="riActionStack">
            {command.actionCards.map((card) => (
              <article key={`${card.owner}-${card.title}`} className={`riActionCard riTone-${card.tone}`}>
                <em>{card.owner}</em>
                <strong>{card.title}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="riCommandBlock">
          <span>Upcoming pressure</span>
          <div className="riWatchDates">
            {command.watchDates.map((date) => (
              <article key={`${date.date}-${date.label}`} className={`riWatchDate riDate-${date.tone}`}>
                <em>{formatDate(date.date, { weekday: undefined }).replace(',', '')}</em>
                <strong>{date.label}</strong>
                <small>{date.pressure} · {date.driver}</small>
              </article>
            ))}
            {!command.watchDates.length ? (
              <p className="metaLabel">No upcoming pressure date is ready yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function RateEvidencePanel({ dashboard, otaRows, competitorRows }) {
  const ownRate = numericOrNull(dashboard?.marketPosition?.hotelPrice) || 0;
  const marketAvg = numericOrNull(dashboard?.marketPosition?.marketAvg) || 0;
  const bars = [
    { label: 'Official', value: ownRate, tone: 'ready' },
    { label: 'OTA', value: otaRows, tone: otaRows ? 'supporting' : 'missing', countMode: true },
    { label: 'Competitor', value: competitorRows, tone: competitorRows ? 'supporting' : 'missing', countMode: true },
    { label: 'Market avg', value: marketAvg, tone: marketAvg > 0 ? 'ready' : 'missing' },
  ];
  const maxRate = Math.max(ownRate, marketAvg, 1);

  return (
    <section className="riPanel riRatePanel" aria-label="Revenue rate evidence">
      <div className="riPanelHeader">
        <span>Rate evidence</span>
        <p>Official and external price coverage</p>
      </div>
      <div className="riRateRows">
        {bars.map((bar) => {
          const width = bar.countMode ? Math.min(100, Number(bar.value || 0) * 24) : Math.max(6, Math.round((Number(bar.value || 0) / maxRate) * 100));
          return (
            <div key={bar.label} className={`riRateRow riTone-${bar.tone}`}>
              <div>
                <span>{bar.label}</span>
                <span>{bar.countMode ? Number(bar.value || 0) : formatCurrency(bar.value)}</span>
              </div>
              <i style={{ width: `${width}%` }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DatePressurePanel({ dates }) {
  const visibleDates = dates.slice(0, REVENUE_HORIZON_DAYS);
  const headlineDates = visibleDates.filter((date) => date.tone !== 'missing').slice(0, 5);
  const heightFor = (date) => {
    if (date.tone === 'high') return 88;
    if (date.tone === 'watch') return 58;
    return 28;
  };

  return (
    <section className="riPanel riDatePanel" aria-label="Revenue date pressure">
      <div className="riPanelHeader">
        <span>15-day revenue dates</span>
        <p>Stay-date pressure map from the selected date</p>
      </div>
      <div className="riDateBars">
        {visibleDates.map((date) => (
          <article key={`${date.date}-${date.label}`} className={`riDateBar riDate-${date.tone}`}>
            <div className="riBarTrack">
              <i style={{ height: `${heightFor(date)}%` }} />
            </div>
            <span>{formatDate(date.date, { weekday: undefined }).replace(',', '')}</span>
            <strong>{date.tariffLabel || 'Not captured'}</strong>
            <small>{date.pressure}</small>
          </article>
        ))}
      </div>
      <div className="riDateList" aria-label="Important revenue dates">
        {(headlineDates.length ? headlineDates : visibleDates.slice(0, 3)).map((date) => (
          <article key={`story-${date.date}-${date.label}`} className={`riDateStory riDate-${date.tone}`}>
            <span>{formatDate(date.date, { year: 'numeric' })}</span>
            <strong>{date.label}</strong>
            <small>{date.driver || date.pressure || 'Revenue pressure watch'}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidenceMixPanel({ signals }) {
  const ready = signals.filter((signal) => signal.status === 'ready').length;
  const supporting = signals.filter((signal) => signal.status === 'supporting').length;
  const missing = signals.filter((signal) => signal.status === 'missing').length;
  const total = Math.max(1, signals.length);
  const readyPct = Math.round((ready / total) * 100);
  const supportingPct = Math.round((supporting / total) * 100);
  const missingPct = Math.max(0, 100 - readyPct - supportingPct);
  const background = `conic-gradient(#73ad64 0 ${readyPct}%, #9fbde8 ${readyPct}% ${readyPct + supportingPct}%, #efefef ${readyPct + supportingPct}% 100%)`;

  return (
    <section className="riPanel riMixPanel" aria-label="Revenue evidence mix">
      <div className="riPanelHeader">
        <span>Evidence mix</span>
        <p>Ready, supporting, missing</p>
      </div>
      <div className="riDonutWrap">
        <div className="riDonut" style={{ background }}>
          <span>{evidencePct(signals)}%</span>
        </div>
        <div className="riLegend">
          <span><i className="riLegendReady" />Ready {ready}</span>
          <span><i className="riLegendSupporting" />Supporting {supporting}</span>
          <span><i className="riLegendMissing" />Missing {missing}</span>
        </div>
      </div>
    </section>
  );
}

function formatGapPct(value) {
  const parsed = numericOrNull(value);
  if (parsed === null) return 'Not captured';
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(1)}%`;
}

function statusWord(value = '') {
  const text = String(value || '').replace(/_/g, ' ');
  return text || 'watch';
}

function OtaWatchPanel({ model }) {
  const watch = model?.otaWatch;
  if (!watch) return null;
  const gapReportable = watch.gapPct !== null && watch.gapPct !== undefined && watch.gapReportable !== false;
  const gapBlockReason = !positiveNumber(watch.ownRate)
    ? 'Own rate not captured'
    : !positiveNumber(watch.lowestOtaRate)
      ? 'OTA rate not captured'
      : watch.ownProofReady === false
        ? 'Own proof pending'
        : watch.otaProofReady === false
          ? 'OTA proof pending'
          : statusWord(watch.leakageRisk);
  const tone =
    watch.status === 'healthy'
      ? 'ready'
      : watch.status === 'attention'
        ? 'missing'
        : watch.status === 'partial'
          ? 'supporting'
          : 'missing';

  return (
    <section className={`riPanel riOtaWatchPanel riTone-${tone}`} aria-label="OTA watch">
      <div className="riOtaWatchHero">
        <div>
          <span>OTA Watch</span>
          <h2>{watch.headline}</h2>
          <p>{watch.action}</p>
        </div>
        <article>
          <span>Public gap</span>
          <strong>{gapReportable ? formatGapPct(watch.gapPct) : positiveNumber(watch.ownRate) && positiveNumber(watch.lowestOtaRate) ? 'Proof pending' : 'Not captured'}</strong>
          <small>{gapBlockReason}</small>
        </article>
      </div>
      <div className="riOtaWatchGrid">
        <article>
          <span>Own public rate</span>
          <strong>{watch.ownRateLabel || 'Not captured'}</strong>
          <small>{watch.ownProofReady ? 'Proof ready' : positiveNumber(watch.ownRate) ? 'Proof pending' : 'Capture needed'}</small>
        </article>
        <article>
          <span>Lowest OTA rate</span>
          <strong>{watch.lowestOtaRateLabel || 'Not captured'}</strong>
          <small>{watch.otaProofReady ? 'Proof ready' : positiveNumber(watch.lowestOtaRate) ? 'Proof pending' : 'Capture needed'}</small>
        </article>
        <article>
          <span>Channels observed</span>
          <strong>{Number(watch.channelsObserved || 0)}</strong>
          <small>{Array.isArray(watch.channels) && watch.channels.length ? watch.channels.slice(0, 3).join(', ') : 'No public channel rows'}</small>
        </article>
        <article>
          <span>Source status</span>
          <strong>{statusWord(watch.sourceStatus)}</strong>
        </article>
      </div>
    </section>
  );
}

function LeakageWatchPanel({ model }) {
  const leakage = model?.leakageWatch;
  const resources = model?.resourceTransformation;
  const areas = Array.isArray(leakage?.leakageAreas) ? leakage.leakageAreas : [];
  const resourceRows = Array.isArray(resources?.resources) ? resources.resources : [];
  if (!leakage && !resources) return null;

  return (
    <section className="riPanel riLeakagePanel" aria-label="Revenue leakage watch">
      <div className="riPanelHeader">
        <span>Revenue leakage watch</span>
        <p>{leakage?.summary || resources?.headline}</p>
      </div>
      <div className="riLeakageGrid">
        {areas.map((area) => (
          <article key={area.key} className={`riLeakageCard riLeakage-${area.status}`}>
            <span>{area.label}</span>
            <strong>{statusWord(area.status)}</strong>
            <p>{area.detail}</p>
          </article>
        ))}
      </div>
      {resources ? (
        <div className="riResourceStrip">
          <span>{resources.headline}</span>
          <p>{resources.leakageRecoveryHypothesis}</p>
          <div>
            {resourceRows.map((item) => (
              <article key={item.key} className={`riResourceItem riResource-${item.status}`}>
                <strong>{item.label}</strong>
                <em>{item.owner}</em>
                <small>{item.action}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EnterpriseBriefPanel({ model }) {
  const brief = model?.enterpriseBrief;
  if (!brief) return null;
  const contract = brief.proofContract || {};
  const priorityDates = Array.isArray(brief.priorityDates) ? brief.priorityDates : [];
  const nextDates = Array.isArray(brief.next15Days) ? brief.next15Days : [];
  const visibleDates = priorityDates.length ? priorityDates : nextDates.slice(0, 5);

  return (
    <section className="riPanel riEnterprisePanel" aria-label="Enterprise Revenue Intelligence brief">
      <div className="riEnterpriseIntro">
        <div>
          <span>Enterprise Revenue Intelligence</span>
          <h2>{brief.decisionPosture || 'Watch-only until proof is complete'}</h2>
          <p>{brief.presentationPromise}</p>
        </div>
        <article>
          <span>15-day score</span>
          <strong>{Number(brief.enterpriseScore || 0).toFixed(1)}</strong>
          <small>{brief.horizonDays || 15} day operating horizon</small>
        </article>
      </div>

      <div className="riEnterpriseGrid">
        <article>
          <span>Market read</span>
          <p>{brief.marketRead}</p>
        </article>
        <article>
          <span>Hotel gap</span>
          <p>{brief.hotelGap}</p>
        </article>
        <article>
          <span>Commercial focus</span>
          <p>{brief.commercialFocus}</p>
        </article>
      </div>

      <div className="riEnterpriseContract">
        <article>
          <span>Required proof</span>
          <strong>{Number(contract.requiredReady || 0)}/{Number(contract.requiredTotal || 0)}</strong>
        </article>
        <article>
          <span>Supporting signals</span>
          <strong>{Number(contract.supportingActive || 0)}</strong>
        </article>
        <article>
          <span>Critical gaps</span>
          <strong>{Number(contract.missingCritical || 0)}</strong>
        </article>
        <article>
          <span>Cadence</span>
          <p>{brief.morningCadence}</p>
        </article>
      </div>

      <div className="riEnterpriseDates">
        {visibleDates.map((date) => (
          <article key={`${date.date}-${date.primarySignal}`} className={`riEnterpriseDate riDate-${date.tone}`}>
            <em>{date.displayDate || formatDate(date.date, { weekday: undefined })}</em>
            <strong>{date.pressure}</strong>
            <span>{date.primarySignal}</span>
            <small>{date.recommendedAction}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkingModelPanel({ model }) {
  if (!model?.executiveSummary) return null;
  const evidence = Array.isArray(model.evidence) ? model.evidence : [];
  const opportunities = Array.isArray(model.opportunityRows) ? model.opportunityRows : [];
  const missing = Array.isArray(model.missingDataActions) ? model.missingDataActions : [];

  return (
    <section className="riPanel riWorkingModelPanel" aria-label="Revenue Intelligence working model">
      <div className="riWorkingModelHero">
        <div>
          <span>Morning Working Model</span>
          <h2>{model.executiveSummary.title}</h2>
          <p>{model.executiveSummary.narrative}</p>
        </div>
        <article>
          <span>Confidence</span>
          <strong>{model.executiveSummary.confidenceScore}%</strong>
          <small>{String(model.executiveSummary.trustStatus || '').replace(/_/g, ' ')}</small>
        </article>
      </div>

      <div className="riWorkingModelGrid">
        <div className="riWorkingModelBlock">
          <span>Evidence contract</span>
          {evidence.filter((item) => item.requiredForStrongAction).map((item) => (
            <article key={item.key} className={`riWorkingEvidence riTone-${item.status}`}>
              <strong>{item.label}</strong>
              <em>{statusCopy(item.status)}</em>
              <small>{item.value || item.missingAction}</small>
            </article>
          ))}
        </div>

        <div className="riWorkingModelBlock">
          <span>Revenue opportunities</span>
          {opportunities.slice(0, 3).map((item) => (
            <article key={`${item.type}-${item.opportunity}`} className="riWorkingOpportunity">
              <strong>{item.opportunity}</strong>
              <p>{item.action}</p>
              <small>{item.owner}</small>
            </article>
          ))}
          {!opportunities.length ? <p className="metaLabel">No opportunity generated yet.</p> : null}
        </div>

        <div className="riWorkingModelBlock">
          <span>Next data actions</span>
          {missing.slice(0, 4).map((item) => (
            <article key={item.key} className="riWorkingMissing">
              <strong>{item.label}</strong>
              <p>{item.action}</p>
            </article>
          ))}
          {!missing.length ? <p className="metaLabel">All required pricing evidence is ready.</p> : null}
        </div>
      </div>

      {model.morningBrief?.whatsappDraft ? (
        <div className="riWhatsappDraft">
          <span>Morning brief draft</span>
          <pre>{model.morningBrief.whatsappDraft}</pre>
        </div>
      ) : null}
    </section>
  );
}

function BetaReadinessPanel({ model }) {
  const readiness = model?.betaReadiness;
  if (!readiness) return null;
  const pillars = Array.isArray(readiness.pillars) ? readiness.pillars : [];
  const nextToReachTen = Array.isArray(readiness.nextToReachTen) ? readiness.nextToReachTen : [];

  return (
    <section className="riPanel riBetaReadinessPanel" aria-label="HotelRADAR beta readiness scorecard">
      <div className="riBetaReadinessIntro">
        <div>
          <span>Revenue Intelligence Readiness</span>
          <h2>{readiness.status === 'beta_ready' ? 'Market confidence is demonstration-ready' : 'Live feed coverage is the main quality gap'}</h2>
          <p>{readiness.summary}</p>
        </div>
        <article>
          <span>Current</span>
          <strong>{Number(readiness.scoreOutOf10 || 0).toFixed(1)}</strong>
          <small>quality target {Number(readiness.targetScore || 8.5).toFixed(1)}/10</small>
        </article>
      </div>

      <div className="riBetaPillars">
        {pillars.map((pillar) => (
          <article key={pillar.key} className={`riBetaPillar riTone-${pillar.status}`}>
            <div>
              <span>{pillar.label}</span>
              <em>{statusCopy(pillar.status)}</em>
            </div>
            <strong>{Math.round(Number(pillar.score || 0))}%</strong>
            <p>{pillar.proof}</p>
            <small>{pillar.nextAction}</small>
          </article>
        ))}
      </div>

      {nextToReachTen.length ? (
        <div className="riTenPath">
          <span>Path to a stronger intelligence layer</span>
          {nextToReachTen.map((item) => <p key={item}>{item}</p>)}
        </div>
      ) : null}
    </section>
  );
}

function RevenueSignalTable({ signals }) {
  return (
    <section className="riPanel riSignalTable" aria-label="Revenue signal table">
      <div className="riPanelHeader">
        <span>Revenue signals</span>
        <p>Evidence status by signal type</p>
      </div>
      <div className="riSignalRows">
        {signals.map((signal) => (
          <article key={signal.key} className={`riSignalRow riTone-${signal.status}`}>
            <span>{signal.label}</span>
            <span>{signal.value}</span>
            <em>{statusCopy(signal.status)}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function CompetitorAnalysisPanel({ dashboard, selectedDate }) {
  const analysis = buildCompetitorAnalysis(dashboard, selectedDate);
  const visibleRows = analysis.trackerRows.slice(0, 8);

  return (
    <section className="riPanel riCompetitorPanel" aria-label="Competitor rate position">
      <div className="riCompetitorIntro">
        <div>
          <span>Competitor rate position</span>
          <h2>{analysis.headline}</h2>
          <p>{analysis.guidance}</p>
          <small>
            Selected stay date · {formatDate(analysis.stayDate, { year: 'numeric' })} · {analysis.isClientReady ? 'verified comp-set evidence' : 'approved comp-set evidence, basis-match pending'}
          </small>
        </div>
        <div className="riCompetitorSummary">
          <article>
            <span>Own rate</span>
            <strong>{formatCurrency(analysis.ownRate)}</strong>
          </article>
          <article>
            <span>{analysis.isClientReady ? 'Market avg' : 'Approved avg'}</span>
            <strong>{formatCurrency(analysis.marketAvg)}</strong>
          </article>
          <article>
            <span>Lowest approved</span>
            <strong>{formatCurrency(analysis.lowestRate)}</strong>
          </article>
          <article>
            <span>Below own rate</span>
            <strong>{analysis.lowerThanOwn === null ? 'Unavailable' : `${analysis.lowerThanOwn}/${analysis.rows.length}`}</strong>
          </article>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="riCompetitorTable" role="table" aria-label="Approved competitor capture tracker">
          <div className="riCompetitorHead" role="row">
            <span>Approved competitor</span>
            <span>Rate</span>
            <span>Vs own</span>
            <span>Source</span>
          </div>
          {visibleRows.map((row) => {
            const vsOwn = !row.missing && analysis.ownRate !== null ? ((row.rate - analysis.ownRate) / analysis.ownRate) * 100 : null;
            return (
              <article key={row.key} className={`riCompetitorRow ${row.missing ? 'riCompetitorMissing' : ''}`} role="row">
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.missing ? 'Approved comp-set · capture needed' : `${row.basis} · ${formatTimestamp(row.observedAt)}`}</small>
                </span>
                <span>{row.missing ? 'Capture needed' : formatCurrency(row.rate)}</span>
                <span className={vsOwn === null ? 'riCompNeutral' : vsOwn < -8 ? 'riCompLower' : vsOwn > 8 ? 'riCompHigher' : 'riCompNeutral'}>
                  {vsOwn === null ? 'Locked' : formatGapPct(vsOwn)}
                </span>
                <span>
                  {row.proofUrl ? (
                    <a href={row.proofUrl} target="_blank" rel="noreferrer">View source</a>
                  ) : (
                    <em>{row.missing ? 'Add source' : 'Pending'}</em>
                  )}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="riCompetitorEmpty">
          <strong>No approved comp-set configured.</strong>
          <p>Approve the competitor set before using market-position analysis.</p>
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ dashboard, loading, error }) {
  const signals = useMemo(() => buildSignals(dashboard || {}), [dashboard]);
  const model = dashboard?.revenueIntelligenceModel || null;
  const dates = useMemo(() => buildRevenueDates(dashboard || {}, model), [dashboard, model]);
  const executiveCall = useMemo(() => {
    if (model?.executiveSummary) {
      return {
        title: model.executiveSummary.title,
        message: model.executiveSummary.narrative,
        tone: model.executiveSummary.trustStatus,
      };
    }
    return buildExecutiveCall(dashboard || {}, signals);
  }, [dashboard, signals, model]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <section className="gmDashboard">
        <div className="gmPanel">
          <p className="errorText">{error}</p>
        </div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="gmDashboard">
        <div className="gmPanel gmEmptyState">
          <span>Revenue Intelligence</span>
          <h2>Select a hotel to open the Revenue Intelligence brief.</h2>
          <p>Verified rate evidence and revenue-pressure signals will appear here.</p>
        </div>
      </section>
    );
  }

  const selectedDate = dashboard?.marketContext?.checkinDate || currentIndiaDate();
  const market = dashboard?.marketContext?.city || dashboard?.city || 'Goa';
  const readySignals = signals.filter((signal) => signal.status === 'ready').length;
  const missingSignals = signals.filter((signal) => signal.status === 'missing').length;
  const readinessPct = numericOrNull(model?.executiveSummary?.confidenceScore) ?? evidencePct(signals);
  const otaRows = Math.max(Number(dashboard?.signalQuality?.otaLiveRows || 0), realtimeCount(dashboard, 'ota'));
  const competitorRows = Math.max(Number(dashboard?.signalQuality?.competitorRows || 0), realtimeCount(dashboard, 'competitor'));

  return (
    <section id="hotel-dashboard-panel" className="riDashboard" aria-label="Hotel Revenue Intelligence brief">
      <section className="riBoard">
        <header className="riHeader">
          <div>
            <span>Revenue Intelligence</span>
            <h1>{executiveCall.title}</h1>
            <p>{executiveCall.message}</p>
          </div>
          <div className="riHeaderMeta">
            <article>
              <span>Market</span>
              <em>{market}</em>
            </article>
            <article>
              <span>Stay date</span>
              <em>{formatDate(selectedDate, { year: 'numeric' })}</em>
            </article>
            <article>
              <span>Readiness</span>
              <em>{readinessPct}%</em>
              <small>{readySignals}/{signals.length} ready · {missingSignals} gaps</small>
            </article>
          </div>
        </header>

        <ClientKpiGrid
          dashboard={dashboard}
          signals={signals}
          selectedDate={selectedDate}
          otaRows={otaRows}
          competitorRows={competitorRows}
          model={model}
        />

        <GmCommandPanel
          dashboard={dashboard}
          model={model}
          signals={signals}
          dates={dates}
          market={market}
          selectedDate={selectedDate}
        />

        <OtaWatchPanel model={model} />

        <CompetitorAnalysisPanel dashboard={dashboard} selectedDate={selectedDate} />

        <LeakageWatchPanel model={model} />

        <EnterpriseBriefPanel model={model} />

        <BetaReadinessPanel model={model} />

        <WorkingModelPanel model={model} />

        <div className="riChartGrid">
          <RateEvidencePanel dashboard={dashboard} otaRows={otaRows} competitorRows={competitorRows} />
          <DatePressurePanel dates={dates} />
          <EvidenceMixPanel signals={signals} />
        </div>

        <RevenueSignalTable signals={signals} />
      </section>
    </section>
  );
}
