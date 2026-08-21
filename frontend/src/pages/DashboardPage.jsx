import { useEffect, useRef, useState } from 'react';
import AlertsPanel from '../components/AlertsPanel.jsx';
import BetaAcceptanceModal from '../components/BetaAcceptanceModal.jsx';
import CompressionAlert from '../components/CompressionAlert.jsx';
import CompetitorPanel from '../components/CompetitorPanel.jsx';
import Dashboard from '../components/Dashboard.jsx';
import DemandForecast from '../components/DemandForecast.jsx';
import HotelSelector from '../components/HotelSelector.jsx';
import MarketDemandCockpit from '../components/MarketDemandCockpit.jsx';
import MorningBrief from '../components/MorningBrief.jsx';
import OpportunityPanel from '../components/OpportunityPanel.jsx';
import PositionMeter from '../components/PositionMeter.jsx';
import PropertyOnboardingPanel from '../components/PropertyOnboardingPanel.jsx';
import RadarScore from '../components/RadarScore.jsx';
import RevenueAdviceCard from '../components/RevenueAdviceCard.jsx';
import SignalInputPanel from '../components/SignalInputPanel.jsx';
import SystemUpdatesPanel from '../components/SystemUpdatesPanel.jsx';
import { getSystemStatus } from '../services/intelligenceApi.js';
import { parseServerError as parseHttpServerError, readResponseBody } from '../http.js';

const ADMIN_INSIGHT_OPTIONS = [
  { value: 'market-demand', label: 'Market Demand Cockpit' },
  { value: 'radar-score', label: 'RADAR Score' },
  { value: 'morning-brief', label: 'WhatsApp Morning Brief' },
  { value: 'demand-forecast', label: 'Demand Forecast' },
  { value: 'compression-alert', label: 'Market Compression Alert' },
  { value: 'revenue-advice', label: 'AI Revenue Advice' },
  { value: 'market-position', label: 'Market Position Meter' },
  { value: 'intelligence-alerts', label: 'Intelligence Alerts' },
  { value: 'competitors', label: 'Competitor Intelligence' },
];
const HOTELRADAR_FOCUS_KEY = 'hotelradar_focus_insight';
const DASHBOARD_WORKSPACE_KEY = 'dashboard_workspace_target';
const DEFAULT_PROPERTY_ID = '10101010-1010-4010-8010-101010101010';

function currentIndiaStayDate() {
  return indiaDateOffset(0);
}

function indiaDateOffset(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offsetDays || 0));
  return date.toISOString().slice(0, 10);
}

function defaultPilotStayDate() {
  return indiaDateOffset(1);
}

const WORKSPACE_SECTIONS = [
  { value: 'hotelradar', label: 'Revenue Intelligence', icon: 'chart' },
  { value: 'ota-watch', label: 'OTA Watch', icon: 'ota' },
  { value: 'opportunity', label: 'Opportunity', icon: 'opportunity' },
  { value: 'revenue-report', label: 'Revenue Report', icon: 'report' },
  { value: 'signal-input', label: 'Signal Input', icon: 'signal', adminOnly: true },
  { value: 'admin-control', label: 'Add Property', icon: 'property', adminOnly: true },
  { value: 'listed-hotels', label: 'Listed Hotels', icon: 'list', adminOnly: true },
  { value: 'system-updates', label: 'System Health', icon: 'health', adminOnly: true },
];

const NAV_ICON_PATHS = {
  chart: 'M4 19h16M7 16V9m5 7V5m5 11v-6',
  ota: 'M4 7h16M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M8 11h8M8 15h5',
  opportunity: 'M12 3v4m0 10v4M5 12H3m18 0h-2M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8',
  report: 'M6 3h9l3 3v15H6V3m8 0v4h4M9 10h6M9 14h6M9 18h4',
  signal: 'M4 18h4l3-12 4 12 2-7h3M4 6h3m10 0h3',
  property: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  health: 'M4 13h4l2-6 4 12 2-6h4',
  logout: 'M10 17l5-5-5-5M15 12H3m9 7h6a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-6',
};

function NavIcon({ type }) {
  return (
    <span className="premiumNavIcon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={NAV_ICON_PATHS[type] || NAV_ICON_PATHS.chart} />
      </svg>
    </span>
  );
}

function workspaceNumericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function workspaceFormatCurrency(value) {
  const amount = workspaceNumericOrNull(value);
  if (amount === null || amount <= 0) return 'Not captured';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function workspaceFormatDate(value) {
  if (!value) return 'Not selected';
  const raw = String(value).slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function workspaceFormatTimestamp(value) {
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

function workspaceFormatPct(value) {
  const parsed = workspaceNumericOrNull(value);
  if (parsed === null) return 'Not captured';
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(1)}%`;
}

function workspaceNormalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function workspaceApprovedCompSet(dashboard = {}) {
  const raw =
    dashboard?.approvedCompSet ||
    dashboard?.hotel?.approvedCompSet ||
    dashboard?.marketContext?.approvedCompSet ||
    [];
  return Array.isArray(raw) ? raw.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function workspaceMatchesName(name = '', approvedName = '') {
  const rowKey = workspaceNormalizeName(name);
  const approvedKey = workspaceNormalizeName(approvedName);
  if (!rowKey || !approvedKey) return false;
  return rowKey === approvedKey || rowKey.includes(approvedKey) || approvedKey.includes(rowKey);
}

function workspaceRealtimeRows(dashboard = {}) {
  return Array.isArray(dashboard?.realtimeSignals?.rows) ? dashboard.realtimeSignals.rows : [];
}

function isWorkspaceSource(row = {}, type = '') {
  const haystack = `${row?.sourceType || ''} ${row?.signalType || ''} ${row?.sourceName || ''}`.toLowerCase();
  if (type === 'official') {
    return row?.sourceType === 'official' || /official|own rate|direct rate|booking engine/.test(haystack);
  }
  if (type === 'ota') {
    return row?.sourceType === 'ota' || /ota|agoda|booking|expedia|mmt|makemytrip|google hotels|hotels\.com|trivago/.test(haystack);
  }
  if (type === 'competitor') {
    return row?.sourceType === 'competitor' || row?.signalType === 'competitor_rate' || /competitor/.test(haystack);
  }
  return false;
}

function rowRateValue(row = {}) {
  return workspaceNumericOrNull(row?.valueNumeric ?? row?.rate ?? row?.price);
}

function rowProofUrl(row = {}) {
  return String(row?.proofUrl || row?.sourceUrl || row?.url || row?.metadata?.proofUrl || '').trim();
}

function rowObservedAt(row = {}) {
  return row?.observedAt || row?.capturedAt || row?.updatedAt || row?.createdAt || '';
}

function buildOtaWatchWorkspace(dashboard = null, selectedDate = '') {
  const safeDashboard = dashboard || {};
  const stayDate = String(selectedDate || safeDashboard?.marketContext?.checkinDate || '').slice(0, 10);
  const modelWatch = safeDashboard?.revenueIntelligenceModel?.otaWatch || {};
  const rowsForDate = workspaceRealtimeRows(safeDashboard).filter((row) => {
    const rowDate = String(row?.checkinDate || row?.stayDate || row?.date || '').slice(0, 10);
    return !stayDate || !rowDate || rowDate === stayDate;
  });
  const officialRows = rowsForDate.filter((row) => isWorkspaceSource(row, 'official'));
  const otaRows = rowsForDate.filter((row) => isWorkspaceSource(row, 'ota'));
  const competitorRows = rowsForDate.filter((row) => isWorkspaceSource(row, 'competitor'));
  const officialRow = officialRows
    .map((row) => ({ row, rate: rowRateValue(row) }))
    .filter((entry) => entry.rate !== null && entry.rate > 0)
    .sort((left, right) => right.rate - left.rate)[0]?.row || officialRows[0] || null;
  const otaRateRows = otaRows
    .map((row) => ({ row, rate: rowRateValue(row) }))
    .filter((entry) => entry.rate !== null && entry.rate > 0)
    .sort((left, right) => left.rate - right.rate);
  const lowestOta = otaRateRows[0] || null;
  const ownRate = rowRateValue(officialRow || {}) ?? workspaceNumericOrNull(safeDashboard?.marketPosition?.hotelPrice);
  const lowestOtaRate = lowestOta?.rate ?? workspaceNumericOrNull(modelWatch?.lowestOtaRate);
  const gapPct = workspaceNumericOrNull(modelWatch?.gapPct) ?? (
    ownRate !== null && lowestOtaRate !== null && lowestOtaRate > 0
      ? ((ownRate - lowestOtaRate) / lowestOtaRate) * 100
      : null
  );
  const channelNames = Array.from(new Set([
    ...(Array.isArray(modelWatch?.channels) ? modelWatch.channels : []),
    ...otaRows.map((row) => String(row?.sourceName || '').trim()).filter(Boolean),
  ]));
  const discountRows = otaRows.filter((row) =>
    /discount|promo|coupon|deal|member|genius|mobile|breakfast|free cancellation|flash/i.test(`${row?.valueText || ''} ${row?.sourceName || ''} ${JSON.stringify(row?.metadata || {})}`));
  const approved = workspaceApprovedCompSet(safeDashboard);
  const approvedCompetitors = (approved.length ? approved : competitorRows.map((row) => row?.sourceName).filter(Boolean)).map((name) => {
    const captured = competitorRows
      .filter((row) => workspaceMatchesName(row?.sourceName || row?.metadata?.competitorName || '', name))
      .map((row) => ({ row, rate: rowRateValue(row) }))
      .filter((entry) => entry.rate !== null && entry.rate > 0)
      .sort((left, right) => left.rate - right.rate)[0];
    return {
      name,
      rate: captured?.rate ?? null,
      proofUrl: captured ? rowProofUrl(captured.row) : '',
      observedAt: captured ? rowObservedAt(captured.row) : '',
      status: captured ? (rowProofUrl(captured.row) ? 'Captured' : 'Proof pending') : 'Capture needed',
    };
  });
  const proofReadyCount = [
    ownRate && rowProofUrl(officialRow || {}),
    lowestOtaRate && lowestOta && rowProofUrl(lowestOta.row),
    approvedCompetitors.filter((row) => row.rate && row.proofUrl).length >= 3,
  ].filter(Boolean).length;
  const directHigher = gapPct !== null && gapPct > 8;
  const headline = directHigher
    ? 'Direct public rate appears higher than the lowest visible OTA rate.'
    : gapPct !== null && gapPct < -8
      ? 'Direct public rate appears lower than OTA; protect rate before discounting.'
      : gapPct !== null
        ? 'OTA parity looks controlled, but proof and basis still need review.'
        : 'Capture official and OTA rates to calculate leakage.';
  const action = directHigher
    ? 'Check direct booking price, OTA promotions, tax/fee display and parity before the morning report.'
    : 'Keep OTA proof fresh with source URL, timestamp, room basis, meal plan and cancellation basis.';

  const operationsRows = [
    {
      key: 'official-rate',
      type: 'Own public rate',
      source: officialRow?.sourceName || 'Official booking engine',
      rate: ownRate,
      status: ownRate ? (rowProofUrl(officialRow || {}) ? 'Captured' : 'Proof pending') : 'Missing',
      proofUrl: rowProofUrl(officialRow || {}),
      observedAt: rowObservedAt(officialRow || {}),
      note: ownRate ? 'Confirm tax, meal plan, occupancy and cancellation basis.' : 'Capture own booking-engine/direct rate first.',
    },
    ...(otaRateRows.length ? otaRateRows.slice(0, 6).map(({ row, rate }, index) => ({
      key: `ota-${row?.sourceName || index}-${rate}`,
      type: index === 0 ? 'Lowest OTA rate' : 'OTA rate',
      source: row?.sourceName || 'OTA source',
      rate,
      status: rowProofUrl(row) ? 'Captured' : 'Proof pending',
      proofUrl: rowProofUrl(row),
      observedAt: rowObservedAt(row),
      note: /discount|promo|coupon|deal|member|genius|mobile/i.test(`${row?.valueText || ''} ${JSON.stringify(row?.metadata || {})}`)
        ? 'Discount / promotion visible; verify if hotel authorized it.'
        : (row?.valueText || 'Check parity, inclusion and cancellation basis.'),
    })) : [{
      key: 'ota-missing',
      type: 'Lowest OTA rate',
      source: 'Google Hotels / Agoda / Booking / MMT',
      rate: null,
      status: 'Missing',
      proofUrl: '',
      observedAt: '',
      note: 'Capture at least one public OTA rate for the selected stay date.',
    }]),
  ];

  return {
    hotelName: safeDashboard?.hotelName || safeDashboard?.name || 'Selected hotel',
    market: safeDashboard?.marketContext?.city || safeDashboard?.city || 'Market',
    stayDate,
    ownRate,
    lowestOtaRate,
    gapPct,
    channelNames,
    discountRows,
    approvedCompetitors,
    operationsRows,
    proofReadyCount,
    headline,
    action,
    autoRefreshCopy: 'Dashboard reloads every 5 minutes while open. Use Refresh OTA Watch before approving the 10:00 AM report.',
  };
}

function OtaWatchWorkspacePanel({
  dashboard = null,
  selectedDate = '',
  loading = false,
  error = '',
  recalcInProgress = false,
  onRefresh = () => {},
  onOpenSignalInput = () => {},
}) {
  const watch = buildOtaWatchWorkspace(dashboard, selectedDate);
  const gapTone = watch.gapPct === null ? 'missing' : watch.gapPct > 8 ? 'risk' : watch.gapPct < -8 ? 'opportunity' : 'controlled';

  return (
    <section className="otaWatchWorkspace" aria-label="OTA Watch">
      <div className="otaWatchHero">
        <div>
          <span className="workspaceEyebrow">OTA Watch</span>
          <h1>Public-rate leakage desk for OTA parity, discount watch and competitor capture.</h1>
          <p>{watch.hotelName} · {watch.market}{watch.stayDate ? ` · ${workspaceFormatDate(watch.stayDate)}` : ''}</p>
        </div>
        <div className="otaWatchHeroActions">
          <button type="button" className="secondaryButton" onClick={onRefresh} disabled={loading || recalcInProgress || !dashboard}>
            {recalcInProgress ? 'Refreshing…' : 'Refresh OTA Watch'}
          </button>
          <button type="button" className="secondaryButton" onClick={onOpenSignalInput}>
            Add manual capture
          </button>
        </div>
      </div>

      {error ? <p className="errorText">{error}</p> : null}

      <div className="otaWatchKpiGrid">
        <article>
          <span>Own public rate</span>
          <strong>{workspaceFormatCurrency(watch.ownRate)}</strong>
          <small>{watch.ownRate ? 'Captured / review basis' : 'Capture needed'}</small>
        </article>
        <article>
          <span>Lowest OTA visible</span>
          <strong>{workspaceFormatCurrency(watch.lowestOtaRate)}</strong>
          <small>{watch.channelNames.length ? watch.channelNames.slice(0, 2).join(', ') : 'No channel row'}</small>
        </article>
        <article className={`otaWatchGapCard otaWatchGap-${gapTone}`}>
          <span>Public gap</span>
          <strong>{workspaceFormatPct(watch.gapPct)}</strong>
          <small>{gapTone === 'risk' ? 'Direct higher than OTA' : gapTone === 'controlled' ? 'Parity watch' : gapTone === 'opportunity' ? 'Direct lower than OTA' : 'Not calculated'}</small>
        </article>
        <article>
          <span>Discount watch</span>
          <strong>{watch.discountRows.length}</strong>
          <small>{watch.discountRows.length ? 'promo notes visible' : 'No promo note captured'}</small>
        </article>
      </div>

      <section className="otaWatchCommand">
        <div>
          <span>Current hotel status</span>
          <h2>{watch.headline}</h2>
          <p>{watch.action}</p>
          <small>{watch.autoRefreshCopy}</small>
        </div>
        <article>
          <span>Proof readiness</span>
          <strong>{watch.proofReadyCount}/3</strong>
          <small>own · OTA · comp-set</small>
        </article>
      </section>

      <section className="otaWatchPanel">
        <div className="otaWatchSectionHeader">
          <span>Capture queue</span>
          <p>Manual or automated rows must carry rate, source URL and capture timestamp before they are trusted.</p>
        </div>
        <div className="otaWatchTable" role="table" aria-label="OTA capture queue">
          <div className="otaWatchTableHead" role="row">
            <span>Evidence</span>
            <span>Rate</span>
            <span>Status</span>
            <span>Proof</span>
            <span>Operator note</span>
          </div>
          {watch.operationsRows.map((row) => (
            <article key={row.key} role="row" className={`otaWatchRow otaWatchStatus-${String(row.status).toLowerCase().replace(/[^a-z]+/g, '-')}`}>
              <span>
                <strong>{row.type}</strong>
                <small>{row.source} · {workspaceFormatTimestamp(row.observedAt)}</small>
              </span>
              <span>{workspaceFormatCurrency(row.rate)}</span>
              <em>{row.status}</em>
              <span>
                {row.proofUrl ? (
                  <a href={row.proofUrl} target="_blank" rel="noreferrer">View source</a>
                ) : (
                  <small>Pending</small>
                )}
              </span>
              <span>{row.note}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="otaWatchPanel">
        <div className="otaWatchSectionHeader">
          <span>Approved competitor capture</span>
          <p>Only approved comp-set competitors are used for market position. Others remain public references.</p>
        </div>
        <div className="otaWatchCompetitorGrid">
          {watch.approvedCompetitors.length ? watch.approvedCompetitors.map((row) => (
            <article key={row.name} className={`otaWatchCompCard ${row.rate ? 'captured' : 'missing'}`}>
              <div>
                <strong>{row.name}</strong>
                <small>{row.status} · {workspaceFormatTimestamp(row.observedAt)}</small>
              </div>
              <span>{workspaceFormatCurrency(row.rate)}</span>
              {row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer">View source</a> : <em>Add source</em>}
            </article>
          )) : (
            <article className="otaWatchCompCard missing">
              <div>
                <strong>No approved competitors configured</strong>
                <small>Add approved comp-set during onboarding before competitor analysis is trusted.</small>
              </div>
              <span>Not captured</span>
              <em>Pending</em>
            </article>
          )}
        </div>
      </section>

      <section className="otaWatchPanel otaWatchWorkflow">
        <div className="otaWatchSectionHeader">
          <span>Morning operating flow</span>
          <p>Use this page before the daily PDF/email goes out.</p>
        </div>
        <div>
          <article><strong>1</strong><span>Capture own official rate for the selected stay date.</span></article>
          <article><strong>2</strong><span>Capture lowest OTA rate, offer notes, proof URL and timestamp.</span></article>
          <article><strong>3</strong><span>Capture approved comp-set rates only; reject outliers and unmatched basis.</span></article>
          <article><strong>4</strong><span>Refresh OTA Watch, then approve Revenue Intelligence report/email.</span></article>
        </div>
      </section>
    </section>
  );
}

function RevenueReportPanel({ dashboard = null, selectedDate = '' }) {
  const hotelName = dashboard?.hotelName || dashboard?.name || 'Selected hotel';
  const city = dashboard?.marketContext?.city || dashboard?.city || 'Market';
  const stayDate = selectedDate || dashboard?.marketContext?.checkinDate || '';
  const baselineRows = [
    ['Rooms sold', 'Hotel-provided daily actuals', 'Required'],
    ['Room revenue', 'Hotel-provided daily actuals', 'Required'],
    ['OTA revenue', 'Hotel / accounts / OTA statement', 'Required'],
    ['Direct revenue', 'Website, phone, WhatsApp, walk-in', 'Required'],
    ['OTA commission paid', 'OTA statement or commission assumption', 'Recommended'],
    ['Cancellations / no-shows', 'By channel if available', 'Recommended'],
  ];
  const leakageRows = [
    ['OTA commission exposure', 'OTA revenue × effective commission %', 'Shows profit leakage through OTA dependence'],
    ['Direct booking shift', 'Current direct revenue vs baseline', 'Shows whether direct channel is improving'],
    ['OTA dependency', 'OTA revenue ÷ total room revenue', 'Shows if OTA is channel or oxygen'],
    ['Net OTA revenue', 'OTA revenue minus commission and promotion cost', 'Shows true retained value'],
    ['Revenue action proof', 'Recommendation → execution → result', 'Protects HotelRADAR value attribution'],
    ['Direct booking leakage', 'Brand search, website, booking-engine and parity gaps', 'Explains why direct booking is not converting'],
  ];

  return (
    <section className="revenueReportShell" aria-label="Revenue Report">
      <div className="revenueReportHero">
        <div>
          <span className="workspaceEyebrow">Revenue Report</span>
          <h1>Fortnight actuals will prove leakage reduction, not just show market analytics.</h1>
          <p>
            HotelRADAR can start without PMS or channel-manager credentials. The hotel shares a simple fortnight Excel sheet,
            and we compare actual performance against market intelligence, OTA exposure and direct-booking leakage.
          </p>
          <small>{hotelName} · {city}{stayDate ? ` · selected stay date ${stayDate}` : ''}</small>
        </div>
        <article>
          <span>Cadence</span>
          <strong>15 days</strong>
          <small>baseline → actuals → leakage review</small>
        </article>
      </div>

      <div className="revenueReportGrid">
        <article className="revenueReportCard">
          <span>Why this protects HotelRADAR</span>
          <h2>Day-0 baseline becomes the proof anchor.</h2>
          <p>
            If business improves later, we can compare against the hotel-provided baseline instead of debating whether the uplift came from season,
            OTA, team effort or HotelRADAR recommendations.
          </p>
        </article>
        <article className="revenueReportCard">
          <span>No password required</span>
          <h2>Excel first, connector later.</h2>
          <p>
            PMS/channel-manager access remains optional. Once the hotel trusts the reporting, the same fields can be automated through connectors.
          </p>
        </article>
        <article className="revenueReportCard">
          <span>Client claim guardrail</span>
          <h2>No baseline, no confirmed uplift claim.</h2>
          <p>
            Without hotel actuals we only report observable public-market leakage. With actuals, we can report verified reduction in OTA dependency,
            commission exposure and direct-booking shift.
          </p>
        </article>
      </div>

      <section className="revenueReportPanel">
        <div className="revenueReportSectionHeader">
          <span>Minimum baseline data</span>
          <p>Ask the hotel to fill these fields for the last 3 months, then every fortnight.</p>
        </div>
        <div className="revenueReportTable" role="table" aria-label="Revenue report baseline data">
          <div className="revenueReportTableHead" role="row">
            <span>Metric</span>
            <span>Source</span>
            <span>Status</span>
          </div>
          {baselineRows.map((row) => (
            <article key={row[0]} role="row">
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <em>{row[2]}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="revenueReportPanel">
        <div className="revenueReportSectionHeader">
          <span>Leakage matrix</span>
          <p>These are the metrics the Revenue Report will calculate from the hotel Excel.</p>
        </div>
        <div className="revenueReportTable revenueReportLeakageTable" role="table" aria-label="Revenue leakage matrix">
          <div className="revenueReportTableHead" role="row">
            <span>Metric</span>
            <span>Formula / logic</span>
            <span>Business meaning</span>
          </div>
          {leakageRows.map((row) => (
            <article key={row[0]} role="row">
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="revenueReportPanel revenueReportWorkflow">
        <div className="revenueReportSectionHeader">
          <span>Fortnight workflow</span>
          <p>How this becomes a repeatable operating rhythm.</p>
        </div>
        <div>
          <article><strong>1</strong><span>Hotel sends Excel baseline / actuals.</span></article>
          <article><strong>2</strong><span>HotelRADAR imports and validates data completeness.</span></article>
          <article><strong>3</strong><span>System compares actuals with market pressure and prior recommendations.</span></article>
          <article><strong>4</strong><span>Revenue Report shows OTA leakage, direct-booking shift and next action.</span></article>
        </div>
      </section>
    </section>
  );
}

export default function DashboardPage({ session, onLogout, onNavigate }) {
  const defaultPropertyLoadStarted = useRef(false);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [selectedCheckinDate, setSelectedCheckinDate] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hotelListVersion, setHotelListVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [recalcJob, setRecalcJob] = useState(null);
  const [betaModalOpen, setBetaModalOpen] = useState(false);
  const [betaAcceptLoading, setBetaAcceptLoading] = useState(false);
  const [betaAcceptError, setBetaAcceptError] = useState('');
  const [pendingHotelId, setPendingHotelId] = useState('');
  const [selectedInsight, setSelectedInsight] = useState(ADMIN_INSIGHT_OPTIONS[0].value);
  const [showFocusedInsight, setShowFocusedInsight] = useState(false);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState('hotelradar');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 1024;
  });
  const [systemStatus, setSystemStatus] = useState(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);
  const [systemStatusError, setSystemStatusError] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const nextWorkspace = localStorage.getItem(DASHBOARD_WORKSPACE_KEY);
      const nextFocus = localStorage.getItem(HOTELRADAR_FOCUS_KEY);
      if (nextWorkspace === 'admin-control' || nextWorkspace === 'listed-hotels' || nextWorkspace === 'system-updates' || nextWorkspace === 'hotelradar' || nextWorkspace === 'ota-watch' || nextWorkspace === 'opportunity' || nextWorkspace === 'revenue-report' || nextWorkspace === 'signal-input') {
        setActiveWorkspaceSection(nextWorkspace);
      }
      if (nextFocus) {
        const isSupportedInsight = ADMIN_INSIGHT_OPTIONS.some((option) => option.value === nextFocus);
        if (isSupportedInsight) {
          setActiveWorkspaceSection('hotelradar');
          setSelectedInsight(nextFocus);
          setShowFocusedInsight(true);
        }
      }
      localStorage.removeItem(DASHBOARD_WORKSPACE_KEY);
      localStorage.removeItem(HOTELRADAR_FOCUS_KEY);
    } catch {
      // ignore storage failures and keep the default workspace state
    }
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeWorkspaceSection]);

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
    const role = String(session?.user?.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') return undefined;

    let active = true;

    async function loadSystemStatus() {
      setSystemStatusLoading(true);
      setSystemStatusError('');
      try {
        const nextStatus = await getSystemStatus(session.token);
        if (!active) return;
        setSystemStatus(nextStatus);
      } catch (loadError) {
        if (!active) return;
        setSystemStatus(null);
        setSystemStatusError(loadError.message || 'Unable to load system updates.');
      } finally {
        if (active) {
          setSystemStatusLoading(false);
        }
      }
    }

    loadSystemStatus();
    return () => {
      active = false;
    };
  }, [session]);

  async function handleRefreshSystemStatus() {
    try {
      setSystemStatusLoading(true);
      setSystemStatusError('');
      const nextStatus = await getSystemStatus(session.token);
      setSystemStatus(nextStatus);
    } catch (loadError) {
      setSystemStatus(null);
      setSystemStatusError(loadError.message || 'Unable to load system updates.');
    } finally {
      setSystemStatusLoading(false);
    }
  }

  function normalizeDateInput(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function buildDashboardUrl(hotelId, checkinDate = '') {
    const params = new URLSearchParams();
    const safeDate = normalizeDateInput(checkinDate);
    if (safeDate) params.set('checkin_date', safeDate);
    const query = params.toString();
    return `/hotel/${encodeURIComponent(hotelId)}/dashboard${query ? `?${query}` : ''}`;
  }

  async function fetchCompetitiveGrid(hotelId, checkinDate = '') {
    const params = new URLSearchParams();
    const safeDate = normalizeDateInput(checkinDate);
    if (safeDate) params.set('checkin_date', safeDate);
    const response = await fetch(
      `/hotel/${encodeURIComponent(hotelId)}/competitive-grid${params.size ? `?${params.toString()}` : ''}`,
      {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
      },
    );

    if (!response.ok) {
      return [];
    }
    const body = await readResponseBody(response);
    const payload = body.json;
    return Array.isArray(payload) ? payload : [];
  }

  async function parseServerError(response, fallbackPrefix) {
    return parseHttpServerError(response, fallbackPrefix);
  }

  function markLegalAcceptanceRequired(hotelId = '') {
    setPendingHotelId(String(hotelId || selectedHotelId || dashboard?.hotelId || '').trim());
    setBetaAcceptError('');
    setBetaModalOpen(true);
    setRecalcJob((prev) => (prev ? { ...prev, status: 'blocked' } : prev));
    setError('User Error: Beta legal acceptance required before dashboard access.');
  }

  async function loadDashboard(hotelIdOverride = '', checkinDateOverride = '') {
    const overrideId = typeof hotelIdOverride === 'string' ? hotelIdOverride : '';
    const hotelId = String(overrideId || selectedHotelId || '').trim();
    const activeDate = normalizeDateInput(checkinDateOverride || selectedCheckinDate || '');
    if (!hotelId) return;

    setLoading(true);
    setError('');
    try {
      const dashboardRes = await fetch(buildDashboardUrl(hotelId, activeDate), {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (dashboardRes.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        return;
      }
      if (!dashboardRes.ok) {
        const parsed = await parseServerError(dashboardRes, 'Unable to load dashboard');
        throw new Error(parsed.message);
      }
      const body = await readResponseBody(dashboardRes);
      const dashboardJson = body.json;
      if (!Array.isArray(dashboardJson?.competitiveGrid) || dashboardJson.competitiveGrid.length <= 1) {
        const fallbackGrid = await fetchCompetitiveGrid(hotelId, activeDate);
        if (fallbackGrid.length) {
          dashboardJson.competitiveGrid = fallbackGrid;
        }
      }
      setDashboard(dashboardJson);
      const responseDate = normalizeDateInput(dashboardJson?.marketContext?.checkinDate || '');
      setSelectedCheckinDate(activeDate || responseDate);
      if (hotelId !== selectedHotelId) {
        setSelectedHotelId(hotelId);
      }
    } catch (err) {
      setDashboard(null);
      setError(err.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  async function waitForRecalculationCompletion(hotelId, jobId, checkinDate = '') {
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusRes = await fetch(
        `/hotel/${encodeURIComponent(hotelId)}/recalculate-jobs/${encodeURIComponent(jobId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      );

      if (statusRes.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        throw new Error('User Error: Beta legal acceptance required before dashboard access.');
      }
      if (!statusRes.ok) {
        const parsed = await parseServerError(statusRes, 'Unable to fetch recalculation status');
        throw new Error(parsed.message);
      }

      const body = await readResponseBody(statusRes);
      const statusPayload = body.json;
      setRecalcJob(statusPayload);

      if (statusPayload.status === 'completed') {
        await loadDashboard(hotelId, checkinDate);
        return;
      }

      if (statusPayload.status === 'failed') {
        throw new Error(statusPayload.errorMessage || 'Recalculation failed.');
      }
    }

    throw new Error('Recalculation is taking longer than expected. Please retry.');
  }

  async function handleRecalculate(hotelIdOverride = '', options = {}) {
    const hotelId = String(hotelIdOverride || selectedHotelId || dashboard?.hotelId || '').trim();
    const activeDate = normalizeDateInput(selectedCheckinDate || dashboard?.marketContext?.checkinDate || '');
    const manualOverrides = options?.manualSignalOverrides || null;
    if (!hotelId) return;

    setError('');
    setRecalcJob({ status: 'queued', hotelId, attempts: 0, maxAttempts: 3 });

    try {
      const response = await fetch(`/hotel/${encodeURIComponent(hotelId)}/recalculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggered_by: 'manual',
          source: 'dashboard-ui',
          ...(activeDate ? { checkin_date: activeDate } : {}),
          ...(manualOverrides ? { manual_signal_overrides: manualOverrides } : {}),
        }),
      });

      if (response.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        throw new Error('User Error: Beta legal acceptance required before dashboard access.');
      }
      if (response.status === 202) {
        const body = await readResponseBody(response);
        const payload = body.json;
        setRecalcJob({
          id: payload.jobId,
          status: payload.status || 'queued',
          hotelId,
          attempts: 0,
          maxAttempts: 3,
        });
        await waitForRecalculationCompletion(hotelId, payload.jobId, activeDate);
        setRecalcJob((prev) => ({
          ...(prev || {}),
          status: 'completed',
        }));
        return;
      }

      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to trigger recalculation');
        throw new Error(parsed.message);
      }

      // Backward-compatible sync fallback.
      const body = await readResponseBody(response);
      const dashboardJson = body.json;
      setDashboard(dashboardJson);
      const responseDate = normalizeDateInput(dashboardJson?.marketContext?.checkinDate || '');
      setSelectedCheckinDate(activeDate || responseDate);
      setRecalcJob({ status: 'completed', hotelId });
    } catch (err) {
      setRecalcJob((prev) => ({
        ...(prev || {}),
        status: 'failed',
      }));
      setError(err.message || 'Unable to trigger recalculation.');
    }
  }

  useEffect(() => {
    const role = session?.user?.role;
    const assignedHotels = Array.isArray(session?.user?.hotels) ? session.user.hotels : [];
    if (role !== 'hotel_user') return;
    if (assignedHotels.length !== 1) return;
    if (selectedHotelId || loading || dashboard) return;
    loadDashboard(assignedHotels[0]);
  }, [session, selectedHotelId, loading, dashboard]);

  useEffect(() => {
    const role = String(session?.user?.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') return;
    if (selectedHotelId || loading || dashboard || defaultPropertyLoadStarted.current) return;

    defaultPropertyLoadStarted.current = true;
    const stayDate = defaultPilotStayDate();
    setSelectedHotelId(DEFAULT_PROPERTY_ID);
    setSelectedCheckinDate(stayDate);
    loadDashboard(DEFAULT_PROPERTY_ID, stayDate);
  }, [session, selectedHotelId, loading, dashboard]);

  useEffect(() => {
    if (!selectedHotelId || !selectedCheckinDate || !dashboard) return undefined;
    const timer = window.setInterval(() => {
      loadDashboard(selectedHotelId, selectedCheckinDate);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [selectedHotelId, selectedCheckinDate, Boolean(dashboard)]);

  function handleHotelCreated(payload) {
    const hotelId = payload?.hotelId || '';
    const hotelName = payload?.hotelName || 'New hotel';
    const message = payload?.message || `${hotelName} added successfully.`;

    setHotelListVersion((prev) => prev + 1);
    if (!hotelId) {
      return;
    }
    const stayDate = defaultPilotStayDate();
    setActiveWorkspaceSection('hotelradar');
    setSelectedHotelId(hotelId);
    setSelectedCheckinDate(stayDate);
    loadDashboard(hotelId, stayDate);
    setToast({
      type: 'success',
      message,
      hotelId,
    });
  }

  function handleOpenCreatedHotel(hotelId) {
    if (!hotelId) return;
    loadDashboard(hotelId);
    const panel = document.getElementById('hotel-dashboard-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setToast(null);
  }

  async function handleSignalSaved(checkinDate = '') {
    const hotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!hotelId) return;
    const activeDate = normalizeDateInput(checkinDate || selectedCheckinDate || dashboard?.marketContext?.checkinDate || '');
    setSelectedCheckinDate(activeDate);
    await loadDashboard(hotelId, activeDate);
    await handleRefreshSystemStatus();
    setToast({
      type: 'success',
      message: 'Market signal saved and Revenue Intelligence refreshed.',
      hotelId,
    });
  }

  async function handleAcceptBeta() {
    setBetaAcceptError('');
    setBetaAcceptLoading(true);
    try {
      const response = await fetch('/api/legal/accept-beta', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to record beta acceptance');
        throw new Error(parsed.message);
      }

      setBetaModalOpen(false);
      setError('');

      const hotelId = String(pendingHotelId || selectedHotelId || dashboard?.hotelId || '').trim();
      if (hotelId) {
        await loadDashboard(hotelId, selectedCheckinDate);
      }
    } catch (err) {
      setBetaAcceptError(err.message || 'Unable to record beta acceptance.');
    } finally {
      setBetaAcceptLoading(false);
    }
  }

  async function handleApplyDateFilter() {
    const activeHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!activeHotelId) return;
    await loadDashboard(activeHotelId, selectedCheckinDate);
  }

  const adminRole = session?.user?.role || '';
  const showAdminPanel = adminRole === 'super_admin' || adminRole === 'admin';
  const scopeLabel =
    adminRole === 'super_admin'
      ? 'Revenue Intelligence pilot · The Ten Resort'
      : adminRole === 'admin'
        ? 'Revenue Intelligence · managed hotels'
        : `Revenue Intelligence · ${Array.isArray(session?.user?.hotels) ? session.user.hotels.length : 0} assigned hotel(s)`;

  const workspaceLabel =
    adminRole === 'super_admin'
      ? 'Revenue Intelligence Desk'
      : adminRole === 'admin'
        ? 'Revenue Intelligence Desk'
        : 'Revenue Intelligence Desk';
  const recalcStatus = recalcJob?.status || '';
  const recalcInProgress = recalcStatus === 'queued' || recalcStatus === 'processing';
  const intelligenceHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
  const visibleWorkspaceSections = WORKSPACE_SECTIONS.filter((item) => !item.adminOnly || showAdminPanel);
  function renderSidebarFooter(className = '') {
    return (
      <footer className={className}>
        <p className="metaLabel">© 2026 HotelRADAR</p>
        <div className="sidebarLegalLinks">
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/privacy')}>
            Privacy
          </button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/terms')}>
            Terms
          </button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/disclaimer')}>
            Disclaimer
          </button>
        </div>
        <p className="metaLabel sidebarSupport">
          Support : support@hotelradar.in | Mobile No. +91-9828981000
        </p>
      </footer>
    );
  }

  function renderSelectedAdminInsight() {
    switch (selectedInsight) {
      case 'market-demand':
        return <MarketDemandCockpit token={session.token} compact selectedDate={selectedCheckinDate} />;
      case 'radar-score':
        return null;
      case 'morning-brief':
        return <MorningBrief token={session.token} hotelId={intelligenceHotelId} />;
      case 'demand-forecast':
        return <DemandForecast token={session.token} hotelId={intelligenceHotelId} />;
      case 'compression-alert':
        return <CompressionAlert token={session.token} hotelId={intelligenceHotelId} />;
      case 'revenue-advice':
        return <RevenueAdviceCard token={session.token} hotelId={intelligenceHotelId} />;
      case 'market-position':
        return <PositionMeter token={session.token} hotelId={intelligenceHotelId} />;
      case 'intelligence-alerts':
        return <AlertsPanel mode="intelligence" token={session.token} hotelId={intelligenceHotelId} />;
      case 'competitors':
        return <CompetitorPanel token={session.token} hotelId={intelligenceHotelId} />;
      default:
        return <RadarScore token={session.token} hotelId={intelligenceHotelId} />;
    }
  }

  function renderWorkspaceSection() {
    switch (activeWorkspaceSection) {
      case 'admin-control':
        return showAdminPanel ? (
          <PropertyOnboardingPanel
            token={session.token}
            role={adminRole}
            mode="full"
            onPropertyReady={handleHotelCreated}
          />
        ) : null;
      case 'listed-hotels':
        return showAdminPanel ? (
          <PropertyOnboardingPanel
            token={session.token}
            role={adminRole}
            mode="list"
            onPropertyReady={handleHotelCreated}
          />
        ) : null;
      case 'system-updates':
        return showAdminPanel ? (
          <SystemUpdatesPanel
            status={systemStatus}
            dashboard={dashboard}
            loading={systemStatusLoading}
            error={systemStatusError}
            onRefresh={handleRefreshSystemStatus}
          />
        ) : null;
      case 'signal-input':
        return showAdminPanel ? (
          <SignalInputPanel
            token={session.token}
            hotelId={intelligenceHotelId}
            selectedDate={selectedCheckinDate || dashboard?.marketContext?.checkinDate || ''}
            onSaved={handleSignalSaved}
          />
        ) : null;
      case 'opportunity':
        return (
          <OpportunityPanel
            dashboard={dashboard}
            loading={loading}
            error={error}
          />
        );
      case 'ota-watch':
        return (
          <OtaWatchWorkspacePanel
            dashboard={dashboard}
            selectedDate={selectedCheckinDate}
            loading={loading}
            error={error}
            recalcInProgress={recalcInProgress}
            onRefresh={() => handleRecalculate()}
            onOpenSignalInput={() => setActiveWorkspaceSection('signal-input')}
          />
        );
      case 'revenue-report':
        return (
          <RevenueReportPanel
            dashboard={dashboard}
            selectedDate={selectedCheckinDate}
          />
        );
      case 'hotelradar':
      default:
        return (
          <>
            {!intelligenceHotelId ? (
              <section className="panel hotelRadarWorkspaceIntro" aria-label="HotelRADAR workspace">
                <header className="panelHeader">
                  <div className="gridMetaBlock">
                    <h2>HotelRADAR</h2>
                    <p className="metaLabel">
                      Select a hotel from the top bar to open its Revenue Intelligence brief.
                    </p>
                  </div>
                </header>
                <p className="metaLabel">Select a hotel to load HotelRADAR.</p>
              </section>
            ) : null}
            {intelligenceHotelId && showFocusedInsight ? (
              <section className="panel hotelRadarFocusPanel" aria-label="Focused HotelRADAR view">
                <header className="panelHeader">
                  <div className="gridMetaBlock">
                    <span className="workspaceEyebrow">Focused View</span>
                    <h3>{ADMIN_INSIGHT_OPTIONS.find((option) => option.value === selectedInsight)?.label || 'HotelRADAR Focus'}</h3>
                    <p className="metaLabel">
                      Focused access to the selected HotelRADAR intelligence block.
                    </p>
                  </div>
                  <button type="button" className="secondaryButton" onClick={() => setShowFocusedInsight(false)}>
                    Close
                  </button>
                </header>
                {renderSelectedAdminInsight()}
              </section>
            ) : null}
            <Dashboard
              dashboard={dashboard}
              loading={loading}
              error={error}
              token={session.token}
              hotelId={String(selectedHotelId || dashboard?.hotelId || '').trim()}
            />
          </>
        );
    }
  }

  function renderMobileControlPanel() {
    return (
      <section className="premiumMobileControlPanel" aria-label="Mobile dashboard controls">
        <div className="premiumMobileControlIntro">
          <span className="workspaceEyebrow">{workspaceLabel}</span>
          <h2>Revenue Intelligence Brief</h2>
          <p className="metaLabel headerScope">{scopeLabel}</p>
        </div>

        <HotelSelector
          token={session.token}
          selectedHotelId={selectedHotelId}
          onSelect={setSelectedHotelId}
          onLoadDashboard={loadDashboard}
          loading={loading}
          reloadKey={hotelListVersion}
          className="topbarSelector premiumMobileSelector"
        />

        <div className="premiumMobileActions">
          <details className="premiumMobileActionDrawer">
            <summary>More actions</summary>
            <div className="premiumMobileActionDrawerBody">
              <div className="topbarDateSearch">
                <label htmlFor="dashboard-checkin-date-mobile" className="metaLabel">Stay Date</label>
                <input
                  id="dashboard-checkin-date-mobile"
                  type="date"
                  value={selectedCheckinDate}
                  onChange={(event) => setSelectedCheckinDate(normalizeDateInput(event.target.value))}
                />
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleApplyDateFilter}
                  disabled={loading || (!selectedHotelId && !dashboard?.hotelId)}
                >
                  View Date
                </button>
              </div>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => handleRecalculate()}
                disabled={recalcInProgress || loading || (!selectedHotelId && !dashboard?.hotelId)}
              >
                {recalcInProgress ? 'Refreshing…' : 'Refresh Intelligence'}
              </button>
            </div>
          </details>
        </div>
      </section>
    );
  }

  return (
    <main className={`premiumShell ${sidebarPinnedOpen ? 'sidebarPinnedOpen' : 'sidebarCollapsed'}`}>
      {!isCompactViewport ? (
        <aside className="premiumSidebar" aria-label="Primary navigation">
          <div className="premiumBrand">
            <div className="premiumBrandMark" aria-hidden="true">HR</div>
            <div className="premiumBrandCopy">
              <strong className="premiumBrandTitle">HotelRADAR</strong>
              <p>Realtime revenue signals</p>
            </div>
            <button
              type="button"
              className="premiumSidebarToggle"
              onMouseDown={(event) => {
                event.preventDefault();
                setSidebarPinnedOpen((prev) => !prev);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSidebarPinnedOpen((prev) => !prev);
              }}
              aria-pressed={sidebarPinnedOpen}
              aria-label={sidebarPinnedOpen ? 'Collapse sidebar' : 'Pin sidebar open'}
              title={sidebarPinnedOpen ? 'Collapse sidebar' : 'Pin sidebar open'}
            >
              <span />
            </button>
          </div>
          <nav className="premiumNav">
            {visibleWorkspaceSections.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`premiumNavItem ${activeWorkspaceSection === item.value ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceSection(item.value)}
                title={item.label}
              >
                <NavIcon type={item.icon} />
                <span className="premiumNavLabel">{item.label}</span>
              </button>
            ))}
            <button type="button" className="premiumNavItem" onClick={onLogout} title="Logout">
              <NavIcon type="logout" />
              <span className="premiumNavLabel">Logout</span>
            </button>
          </nav>
          {!isCompactViewport ? renderSidebarFooter('premiumSidebarFooter') : null}
        </aside>
      ) : null}

      <section className="premiumMain">
        <header className="premiumTopbar">
          {isCompactViewport ? (
            <div className="premiumMobileMenuBar">
              <div className="premiumMobileBrand" aria-label="HotelRADAR beta">
                <strong className="premiumMobileBrandTitle">Hotel Revenue Intelligence</strong>
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
          {!isCompactViewport ? (
          <div className="premiumTopbarIntro premiumDesktopOnlyShell">
            <span className="workspaceEyebrow">HotelRADAR</span>
            <h2>Realtime revenue signals</h2>
            <p className="metaLabel headerScope">{scopeLabel}</p>
          </div>
          ) : null}

          {!isCompactViewport ? (
          <HotelSelector
            token={session.token}
            selectedHotelId={selectedHotelId}
            onSelect={setSelectedHotelId}
            onLoadDashboard={loadDashboard}
            loading={loading}
            reloadKey={hotelListVersion}
            className="topbarSelector premiumDesktopOnlyShell"
          />
          ) : null}

          {!isCompactViewport ? (
          <div className="premiumTopbarActions premiumDesktopOnlyShell">
            <p className="metaLabel headerUser">
              {(session.user.full_name || session.user.email)}
            </p>
            <div className="topbarDateSearch">
              <label htmlFor="dashboard-checkin-date" className="metaLabel">Stay Date</label>
              <input
                id="dashboard-checkin-date"
                type="date"
                value={selectedCheckinDate}
                onChange={(event) => setSelectedCheckinDate(normalizeDateInput(event.target.value))}
              />
              <button
                type="button"
                className="secondaryButton"
                onClick={handleApplyDateFilter}
                disabled={loading || (!selectedHotelId && !dashboard?.hotelId)}
              >
                View Date
              </button>
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => handleRecalculate()}
              disabled={recalcInProgress || loading || (!selectedHotelId && !dashboard?.hotelId)}
            >
              {recalcInProgress ? 'Refreshing…' : 'Refresh Intelligence'}
            </button>
          </div>
          ) : null}
        </header>

        {isCompactViewport && mobileNavOpen ? (
          <section id="premium-mobile-nav" className="premiumMobileNavPanel" aria-label="Mobile navigation menu">
            <div className="premiumMobileNav">
              {visibleWorkspaceSections.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`premiumNavItem ${activeWorkspaceSection === item.value ? 'active' : ''}`}
                  onClick={() => setActiveWorkspaceSection(item.value)}
                >
                  <NavIcon type={item.icon} />
                  <span className="premiumNavLabel">{item.label}</span>
                </button>
              ))}
              <button type="button" className="premiumNavItem" onClick={onLogout}>
                <NavIcon type="logout" />
                <span className="premiumNavLabel">Logout</span>
              </button>
            </div>
          </section>
        ) : null}

        {isCompactViewport ? renderMobileControlPanel() : null}

        <div className="premiumContent">
          {toast && (
            <section className={`panel toastPanel toast-${toast.type}`} role="status" aria-live="polite">
              <p className="toastText">{toast.message}</p>
              <div className="toastActions">
                {toast.hotelId && (
                  <button type="button" onClick={() => handleOpenCreatedHotel(toast.hotelId)}>
                    Open Dashboard
                  </button>
                )}
                <button type="button" className="secondaryButton" onClick={() => setToast(null)}>
                  Dismiss
                </button>
              </div>
            </section>
          )}

          {renderWorkspaceSection()}
        </div>
        {isCompactViewport ? renderSidebarFooter('premiumMobileFooter') : null}
      </section>
      <BetaAcceptanceModal
        open={betaModalOpen}
        loading={betaAcceptLoading}
        error={betaAcceptError}
        onAccept={handleAcceptBeta}
        onNavigate={onNavigate}
      />
    </main>
  );
}
