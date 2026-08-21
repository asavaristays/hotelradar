import PDFDocument from 'pdfkit';
import { buildClientInsightNarrative } from './revenueIntelligenceInsightNarrativeService.js';

const BRAND = {
  ink: '#172033',
  muted: '#5b6b83',
  line: '#dbe5f1',
  panel: '#f5f8fc',
  blue: '#2185d0',
  teal: '#149b93',
  green: '#55c744',
  amber: '#d89a24',
  red: '#c94848',
};

function clean(value = '') {
  return String(value ?? '').replace(/₹/g, 'Rs. ').replace(/\s+/g, ' ').trim();
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function displayDate(value = '') {
  const safeDate = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) return safeDate || 'Selected date';
  const parsed = new Date(`${safeDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function statusColor(status = '') {
  const value = clean(status).toLowerCase();
  if (value === 'ready') return BRAND.green;
  if (value === 'supporting') return BRAND.blue;
  if (value === 'stale') return BRAND.amber;
  if (value === 'missing') return BRAND.red;
  return BRAND.muted;
}

function toneColor(tone = '') {
  const value = clean(tone).toLowerCase();
  if (value === 'high') return BRAND.red;
  if (value === 'watch') return '#83bd73';
  if (value === 'ready') return BRAND.green;
  return '#cbd5df';
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatGapPct(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Unavailable';
  const rounded = Math.round(parsed * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

function formatTimestamp(value = '') {
  if (!value) return 'time pending';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return clean(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function median(values = []) {
  const list = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
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

function shortCurrency(value) {
  const amount = numericOrNull(value);
  if (amount === null) return 'Not captured';
  if (amount >= 100000) return `Rs. ${Math.round(amount / 1000)}k`;
  return `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
}

function collect(doc) {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function card(doc, x, y, w, h, title, value, hint, accent = BRAND.blue) {
  doc
    .roundedRect(x, y, w, h, 12)
    .fillAndStroke('#ffffff', BRAND.line);
  doc.rect(x, y, 4, h).fill(accent);
  doc
    .fontSize(8)
    .fillColor(BRAND.muted)
    .text(title, x + 16, y + 14, { width: w - 28 });
  doc
    .fontSize(18)
    .fillColor(BRAND.ink)
    .text(clean(value) || 'Unavailable', x + 16, y + 31, { width: w - 28 });
  if (hint) {
    doc
      .fontSize(8)
      .fillColor(BRAND.muted)
      .text(hint, x + 16, y + 58, { width: w - 28 });
  }
}

function sectionTitle(doc, title, y) {
  doc
    .fontSize(11)
    .fillColor(BRAND.ink)
    .text(title, 44, y, { width: 506 });
  doc
    .moveTo(44, y + 18)
    .lineTo(550, y + 18)
    .strokeColor(BRAND.line)
    .stroke();
}

function tableHeader(doc, y, headers) {
  doc.roundedRect(44, y, 506, 24, 7).fill(BRAND.panel);
  let x = 56;
  headers.forEach(({ label, width }) => {
    doc.fontSize(7.5).fillColor(BRAND.muted).text(label.toUpperCase(), x, y + 8, { width });
    x += width;
  });
}

function ensureSpace(doc, y, needed = 90) {
  if (y + needed < 770) return y;
  doc.addPage();
  return 50;
}

function filenameFor({ hotelName = 'hotel', stayDate = '' } = {}) {
  const hotelSlug = clean(hotelName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hotel';
  const dateSlug = String(stayDate || '').slice(0, 10) || 'selected-date';
  return `hotelradar-daily-market-intelligence-${hotelSlug}-${dateSlug}.pdf`;
}

function draw15DayTariffChart(doc, y, enterpriseBrief = {}) {
  const days = normalizeList(enterpriseBrief.next15Days).slice(0, 15);
  if (!days.length) return y;

  y = ensureSpace(doc, y, 170);
  sectionTitle(doc, '15-day tariff and pressure outlook', y);
  const chartY = y + 36;
  const chartX = 44;
  const chartW = 506;
  const chartH = 122;
  const maxTariff = Math.max(
    1,
    ...days
      .flatMap((day) => [numericOrNull(day.tariff), numericOrNull(day.marketTariff)])
      .filter(Boolean),
  );
  const barGap = 5;
  const barW = (chartW - barGap * (days.length - 1)) / days.length;

  doc.roundedRect(chartX, chartY, chartW, chartH, 10).fillAndStroke('#ffffff', BRAND.line);
  [0.25, 0.5, 0.75].forEach((share) => {
    const lineY = chartY + 12 + (chartH - 46) * share;
    doc.moveTo(chartX + 10, lineY).lineTo(chartX + chartW - 10, lineY).strokeColor('#edf2f7').stroke();
  });

  days.forEach((day, index) => {
    const x = chartX + 10 + index * (barW + barGap);
    const tariff = numericOrNull(day.tariff) || numericOrNull(day.marketTariff);
    const barH = tariff ? Math.max(12, Math.round((tariff / maxTariff) * 70)) : 14;
    const barY = chartY + 82 - barH;
    doc.roundedRect(x, barY, Math.max(8, barW - 2), barH, 3).fill(tariff ? toneColor(day.tone) : '#d8e0e8');
    doc
      .fontSize(5.9)
      .fillColor(BRAND.muted)
      .text(displayDate(day.date).replace(/, 2026$/, ''), x - 1, chartY + 88, {
        width: barW + 2,
        align: 'center',
        lineBreak: false,
      });
    doc
      .fontSize(5.9)
      .fillColor(tariff ? BRAND.ink : BRAND.muted)
      .text(shortCurrency(tariff), x - 2, chartY + 104, {
        width: barW + 4,
        align: 'center',
        lineBreak: false,
      });
  });

  const footY = chartY + chartH + 8;
  doc
    .fontSize(7.5)
    .fillColor(BRAND.muted)
    .text(
      'Bars use captured official tariff where available, otherwise captured market tariff. Missing values stay Not captured.',
      44,
      footY,
      { width: 506, align: 'center' },
    );
  return footY + 24;
}

function drawOtaWatch(doc, y, otaWatch = null) {
  if (!otaWatch) return y;
  y = ensureSpace(doc, y, 135);
  sectionTitle(doc, 'OTA watch and public-rate leakage', y);
  y += 34;
  doc.roundedRect(44, y, 506, 92, 10).fillAndStroke('#ffffff', BRAND.line);
  const accent =
    otaWatch.status === 'healthy'
      ? BRAND.green
      : otaWatch.status === 'attention'
        ? BRAND.red
        : BRAND.amber;
  doc.rect(44, y, 4, 92).fill(accent);
  doc.fontSize(9.5).fillColor(BRAND.ink).text(clean(otaWatch.headline), 60, y + 12, { width: 330 });
  doc.fontSize(8.3).fillColor(BRAND.muted).text(clean(otaWatch.action), 60, y + 34, { width: 330, lineGap: 2 });
  doc.fontSize(7.5).fillColor(BRAND.muted).text('Own public rate', 408, y + 12, { width: 120, align: 'right' });
  doc.fontSize(12).fillColor(BRAND.ink).text(clean(otaWatch.ownRateLabel || 'Not captured'), 408, y + 25, { width: 120, align: 'right' });
  doc.fontSize(7.5).fillColor(BRAND.muted).text('Lowest OTA', 408, y + 48, { width: 120, align: 'right' });
  doc.fontSize(12).fillColor(BRAND.ink).text(clean(otaWatch.lowestOtaRateLabel || 'Not captured'), 408, y + 61, { width: 120, align: 'right' });
  y += 108;
  const channels = normalizeList(otaWatch.channels).slice(0, 4).join(', ') || 'No public OTA channel rows captured yet';
  doc.fontSize(8).fillColor(BRAND.muted).text(`Channels observed: ${channels}`, 44, y, { width: 506 });
  return y + 24;
}

function realtimeRows(dashboard = {}) {
  return Array.isArray(dashboard?.realtimeSignals?.rows) ? dashboard.realtimeSignals.rows : [];
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
        name: clean(row?.sourceName || row?.metadata?.competitorName || 'Competitor') || 'Competitor',
        rate,
        proofUrl: clean(row?.proofUrl || ''),
        observedAt: row?.observedAt || row?.capturedAt || '',
        basis: clean(row?.metadata?.basis || row?.metadata?.rate_basis || 'Approved comp-set'),
        verified: Boolean(
          row?.verified ||
          row?.clientReady ||
          row?.metadata?.verified ||
          row?.metadata?.clientReady ||
          row?.metadata?.basisMatched,
        ),
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
  const marketAvg = deduped.length >= 3
    ? (numericOrNull(dashboard?.marketPosition?.marketAvg) || median(visibleRates))
    : null;
  const lowestRate = visibleRates.length ? Math.min(...visibleRates) : null;
  const ownVsMarketPct = ownRate !== null && marketAvg ? ((ownRate - marketAvg) / marketAvg) * 100 : null;
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

  return {
    stayDate,
    rows: deduped,
    ownRate,
    marketAvg,
    lowestRate,
    ownVsMarketPct,
    lowerThanOwn,
    isClientReady,
    headline,
    guidance,
  };
}

function drawCompetitorRatePosition(doc, y, dashboard = {}, selectedDate = '') {
  const analysis = buildCompetitorAnalysis(dashboard, selectedDate);
  y = ensureSpace(doc, y, analysis.rows.length ? 250 : 120);
  sectionTitle(doc, 'Competitor rate position', y);
  y += 34;

  doc.roundedRect(44, y, 506, 92, 10).fillAndStroke('#ffffff', BRAND.line);
  doc.rect(44, y, 4, 92).fill(analysis.isClientReady ? BRAND.green : BRAND.amber);
  doc.fontSize(9.6).fillColor(BRAND.ink).text(analysis.headline, 60, y + 12, { width: 310, lineGap: 2 });
  doc.fontSize(8).fillColor(BRAND.muted).text(analysis.guidance, 60, y + 38, { width: 310, lineGap: 2 });
  doc
    .fontSize(7.2)
    .fillColor(BRAND.muted)
    .text(
      `Selected stay date: ${displayDate(analysis.stayDate)} · ${analysis.isClientReady ? 'verified comp-set evidence' : 'approved comp-set evidence, basis-match pending'}`,
      60,
      y + 69,
      { width: 310 },
    );

  const metricX = 392;
  doc.fontSize(7.2).fillColor(BRAND.muted).text('Own rate', metricX, y + 12, { width: 64 });
  doc.fontSize(9).fillColor(BRAND.ink).text(shortCurrency(analysis.ownRate), metricX, y + 24, { width: 64 });
  doc.fontSize(7.2).fillColor(BRAND.muted).text(analysis.isClientReady ? 'Market avg' : 'Approved avg', metricX + 78, y + 12, { width: 62 });
  doc.fontSize(9).fillColor(BRAND.ink).text(shortCurrency(analysis.marketAvg), metricX + 78, y + 24, { width: 62 });
  doc.fontSize(7.2).fillColor(BRAND.muted).text('Lowest approved', metricX, y + 51, { width: 64 });
  doc.fontSize(9).fillColor(BRAND.ink).text(shortCurrency(analysis.lowestRate), metricX, y + 63, { width: 64 });
  doc.fontSize(7.2).fillColor(BRAND.muted).text('Below own', metricX + 78, y + 51, { width: 62 });
  doc.fontSize(9).fillColor(BRAND.ink).text(analysis.lowerThanOwn === null ? 'Unavailable' : `${analysis.lowerThanOwn}/${analysis.rows.length}`, metricX + 78, y + 63, { width: 62 });
  y += 112;

  if (!analysis.rows.length) return y + 4;

  tableHeader(doc, y, [
    { label: 'Competitor', width: 228 },
    { label: 'Rate', width: 88 },
    { label: 'Vs own', width: 78 },
    { label: 'Proof', width: 80 },
  ]);
  y += 30;

  analysis.rows.slice(0, 6).forEach((row) => {
    y = ensureSpace(doc, y, 42);
    const rowHeight = 38;
    const vsOwn = analysis.ownRate !== null ? ((row.rate - analysis.ownRate) / analysis.ownRate) * 100 : null;
    const vsColor = vsOwn === null ? BRAND.muted : vsOwn < -8 ? BRAND.red : vsOwn > 8 ? BRAND.green : BRAND.muted;

    doc.moveTo(44, y + rowHeight).lineTo(550, y + rowHeight).strokeColor('#edf2f7').stroke();
    doc.fontSize(8.3).fillColor(BRAND.ink).text(row.name, 56, y + 6, { width: 214 });
    doc.fontSize(7).fillColor(BRAND.muted).text(`${row.basis} · ${formatTimestamp(row.observedAt)}`, 56, y + 20, { width: 214 });
    doc.fontSize(8.4).fillColor(BRAND.ink).text(shortCurrency(row.rate), 284, y + 11, { width: 80 });
    doc.fontSize(8.4).fillColor(vsColor).text(vsOwn === null ? 'Unavailable' : formatGapPct(vsOwn), 372, y + 11, { width: 70 });
    if (row.proofUrl) {
      doc.fontSize(8).fillColor(BRAND.blue).text('View source', 452, y + 11, {
        width: 78,
        link: row.proofUrl,
        underline: true,
      });
    } else {
      doc.fontSize(8).fillColor(BRAND.muted).text('Pending', 452, y + 11, { width: 78 });
    }
    y += rowHeight;
  });

  return y + 8;
}

function drawLeakageWatch(doc, y, leakageWatch = null, resourceTransformation = null) {
  const areas = normalizeList(leakageWatch?.leakageAreas).slice(0, 4);
  const resources = normalizeList(resourceTransformation?.resources).slice(0, 4);
  if (!areas.length && !resources.length) return y;

  y = ensureSpace(doc, y, 175);
  sectionTitle(doc, 'Revenue leakage and resource transformation', y);
  y += 34;

  if (leakageWatch?.summary) {
    doc.fontSize(8.5).fillColor(BRAND.muted).text(clean(leakageWatch.summary), 44, y, { width: 506, lineGap: 2 });
    y += 32;
  }

  areas.forEach((area) => {
    y = ensureSpace(doc, y, 38);
    doc.circle(52, y + 6, 3).fill(area.status === 'risk' ? BRAND.red : area.status === 'controlled' ? BRAND.green : BRAND.amber);
    doc.fontSize(8.4).fillColor(BRAND.ink).text(clean(area.label), 64, y, { width: 136 });
    doc.fontSize(8.2).fillColor(BRAND.muted).text(clean(area.detail), 204, y, { width: 326, height: 30 });
    y += 36;
  });

  if (resourceTransformation?.headline) {
    y = ensureSpace(doc, y + 8, 78);
    doc.roundedRect(44, y, 506, 66, 9).fillAndStroke('#f7fbfa', '#cfe8e3');
    doc.fontSize(8.8).fillColor(BRAND.teal).text(clean(resourceTransformation.headline), 58, y + 12, { width: 472 });
    doc.fontSize(7.8).fillColor(BRAND.muted).text(clean(resourceTransformation.leakageRecoveryHypothesis), 58, y + 32, { width: 472, lineGap: 2 });
    y += 80;
  }

  resources.forEach((resource) => {
    y = ensureSpace(doc, y, 28);
    doc.fontSize(8.3).fillColor(BRAND.ink).text(clean(resource.label), 58, y, { width: 150 });
    doc.fontSize(8).fillColor(BRAND.muted).text(clean(`${resource.owner}: ${resource.action}`), 218, y, { width: 312 });
    y += 30;
  });

  return y;
}

export async function buildRevenueIntelligencePdf({ dashboard = {}, model = {}, stayDate = '' } = {}) {
  const hotelName = dashboard?.hotel?.name || dashboard?.hotelName || 'HotelRADAR Property';
  const summary = model.executiveSummary || {};
  const evidence = normalizeList(model.evidence);
  const opportunities = normalizeList(model.opportunityRows);
  const missingActions = normalizeList(model.missingDataActions);
  const brief = model.morningBrief || {};
  const enterpriseBrief = model.enterpriseBrief || {};
  const otaWatch = model.otaWatch || null;
  const leakageWatch = model.leakageWatch || null;
  const resourceTransformation = model.resourceTransformation || null;
  const insights = buildClientInsightNarrative({ dashboard, model });
  const reportDate = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const doc = new PDFDocument({
    size: 'A4',
    margin: 44,
    bufferPages: true,
    info: {
      Title: `HotelRADAR Daily Market Intelligence - ${hotelName}`,
      Author: 'HotelRADAR',
      Subject: 'Daily Hotel Market Intelligence',
    },
  });
  const bufferPromise = collect(doc);

  doc.rect(0, 0, 595, 842).fill('#f2f6fb');
  doc.roundedRect(28, 24, 539, 770, 18).fill('#ffffff');

  doc
    .fontSize(18)
    .fillColor(BRAND.ink)
    .text('Hotel', 44, 46, { continued: true })
    .fillColor(BRAND.green)
    .text('RADAR', { continued: false });
  doc
    .fontSize(8.5)
    .fillColor(BRAND.muted)
    .text('Realtime revenue signals', 44, 69);

  doc
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text(`Prepared ${reportDate}`, 340, 48, { width: 210, align: 'right' });

  doc
    .fontSize(14)
    .fillColor(BRAND.ink)
    .text('Daily Market Intelligence', 44, 104);
  doc
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text(`${clean(hotelName)} - Stay date ${displayDate(stayDate || model.stayDate)}`, 44, 126);

  card(doc, 44, 158, 156, 86, 'Recommended action', summary.pricingAction || 'Need More Data', 'Advisory action for the selected date', BRAND.teal);
  card(doc, 219, 158, 156, 86, 'Confidence', `${summary.confidenceScore ?? 'Unavailable'}%`, summary.trustStatus || 'Evidence readiness', BRAND.green);
  card(doc, 394, 158, 156, 86, 'Decision stance', summary.trustStatus || 'Watch only', 'Strong action requires fresh proof', BRAND.blue);

  doc
    .fontSize(10)
    .fillColor(BRAND.ink)
    .text('Morning context', 44, 278);
  doc
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text(clean(summary.narrative) || 'Revenue Intelligence has reviewed market signals for the selected stay date.', 44, 298, {
      width: 506,
      lineGap: 3,
    });
  doc
    .fontSize(9)
    .fillColor(BRAND.ink)
    .text(clean(brief.whatsappDraft || '').replace(/\n/g, '  |  '), 44, 333, {
      width: 506,
      lineGap: 3,
    });

  let y = 390;
  y = draw15DayTariffChart(doc, y, enterpriseBrief);
  y = drawOtaWatch(doc, y + 10, otaWatch);
  y = drawCompetitorRatePosition(doc, y + 10, dashboard, stayDate || model.stayDate);
  y = drawLeakageWatch(doc, y + 10, leakageWatch, resourceTransformation);
  y = ensureSpace(doc, y + 16, 105);
  sectionTitle(doc, 'Market read', y);
  y += 34;
  insights.marketRead.slice(0, 4).forEach((line) => {
    y = ensureSpace(doc, y, 26);
    doc.circle(52, y + 6, 3).fill(BRAND.teal);
    doc.fontSize(8.5).fillColor(BRAND.muted).text(clean(line), 64, y, { width: 470, lineGap: 2 });
    y += 28;
  });

  y = ensureSpace(doc, y + 18, 105);
  sectionTitle(doc, 'Where the hotel may be going wrong', y);
  y += 34;
  insights.whereHotelIsGoingWrong.slice(0, 4).forEach((line) => {
    y = ensureSpace(doc, y, 32);
    doc.circle(52, y + 6, 3).fill(BRAND.amber);
    doc.fontSize(8.5).fillColor(BRAND.ink).text(clean(line), 64, y, { width: 470, lineGap: 2 });
    y += 34;
  });

  y = ensureSpace(doc, y + 18, 105);
  sectionTitle(doc, 'Commercial actions for today', y);
  y += 34;
  insights.commercialActions.slice(0, 5).forEach((line) => {
    y = ensureSpace(doc, y, 30);
    doc.circle(52, y + 6, 3).fill(BRAND.green);
    doc.fontSize(8.5).fillColor(BRAND.muted).text(clean(line), 64, y, { width: 470, lineGap: 2 });
    y += 32;
  });

  y = ensureSpace(doc, y + 28, 120);
  sectionTitle(doc, 'Signal readiness', y);
  y += 34;
  const columns = [
    { label: 'Signal', width: 148 },
    { label: 'Status', width: 86 },
    { label: 'Evidence', width: 102 },
    { label: 'Client meaning', width: 158 },
  ];
  tableHeader(doc, y, columns);
  y += 30;
  evidence.slice(0, 10).forEach((item) => {
    y = ensureSpace(doc, y, 45);
    const rowHeight = 42;
    doc.moveTo(44, y + rowHeight).lineTo(550, y + rowHeight).strokeColor('#edf2f7').stroke();
    doc.fontSize(8.5).fillColor(BRAND.ink).text(clean(item.label), 56, y + 8, { width: 136 });
    doc.fontSize(8.5).fillColor(statusColor(item.status)).text(clean(item.status), 204, y + 8, { width: 74 });
    doc.fontSize(8).fillColor(BRAND.ink).text(clean(item.value || 'Not captured'), 290, y + 8, { width: 92 });
    doc.fontSize(8).fillColor(BRAND.muted).text(clean(item.clientMeaning), 392, y + 8, { width: 145, height: 28 });
    y += rowHeight;
  });

  y = ensureSpace(doc, y + 28, 120);
  sectionTitle(doc, 'Opportunity and recommendation', y);
  y += 34;
  if (opportunities.length) {
    opportunities.slice(0, 5).forEach((item) => {
      y = ensureSpace(doc, y, 65);
      doc.roundedRect(44, y, 506, 54, 9).fillAndStroke('#ffffff', BRAND.line);
      doc.fontSize(8).fillColor(BRAND.teal).text(clean(item.type || 'opportunity').toUpperCase(), 58, y + 10, { width: 90 });
      doc.fontSize(9).fillColor(BRAND.ink).text(clean(item.opportunity), 150, y + 9, { width: 250 });
      doc.fontSize(8).fillColor(BRAND.muted).text(clean(item.action), 150, y + 27, { width: 250, height: 18 });
      doc.fontSize(8).fillColor(BRAND.muted).text(clean(item.owner || 'Revenue team'), 420, y + 16, { width: 105, align: 'right' });
      y += 62;
    });
  } else {
    doc.fontSize(9).fillColor(BRAND.muted).text('No opportunity is ready yet. Continue signal capture.', 44, y);
    y += 26;
  }

  y = ensureSpace(doc, y + 12, 105);
  sectionTitle(doc, 'Missing evidence / next actions', y);
  y += 34;
  if (missingActions.length) {
    missingActions.slice(0, 6).forEach((item) => {
      y = ensureSpace(doc, y, 28);
      doc.circle(52, y + 6, 3).fill(statusColor(item.status));
      doc.fontSize(8.5).fillColor(BRAND.ink).text(clean(item.label), 64, y, { width: 120 });
      doc.fontSize(8.5).fillColor(BRAND.muted).text(clean(item.action), 190, y, { width: 340 });
      y += 24;
    });
  } else {
    doc.fontSize(9).fillColor(BRAND.muted).text('No critical missing evidence for this selected view.', 44, y);
    y += 26;
  }

  y = ensureSpace(doc, y + 16, 100);
  sectionTitle(doc, 'Digital asset watch', y);
  y += 34;
  insights.digitalAssetWatch.slice(0, 4).forEach((line) => {
    y = ensureSpace(doc, y, 32);
    doc.circle(52, y + 6, 3).fill(BRAND.blue);
    doc.fontSize(8.5).fillColor(BRAND.muted).text(clean(line), 64, y, { width: 470, lineGap: 2 });
    y += 34;
  });

  y = ensureSpace(doc, y + 18, 45);
  doc
    .fontSize(8)
    .fillColor(BRAND.muted)
    .text(
      'Advisory Revenue Intelligence only. Validate any price change in PMS/channel manager before publishing.',
      44,
      y,
      { width: 506, align: 'center' },
    );

  doc.end();

  return {
    filename: filenameFor({ hotelName, stayDate: stayDate || model.stayDate }),
    contentType: 'application/pdf',
    buffer: await bufferPromise,
  };
}
