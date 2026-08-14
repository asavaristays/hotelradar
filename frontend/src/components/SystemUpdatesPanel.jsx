function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function formatDate(value) {
  if (!value) return 'Not selected';
  const raw = String(value).slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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

function ageMinutes(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
}

function healthTone(state) {
  const normalized = String(state || '').toLowerCase();
  if (normalized.includes('live') || normalized.includes('fresh')) return 'ready';
  if (normalized.includes('watch') || normalized.includes('aging') || normalized.includes('partial')) return 'supporting';
  return 'missing';
}

function rowTimestamp(rows = [], matcher) {
  const timestamps = rows
    .filter(matcher)
    .map((row) => row?.capturedAt || row?.observedAt || '')
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) return '';
  return new Date(Math.max(...timestamps)).toISOString();
}

function countRows(rows = [], matcher) {
  return rows.filter(matcher).length;
}

function countByPattern(rows = [], pattern) {
  return rows.filter((row) =>
    pattern.test(`${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''} ${row?.valueText || ''} ${row?.metadata?.eventType || ''} ${row?.metadata?.category || ''}`.toLowerCase()),
  ).length;
}

function buildHealthRows({ dashboard = null, status = null }) {
  const realtime = dashboard?.realtimeSignals || {};
  const rows = Array.isArray(realtime.rows) ? realtime.rows : [];
  const counts = realtime.counts || {};
  const latestCapture = realtime.latestCapturedAt || status?.lastSignalRefreshAt || '';
  const officialRate = numericOrNull(dashboard?.marketPosition?.hotelPrice);
  const marketAvg = numericOrNull(dashboard?.marketPosition?.marketAvg);
  const otaCount = Math.max(Number(counts.ota || 0), countRows(rows, (row) => row?.sourceType === 'ota'));
  const competitorCount = Math.max(Number(counts.competitor || 0), countRows(rows, (row) => row?.sourceType === 'competitor'));
  const eventCount = Math.max(Number(counts.event || 0), countByPattern(rows, /event|holiday|festival|weekend|rakhi|independence/));
  const miceCount = Math.max(Number(counts.mice || 0), countByPattern(rows, /mice|corporate|conference|offsite|expo|summit/));
  const weddingCount = Math.max(Number(counts.wedding || 0), countByPattern(rows, /wedding|marriage|bridal|banquet/));
  const travelCount = Math.max(Number(counts.airfare || 0), countByPattern(rows, /airfare|airport|arrival|tourism|travel|hotel_search|google_trends/));
  const freshCount = Number(counts.fresh || 0);
  const latestAge = ageMinutes(latestCapture);
  const captureState = freshCount > 0 ? 'Fresh' : rows.length ? 'Aging' : 'Not syncing';

  return [
    {
      parameter: 'Realtime capture engine',
      existing: rows.length ? `${rows.length} observations` : 'No observations',
      state: latestAge !== null && latestAge <= 90 ? 'Live' : captureState,
      lastUpdated: latestCapture,
      reason: latestCapture ? `${freshCount} fresh rows available for the selected property/date.` : 'No realtime observation has reached the dashboard yet.',
      nextAction: latestCapture ? 'Monitor the scheduled capture run.' : 'Run the capture job and inspect service logs.',
    },
    {
      parameter: 'Official booking rate',
      existing: officialRate ? formatCurrency(officialRate) : 'Not captured',
      state: officialRate ? 'Fresh' : 'Missing',
      lastUpdated: rowTimestamp(rows, (row) => row?.sourceType === 'official') || latestCapture,
      reason: officialRate ? 'Direct/property rate is available for the selected stay date.' : 'No own-hotel rate evidence exists for this date.',
      nextAction: officialRate ? 'Use as the base anchor for Revenue Intelligence.' : 'Capture booking-engine rate for the same stay date and occupancy.',
    },
    {
      parameter: 'OTA rate evidence',
      existing: otaCount ? `${otaCount} OTA rows` : 'No OTA rows',
      state: otaCount >= 2 ? 'Fresh' : otaCount ? 'Partial' : 'Not syncing',
      lastUpdated: rowTimestamp(rows, (row) => row?.sourceType === 'ota'),
      reason: otaCount ? 'OTA observations are available, but more channels improve confidence.' : 'Google Hotels / Agoda / Expedia / Booking evidence is not reaching the dashboard.',
      nextAction: otaCount >= 2 ? 'Keep hourly/twice-daily checks active.' : 'Enable OTA capture for Google Hotels and priority OTAs.',
    },
    {
      parameter: 'Competitor rate evidence',
      existing: competitorCount ? `${competitorCount} competitor rows` : 'No competitor rows',
      state: competitorCount >= 3 ? 'Fresh' : competitorCount ? 'Partial' : 'Not syncing',
      lastUpdated: rowTimestamp(rows, (row) => row?.sourceType === 'competitor'),
      reason: competitorCount ? 'Comp-set evidence exists for this property/date.' : 'No competitor price rows are available for the selected stay date.',
      nextAction: competitorCount >= 3 ? 'Review parity and market position.' : 'Add 3-7 comp-set hotels and capture comparable rates.',
    },
    {
      parameter: 'Market average / normalization',
      existing: marketAvg ? formatCurrency(marketAvg) : 'Unavailable',
      state: marketAvg ? 'Fresh' : 'Missing',
      lastUpdated: latestCapture,
      reason: marketAvg ? 'Market price can be calculated from available rate evidence.' : 'Market average is blocked until OTA/competitor rows exist.',
      nextAction: marketAvg ? 'Use for price-position view.' : 'Do not show zero; wait for valid normalized rate inputs.',
    },
    {
      parameter: 'Events and holiday pressure',
      existing: eventCount ? `${eventCount} signals` : 'No signals',
      state: eventCount ? 'Fresh' : 'Watch',
      lastUpdated: rowTimestamp(rows, (row) => row?.sourceType === 'event') || status?.lastSignalRefreshAt,
      reason: eventCount ? 'Calendar and event signals are feeding into the date story.' : 'No event/holiday row matched the current property/date.',
      nextAction: eventCount ? 'Use for stay-date highlights.' : 'Add important local/holiday dates before showing demand pressure.',
    },
    {
      parameter: 'Travel/search pressure',
      existing: travelCount ? `${travelCount} trend signals` : 'No trend signals',
      state: travelCount ? 'Fresh' : 'Not syncing',
      lastUpdated: rowTimestamp(rows, (row) => row?.sourceType === 'airfare'),
      reason: travelCount ? 'Search/travel pressure is available as supporting evidence.' : 'Google Trends / travel signal feed has no current observation for this property/date.',
      nextAction: travelCount ? 'Keep as supporting signal, not final price evidence.' : 'Check trend capture credentials, query set, and scheduler logs.',
    },
    {
      parameter: 'MICE / corporate pressure',
      existing: miceCount ? `${miceCount} signals` : 'No signals',
      state: miceCount ? 'Fresh' : 'Missing',
      lastUpdated: rowTimestamp(rows, (row) => /mice|corporate|conference|offsite|expo|summit/.test(`${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''}`.toLowerCase())),
      reason: miceCount ? 'Corporate/group pressure is separated from pricing evidence.' : 'No MICE source is currently contributing evidence.',
      nextAction: miceCount ? 'Pass qualified dates to sales team.' : 'Create MICE source list and ingestion rule.',
    },
    {
      parameter: 'Wedding demand pressure',
      existing: weddingCount ? `${weddingCount} signals` : 'No signals',
      state: weddingCount ? 'Fresh' : 'Missing',
      lastUpdated: rowTimestamp(rows, (row) => /wedding|marriage|bridal|banquet/.test(`${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''}`.toLowerCase())),
      reason: weddingCount ? 'Wedding demand is separated as a sales opportunity signal.' : 'No wedding/event venue source is currently contributing evidence.',
      nextAction: weddingCount ? 'Send dates/leads to banquet or sales owner.' : 'Add wedding venue/social/search capture before marking ready.',
    },
    {
      parameter: 'System status API',
      existing: status?.scrapeStatus || 'Available to check',
      state: errorState(status) ? 'Watch' : 'Live',
      lastUpdated: status?.systemTime || latestCapture,
      reason: status?.systemMessage || 'System status endpoint responded.',
      nextAction: 'Refresh status after every deployment or capture change.',
    },
  ];
}

function errorState(status) {
  const scrapeStatus = String(status?.scrapeStatus || '').toLowerCase();
  const message = String(status?.systemMessage || '').toLowerCase();
  return scrapeStatus.includes('error') || message.includes('error') || message.includes('failed');
}

function SummaryCard({ label, value, note, tone = 'ready' }) {
  return (
    <article className={`shSummaryCard shTone-${tone}`}>
      <span>{label}</span>
      <em>{value}</em>
      <small>{note}</small>
    </article>
  );
}

function resolvePropertyName(dashboard = null) {
  const directName =
    dashboard?.hotelName ||
    dashboard?.hotel?.hotelName ||
    dashboard?.propertyName ||
    dashboard?.marketContext?.hotelName ||
    '';
  if (directName) return directName;
  if (String(dashboard?.hotelId || '') === '10101010-1010-4010-8010-101010101010') {
    return 'The Ten Resort Siolim Goa';
  }
  return 'Selected property';
}

export default function SystemUpdatesPanel({
  status = null,
  dashboard = null,
  loading = false,
  error = '',
  onRefresh = null,
}) {
  const rows = buildHealthRows({ dashboard, status });
  const readyCount = rows.filter((row) => healthTone(row.state) === 'ready').length;
  const watchCount = rows.filter((row) => healthTone(row.state) === 'supporting').length;
  const missingCount = rows.filter((row) => healthTone(row.state) === 'missing').length;
  const selectedDate = dashboard?.marketContext?.checkinDate || '';
  const propertyName = resolvePropertyName(dashboard);
  const latestCapture = dashboard?.realtimeSignals?.latestCapturedAt || status?.lastSignalRefreshAt || '';

  return (
    <section className="shBoard" aria-label="Revenue Intelligence system health">
      <header className="shHeader">
        <div>
          <span>System Health</span>
          <h1>Realtime feed status and last update</h1>
          <p>
            This page explains which Revenue Intelligence inputs exist, when they last synced,
            and what is blocking a trusted recommendation.
          </p>
        </div>
        {typeof onRefresh === 'function' ? (
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        ) : null}
      </header>

      {error ? <p className="shError">{error}</p> : null}

      <div className="shSummaryGrid">
        <SummaryCard label="Property" value={propertyName} note={selectedDate ? `Stay date ${formatDate(selectedDate)}` : 'No stay date selected'} />
        <SummaryCard label="Latest realtime update" value={formatTimestamp(latestCapture)} note={latestCapture ? `${ageMinutes(latestCapture)} min age` : 'No timestamp received'} tone={latestCapture ? 'ready' : 'missing'} />
        <SummaryCard label="Ready feeds" value={`${readyCount}/${rows.length}`} note={`${watchCount} watch · ${missingCount} missing`} tone={missingCount ? 'supporting' : 'ready'} />
        <SummaryCard label="Decision policy" value="No zero fallback" note="Missing values stay Not captured / Unavailable" />
      </div>

      <section className="shPanel">
        <div className="shPanelHeader">
          <span>Feed health matrix</span>
          <p>Each row is a source or intelligence parameter used by the dashboard.</p>
        </div>

        <div className="shTable" role="table" aria-label="Realtime feed health table">
          <div className="shTableHead" role="row">
            <span>Parameter</span>
            <span>Existing data</span>
            <span>Sync state</span>
            <span>Last updated</span>
            <span>Reason</span>
            <span>Next action</span>
          </div>
          {rows.map((row) => (
            <article key={row.parameter} className="shTableRow" role="row">
              <span>{row.parameter}</span>
              <span>{row.existing}</span>
              <span><em className={`shState shTone-${healthTone(row.state)}`}>{row.state}</em></span>
              <span>{formatTimestamp(row.lastUpdated)}</span>
              <span>{row.reason}</span>
              <span>{row.nextAction}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
