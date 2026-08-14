const REVENUE_HORIZON_DAYS = 15;

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

function formatDate(value, options = {}) {
  if (!value) return 'Not selected';
  const raw = String(value).slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', {
    weekday: options.weekday || 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
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
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

function realtimeRows(dashboard = {}) {
  return Array.isArray(dashboard?.realtimeSignals?.rows) ? dashboard.realtimeSignals.rows : [];
}

function realtimeCount(dashboard = {}, key) {
  const fromSummary = dashboard?.realtimeSignals?.counts?.[key];
  if (Number.isFinite(Number(fromSummary))) return Number(fromSummary);
  return 0;
}

function countByPattern(rows = [], pattern) {
  return rows.filter((row) =>
    pattern.test(`${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''} ${row?.valueText || ''} ${row?.metadata?.eventType || ''} ${row?.metadata?.category || ''}`.toLowerCase()),
  ).length;
}

function buildImportantDates(dashboard = {}) {
  const selectedDate = String(dashboard?.marketContext?.checkinDate || currentIndiaDate()).slice(0, 10);
  const backendDates = Array.isArray(dashboard?.marketContext?.importantDates)
    ? dashboard.marketContext.importantDates
    : [];
  const horizonDates = Array.from({ length: REVENUE_HORIZON_DAYS }, (_, index) => addDays(selectedDate, index));

  const fixedDates = [
    {
      date: '2026-08-08',
      endDate: '2026-08-10',
      label: 'Weekend leisure window',
      driver: 'North Goa weekend leisure pickup',
      type: 'Weekend',
      action: 'Create direct weekend package and call repeat/leisure agents.',
      priority: 'Watch',
    },
    {
      date: '2026-08-15',
      endDate: '2026-08-17',
      label: 'Independence Day long weekend',
      driver: 'National holiday compression risk',
      type: 'Holiday',
      action: 'Protect BAR, close weak discounts, prepare minimum-stay option.',
      priority: 'High',
    },
    {
      date: '2026-08-28',
      endDate: '2026-08-30',
      label: 'Rakhi family travel window',
      driver: 'Family travel and weekend overlap',
      type: 'Holiday',
      action: 'Push family stay package and upsell suites/direct booking.',
      priority: 'Watch',
    },
  ];

  const mappedBackend = backendDates.map((entry) => ({
    date: String(entry.date || '').slice(0, 10),
    endDate: String(entry.endDate || entry.date || '').slice(0, 10),
    label: entry.label || entry.name || 'Market date',
    driver: entry.type || entry.source || 'Revenue pressure signal',
    type: entry.type || 'Event',
    action: 'Review rate fence, inventory control, and sales outreach for this date.',
    priority: entry.confidence === 'high' ? 'High' : 'Watch',
  })).filter((entry) => entry.date);

  const combined = [...mappedBackend, ...fixedDates];
  const unique = new Map(horizonDates.map((date, index) => [
    date,
    {
      date,
      endDate: date,
      label: index === 0 ? 'Selected stay date' : 'Stay-date evidence pending',
      driver: 'Awaiting verified rate and market evidence',
      type: 'Revenue review',
      action: 'Capture official, OTA and competitor rate proof before issuing a pricing recommendation.',
      priority: 'Data required',
    },
  ]));
  combined.forEach((entry) => {
    horizonDates.forEach((date) => {
      if (date < entry.date || date > (entry.endDate || entry.date)) return;
      const existing = unique.get(date);
      const shouldReplace =
        !existing ||
        existing.priority === 'Data required' ||
        entry.priority === 'High' ||
        (entry.priority === 'Watch' && existing.priority !== 'High');
      if (!shouldReplace) return;
      unique.set(date, {
        ...entry,
        date,
        endDate: entry.endDate || entry.date,
      });
    });
  });
  return horizonDates.map((date) => unique.get(date));
}

function buildOpportunityRows(dashboard = {}) {
  const rows = realtimeRows(dashboard);
  const otaCount = Math.max(Number(dashboard?.signalQuality?.otaLiveRows || 0), realtimeCount(dashboard, 'ota'));
  const competitorCount = Math.max(Number(dashboard?.signalQuality?.competitorRows || 0), realtimeCount(dashboard, 'competitor'));
  const officialRate = numericOrNull(dashboard?.marketPosition?.hotelPrice);
  const marketAvg = numericOrNull(dashboard?.marketPosition?.marketAvg);
  const selectedDate = String(dashboard?.marketContext?.checkinDate || currentIndiaDate()).slice(0, 10);
  const travelCount = Math.max(realtimeCount(dashboard, 'airfare'), countByPattern(rows, /airfare|airport|arrival|tourism|travel|google_trends/));
  const miceCount = Math.max(realtimeCount(dashboard, 'mice'), countByPattern(rows, /mice|corporate|conference|offsite|expo|summit/));
  const weddingCount = Math.max(realtimeCount(dashboard, 'wedding'), countByPattern(rows, /wedding|marriage|bridal|banquet/));

  const opportunities = [
    {
      date: selectedDate,
      opportunity: 'Rate integrity',
      signal: officialRate ? `Official rate ${formatCurrency(officialRate)}` : 'Official rate missing',
      evidence: officialRate ? 'Ready' : 'Missing',
      action: officialRate ? 'Use official rate as anchor for all sales and pricing review.' : 'Capture booking-engine rate before sending price guidance.',
      owner: 'Revenue',
      priority: officialRate ? 'Ready' : 'High',
    },
    {
      date: selectedDate,
      opportunity: 'OTA parity follow-up',
      signal: otaCount ? `${otaCount} OTA evidence rows` : 'OTA rate evidence missing',
      evidence: otaCount >= 2 ? 'Ready' : otaCount ? 'Partial' : 'Missing',
      action: otaCount >= 2 ? 'Compare direct rate against OTA and record parity gap.' : 'Capture Google Hotels, Agoda, Expedia and Booking rate for same stay date.',
      owner: 'E-commerce',
      priority: otaCount >= 2 ? 'Watch' : 'High',
    },
    {
      date: selectedDate,
      opportunity: 'Comp-set price position',
      signal: competitorCount ? `${competitorCount} competitor rows` : 'Competitor evidence missing',
      evidence: competitorCount >= 3 ? 'Ready' : competitorCount ? 'Partial' : 'Missing',
      action: competitorCount >= 3 ? `Review market average ${formatCurrency(marketAvg)} and update sales talking points.` : 'Add 3-7 comparable hotels and capture fresh rates.',
      owner: 'Revenue',
      priority: competitorCount >= 3 ? 'Watch' : 'High',
    },
    {
      date: selectedDate,
      opportunity: 'Travel demand',
      signal: travelCount ? `${travelCount} travel/search signals` : 'Travel/search signal missing',
      evidence: travelCount ? 'Supporting' : 'Missing',
      action: travelCount ? 'Use as supporting demand story for direct campaign and sales follow-up.' : 'Enable Google Trends / travel query capture for Goa and Siolim.',
      owner: 'Marketing',
      priority: travelCount ? 'Watch' : 'Medium',
    },
    {
      date: addDays(selectedDate, 7),
      opportunity: 'MICE / corporate groups',
      signal: miceCount ? `${miceCount} MICE signals` : 'No MICE signal yet',
      evidence: miceCount ? 'Supporting' : 'Missing',
      action: miceCount ? 'Assign corporate/offsite dates to sales owner.' : 'Create MICE source list and start monitoring offsites, conferences and corporate retreats.',
      owner: 'Sales',
      priority: miceCount ? 'Watch' : 'Medium',
    },
    {
      date: addDays(selectedDate, 14),
      opportunity: 'Wedding / social groups',
      signal: weddingCount ? `${weddingCount} wedding signals` : 'No wedding signal yet',
      evidence: weddingCount ? 'Supporting' : 'Missing',
      action: weddingCount ? 'Qualify wedding/social demand and prepare package outreach.' : 'Add wedding venue/social listing capture for North Goa.',
      owner: 'Sales',
      priority: weddingCount ? 'Watch' : 'Medium',
    },
  ];

  buildImportantDates(dashboard).forEach((date) => {
    opportunities.push({
      date: date.date,
      opportunity: date.type,
      signal: date.label,
      evidence: 'Supporting',
      action: date.action,
      owner: date.priority === 'High' ? 'Revenue' : 'Sales',
      priority: date.priority,
    });
  });

  return opportunities;
}

function toneFor(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('ready')) return 'ready';
  if (normalized.includes('partial') || normalized.includes('support') || normalized.includes('watch')) return 'supporting';
  if (normalized.includes('high')) return 'high';
  return 'missing';
}

export default function OpportunityPanel({ dashboard = null, loading = false, error = '' }) {
  const rows = dashboard ? buildOpportunityRows(dashboard) : [];
  const ready = rows.filter((row) => row.evidence === 'Ready').length;
  const supporting = rows.filter((row) => row.evidence === 'Supporting' || row.evidence === 'Partial').length;
  const missing = rows.filter((row) => row.evidence === 'Missing').length;

  if (loading) {
    return (
      <section className="opBoard" aria-label="Revenue opportunity table">
        <div className="opPanel"><p>Loading opportunity signals…</p></div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="opBoard" aria-label="Revenue opportunity table">
        <div className="opPanel"><p className="errorText">{error}</p></div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="opBoard" aria-label="Revenue opportunity table">
        <header className="opHeader">
          <div>
            <span>Opportunity</span>
            <h1>Select a property to open sales opportunities</h1>
            <p>Revenue signals will become a tabular action list for sales, marketing, e-commerce and revenue owners.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="opBoard" aria-label="Revenue opportunity table">
      <header className="opHeader">
        <div>
          <span>Opportunity</span>
          <h1>Revenue signal action table</h1>
          <p>
            A sales-ready view of rate, OTA, competitor, event, MICE, wedding and travel signals.
            It separates what is ready from what still needs capture.
          </p>
        </div>
        <div className="opHeaderStats">
          <article><span>Ready</span><em>{ready}</em></article>
          <article><span>Supporting</span><em>{supporting}</em></article>
          <article><span>Missing</span><em>{missing}</em></article>
        </div>
      </header>

      <section className="opPanel">
        <div className="opPanelHeader">
          <span>Sales-team signal register</span>
          <p>Assign owner and stage directly while reviewing the Revenue Intelligence story.</p>
        </div>

        <div className="opTable" role="table" aria-label="Opportunity signal table">
          <div className="opTableHead" role="row">
            <span>Stay date</span>
            <span>Opportunity</span>
            <span>Signal</span>
            <span>Evidence</span>
            <span>Recommended action</span>
            <span>Owner</span>
            <span>Stage</span>
          </div>
          {rows.map((row, index) => (
            <article key={`${row.date}-${row.opportunity}-${index}`} className="opTableRow" role="row">
              <span>{formatDate(row.date, { weekday: 'short' })}</span>
              <span>{row.opportunity}</span>
              <span>{row.signal}</span>
              <span><em className={`opState opTone-${toneFor(row.evidence)}`}>{row.evidence}</em></span>
              <span>{row.action}</span>
              <span>
                <select defaultValue={row.owner} aria-label={`Owner for ${row.opportunity}`}>
                  <option>Revenue</option>
                  <option>Sales</option>
                  <option>Marketing</option>
                  <option>E-commerce</option>
                  <option>GM</option>
                </select>
              </span>
              <span>
                <select defaultValue={row.priority === 'High' ? 'Action today' : 'Review'} aria-label={`Stage for ${row.opportunity}`}>
                  <option>Review</option>
                  <option>Action today</option>
                  <option>Assigned</option>
                  <option>Done</option>
                  <option>Waiting data</option>
                </select>
              </span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
