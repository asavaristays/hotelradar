import { useMemo } from 'react';

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
  const unique = new Map();
  combined.forEach((entry) => {
    const key = `${entry.date}-${entry.label}`;
    if (!unique.has(key)) unique.set(key, entry);
  });

  if (![...unique.values()].some((entry) => isBetween(selectedDate, entry.date, entry.endDate || entry.date))) {
    unique.set(`selected-${selectedDate}`, {
      date: selectedDate,
      endDate: selectedDate,
      label: 'Selected stay date',
      pressure: 'Needs evidence',
      driver: 'Awaiting live rate and competitor feeds',
      tone: 'missing',
    });
  }

  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

function signalStatus({ ready, supporting }) {
  if (ready) return 'ready';
  if (supporting) return 'supporting';
  return 'missing';
}

function statusCopy(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'supporting') return 'Supporting';
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

function buildSignals(dashboard = {}) {
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

function ClientKpiGrid({ dashboard, signals, selectedDate, otaRows, competitorRows }) {
  const ownRate = signalByKey(signals, 'own-rate');
  const events = signalByKey(signals, 'events');
  const travel = signalByKey(signals, 'airfare');
  const readiness = evidencePct(signals);

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
  const visibleDates = dates.slice(0, 7);
  const heightFor = (date) => {
    if (date.tone === 'high') return 88;
    if (date.tone === 'watch') return 58;
    return 28;
  };

  return (
    <section className="riPanel riDatePanel" aria-label="Revenue date pressure">
      <div className="riPanelHeader">
        <span>Revenue dates</span>
        <p>Upcoming stay-date pressure</p>
      </div>
      <div className="riDateBars">
        {visibleDates.map((date) => (
          <article key={`${date.date}-${date.label}`} className={`riDateBar riDate-${date.tone}`}>
            <div className="riBarTrack">
              <i style={{ height: `${heightFor(date)}%` }} />
            </div>
            <span>{formatDate(date.date, { weekday: undefined }).replace(',', '')}</span>
            <small>{date.pressure}</small>
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

export default function Dashboard({ dashboard, loading, error }) {
  const signals = useMemo(() => buildSignals(dashboard || {}), [dashboard]);
  const dates = useMemo(() => buildFreshStartDates(dashboard || {}), [dashboard]);
  const model = dashboard?.revenueIntelligenceModel || null;
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
              <em>{readySignals}/{signals.length}</em>
              <small>{missingSignals} gaps</small>
            </article>
          </div>
        </header>

        <ClientKpiGrid
          dashboard={dashboard}
          signals={signals}
          selectedDate={selectedDate}
          otaRows={otaRows}
          competitorRows={competitorRows}
        />

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
