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

export async function buildRevenueIntelligencePdf({ dashboard = {}, model = {}, stayDate = '' } = {}) {
  const hotelName = dashboard?.hotel?.name || dashboard?.hotelName || 'HotelRADAR Property';
  const summary = model.executiveSummary || {};
  const evidence = normalizeList(model.evidence);
  const opportunities = normalizeList(model.opportunityRows);
  const missingActions = normalizeList(model.missingDataActions);
  const brief = model.morningBrief || {};
  const enterpriseBrief = model.enterpriseBrief || {};
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
