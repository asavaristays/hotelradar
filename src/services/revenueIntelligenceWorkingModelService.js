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

function selectedStayDate(dashboard = {}) {
  return String(dashboard?.marketContext?.checkinDate || '').slice(0, 10) || null;
}

function rows(dashboard = {}) {
  return Array.isArray(dashboard?.realtimeSignals?.rows) ? dashboard.realtimeSignals.rows : [];
}

function rowText(row = {}) {
  return `${row.sourceType || ''} ${row.signalType || ''} ${row.sourceName || ''} ${row.valueText || ''} ${row?.metadata?.eventType || ''} ${row?.metadata?.category || ''}`.toLowerCase();
}

function rowCount(dashboard = {}, matcher) {
  return rows(dashboard).filter((row) => matcher(rowText(row), row)).length;
}

function freshRows(dashboard = {}) {
  const now = Date.now();
  return rows(dashboard).filter((row) => {
    const expiresAt = row?.freshnessExpiresAt ? new Date(row.freshnessExpiresAt).getTime() : 0;
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function signalStatus({ ready = false, supporting = false, stale = false }) {
  if (ready) return 'ready';
  if (supporting) return stale ? 'stale' : 'supporting';
  return stale ? 'stale' : 'missing';
}

function statusLabel(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'supporting') return 'Supporting';
  if (status === 'stale') return 'Stale';
  return 'Missing';
}

function buildEvidence(dashboard = {}) {
  const ownRateReady = positiveNumber(dashboard?.marketPosition?.hotelPrice);
  const marketAvgReady = positiveNumber(dashboard?.marketPosition?.marketAvg);
  const otaRows = Math.max(
    Number(dashboard?.signalQuality?.otaLiveRows || 0),
    rowCount(dashboard, (text) => text.includes('ota') || text.includes('google hotels') || text.includes('agoda') || text.includes('booking') || text.includes('expedia') || text.includes('makemytrip')),
  );
  const competitorRows = Math.max(
    Number(dashboard?.signalQuality?.competitorRows || 0),
    rowCount(dashboard, (text) => text.includes('competitor')),
  );
  const eventRows = rowCount(dashboard, (text) => /event|holiday|festival|weekend|rakhi|independence/.test(text));
  const miceRows = rowCount(dashboard, (text) => /mice|corporate|conference|offsite|expo|summit/.test(text));
  const weddingRows = rowCount(dashboard, (text) => /wedding|marriage|bridal|banquet/.test(text));
  const travelRows = rowCount(dashboard, (text) => /airfare|airport|flight|search|travel|google_trends/.test(text));
  const weatherRows = rowCount(dashboard, (text) => /weather|monsoon|rain|risk/.test(text));
  const freshCount = Math.max(Number(dashboard?.realtimeSignals?.counts?.fresh || 0), freshRows(dashboard).length);
  const totalRows = Number(dashboard?.realtimeSignals?.counts?.total || rows(dashboard).length);
  const hasStaleRows = totalRows > 0 && freshCount <= 0;

  return [
    {
      key: 'official_rate',
      label: 'Official rate',
      category: 'price_evidence',
      status: signalStatus({ ready: ownRateReady }),
      value: ownRateReady ? formatCurrency(dashboard.marketPosition.hotelPrice) : null,
      count: ownRateReady ? 1 : 0,
      requiredForStrongAction: true,
      clientMeaning: 'Own selling rate for the selected stay date.',
      missingAction: 'Capture booking-engine/direct rate for the stay date.',
    },
    {
      key: 'ota_rate',
      label: 'OTA evidence',
      category: 'price_evidence',
      status: signalStatus({ ready: otaRows >= 2, supporting: otaRows > 0, stale: hasStaleRows && otaRows > 0 }),
      value: otaRows ? `${otaRows} OTA row${otaRows === 1 ? '' : 's'}` : null,
      count: otaRows,
      requiredForStrongAction: true,
      clientMeaning: 'Public channel rate evidence and parity risk.',
      missingAction: 'Capture Google Hotels/Agoda/Booking/Expedia/MMT rate evidence.',
    },
    {
      key: 'competitor_rate',
      label: 'Competitor evidence',
      category: 'price_evidence',
      status: signalStatus({ ready: competitorRows >= 3, supporting: competitorRows > 0, stale: hasStaleRows && competitorRows > 0 }),
      value: competitorRows ? `${competitorRows} comp row${competitorRows === 1 ? '' : 's'}` : null,
      count: competitorRows,
      requiredForStrongAction: true,
      clientMeaning: 'Comp-set price pressure around the hotel.',
      missingAction: 'Capture at least three comparable competitor rates.',
    },
    {
      key: 'market_price',
      label: 'Market price',
      category: 'price_evidence',
      status: signalStatus({ ready: marketAvgReady }),
      value: marketAvgReady ? formatCurrency(dashboard.marketPosition.marketAvg) : null,
      count: marketAvgReady ? 1 : 0,
      requiredForStrongAction: true,
      clientMeaning: 'Normalized market average for selected stay date.',
      missingAction: 'Normalize competitor/OTA rows into market average.',
    },
    {
      key: 'event_pressure',
      label: 'Event / holiday',
      category: 'demand_pressure',
      status: signalStatus({ ready: eventRows >= 1, supporting: eventRows > 0 }),
      value: eventRows ? `${eventRows} signal${eventRows === 1 ? '' : 's'}` : null,
      count: eventRows,
      requiredForStrongAction: false,
      clientMeaning: 'Why demand may move for the selected date.',
      missingAction: 'Add holidays, local events, school breaks, and long weekends.',
    },
    {
      key: 'travel_pressure',
      label: 'Travel / search',
      category: 'demand_pressure',
      status: signalStatus({ ready: travelRows >= 2, supporting: travelRows > 0 }),
      value: travelRows ? `${travelRows} signal${travelRows === 1 ? '' : 's'}` : null,
      count: travelRows,
      requiredForStrongAction: false,
      clientMeaning: 'Travel intent, airfare, and arrival pressure.',
      missingAction: 'Connect travel-search, airfare, or airport demand observations.',
    },
    {
      key: 'mice_pressure',
      label: 'MICE',
      category: 'commercial_opportunity',
      status: signalStatus({ ready: miceRows >= 2, supporting: miceRows > 0 }),
      value: miceRows ? `${miceRows} signal${miceRows === 1 ? '' : 's'}` : null,
      count: miceRows,
      requiredForStrongAction: false,
      clientMeaning: 'Corporate offsite, conference, and group demand potential.',
      missingAction: 'Add corporate/event venue watch signals.',
    },
    {
      key: 'wedding_pressure',
      label: 'Wedding',
      category: 'commercial_opportunity',
      status: signalStatus({ ready: weddingRows >= 2, supporting: weddingRows > 0 }),
      value: weddingRows ? `${weddingRows} signal${weddingRows === 1 ? '' : 's'}` : null,
      count: weddingRows,
      requiredForStrongAction: false,
      clientMeaning: 'Destination wedding/group block opportunity.',
      missingAction: 'Add wedding-window and banquet enquiry observations.',
    },
    {
      key: 'weather_risk',
      label: 'Weather / risk',
      category: 'risk',
      status: signalStatus({ ready: weatherRows > 0, supporting: weatherRows > 0 }),
      value: weatherRows ? `${weatherRows} signal${weatherRows === 1 ? '' : 's'}` : null,
      count: weatherRows,
      requiredForStrongAction: false,
      clientMeaning: 'Conversion/cancellation risk that can change last-minute confidence.',
      missingAction: 'Connect weather, access, or disruption risk observations.',
    },
    {
      key: 'freshness',
      label: 'Freshness',
      category: 'data_health',
      status: signalStatus({ ready: freshCount > 0, supporting: totalRows > 0, stale: hasStaleRows }),
      value: freshCount ? `${freshCount} fresh row${freshCount === 1 ? '' : 's'}` : null,
      count: freshCount,
      requiredForStrongAction: true,
      clientMeaning: 'Whether evidence is current enough for action.',
      missingAction: 'Refresh observations before issuing strong action.',
    },
  ];
}

function readinessScore(evidence = []) {
  const weights = {
    official_rate: 1.35,
    ota_rate: 1.25,
    competitor_rate: 1.45,
    market_price: 1.25,
    event_pressure: 0.75,
    travel_pressure: 0.7,
    mice_pressure: 0.5,
    wedding_pressure: 0.5,
    weather_risk: 0.25,
    freshness: 1,
  };
  let score = 0;
  let total = 0;
  for (const item of evidence) {
    const weight = weights[item.key] || 1;
    total += weight;
    if (item.status === 'ready') score += 100 * weight;
    if (item.status === 'supporting') score += 60 * weight;
    if (item.status === 'stale') score += 35 * weight;
  }
  return total > 0 ? Math.round(score / total) : 0;
}

function requiredEvidenceReady(evidence = []) {
  return evidence
    .filter((item) => item.requiredForStrongAction)
    .every((item) => item.status === 'ready');
}

function missingRequired(evidence = []) {
  return evidence.filter((item) => item.requiredForStrongAction && item.status !== 'ready');
}

function actionFor(dashboard = {}, score = 0, evidence = []) {
  const requiredReady = requiredEvidenceReady(evidence);
  const demandScore = Number(dashboard?.demandScore || 0);
  const positionPct = Number(dashboard?.marketPosition?.positionPct || 0);
  const demandLevel = String(dashboard?.demandLevel || '').toLowerCase();
  const highDemand = demandScore >= 70 || /high|surge/.test(demandLevel);
  const softDemand = demandScore > 0 && demandScore < 45;

  if (score < 40) return 'Need More Data';
  if (score < 60) return 'Hold / Watch';

  const direction = highDemand && positionPct < 12
    ? 'increase'
    : softDemand || positionPct > 25
      ? 'reduce'
      : 'hold';

  if (score < 75 || !requiredReady) {
    if (direction === 'increase') return 'Increase Watch';
    if (direction === 'reduce') return 'Reduce Watch';
    return 'Hold / Watch';
  }

  if (direction === 'increase') return 'Increase';
  if (direction === 'reduce') return 'Reduce';
  return highDemand ? 'Close Discount' : 'Hold / Watch';
}

function trustStatus(action, score, evidence = []) {
  if (action === 'Need More Data') return 'needs_data';
  if (!requiredEvidenceReady(evidence)) return 'watch_only';
  if (score >= 75) return 'actionable';
  return 'watch_only';
}

function buildOpportunityRows(dashboard = {}, evidence = [], action = 'Hold / Watch') {
  const positionPct = Number(dashboard?.marketPosition?.positionPct || 0);
  const ownRate = dashboard?.marketPosition?.hotelPrice;
  const event = evidence.find((item) => item.key === 'event_pressure');
  const mice = evidence.find((item) => item.key === 'mice_pressure');
  const wedding = evidence.find((item) => item.key === 'wedding_pressure');
  const ota = evidence.find((item) => item.key === 'ota_rate');
  const competitor = evidence.find((item) => item.key === 'competitor_rate');
  const opportunities = [];

  if (positiveNumber(ownRate)) {
    opportunities.push({
      type: 'pricing',
      opportunity: positionPct >= 10
        ? 'Protect premium rate position while monitoring conversion.'
        : 'Review upside opportunity if competitor and OTA proof stay supportive.',
      action: action.includes('Increase')
        ? 'Test controlled rate lift after pickup validation.'
        : 'Hold rate and validate pickup/OTA parity before changing price.',
      evidence: [formatCurrency(ownRate), `Market position ${Math.round(positionPct * 10) / 10}%`],
      owner: 'Revenue manager',
    });
  }

  if (event?.status !== 'missing') {
    opportunities.push({
      type: 'demand',
      opportunity: 'Use event/holiday pressure to protect weekend inventory.',
      action: 'Review minimum stay, discount closures, and package availability for highlighted dates.',
      evidence: [event.value || 'event signal'],
      owner: 'Revenue + Reservations',
    });
  }

  if (mice?.status !== 'missing') {
    opportunities.push({
      type: 'sales',
      opportunity: 'Corporate/MICE demand watch can create weekday group revenue.',
      action: 'Sales team should validate offsite/conference enquiries and quote controlled group rates.',
      evidence: [mice.value || 'MICE signal'],
      owner: 'Sales team',
    });
  }

  if (wedding?.status !== 'missing') {
    opportunities.push({
      type: 'sales',
      opportunity: 'Wedding/group movement can create multi-room block opportunity.',
      action: 'Prepare wedding/group package guardrails and check weekend inventory exposure.',
      evidence: [wedding.value || 'wedding signal'],
      owner: 'Sales + Revenue',
    });
  }

  if (ota?.status !== 'ready' || competitor?.status !== 'ready') {
    opportunities.push({
      type: 'data_quality',
      opportunity: 'Pricing confidence can improve immediately by completing external rate proof.',
      action: 'Capture missing OTA/competitor rows for the selected stay date before issuing strong pricing action.',
      evidence: [ota?.status || 'missing OTA', competitor?.status || 'missing competitor'],
      owner: 'Revenue analyst',
    });
  }

  return opportunities.slice(0, 5);
}

function buildMissingDataActions(evidence = []) {
  return evidence
    .filter((item) => item.status === 'missing' || item.status === 'stale')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      action: item.missingAction,
    }));
}

function buildMorningBrief({ dashboard, evidence, score, action, opportunities }) {
  const date = selectedStayDate(dashboard) || 'selected stay date';
  const missing = missingRequired(evidence);
  const headline = `${date}: ${action}`;
  const proofLine = missing.length
    ? `Strong pricing action remains locked until ${missing.map((item) => item.label.toLowerCase()).join(', ')} are ready.`
    : 'Required pricing evidence is ready for controlled action.';
  return {
    headline,
    bullets: [
      `Revenue readiness: ${score}%.`,
      `Official rate: ${formatCurrency(dashboard?.marketPosition?.hotelPrice)}.`,
      `Market average: ${formatCurrency(dashboard?.marketPosition?.marketAvg)}.`,
      proofLine,
      opportunities[0]?.opportunity || 'No sales opportunity detected yet.',
    ],
    whatsappDraft: [
      `HotelRADAR Morning Revenue Intelligence`,
      headline,
      `Readiness: ${score}%`,
      `Rate: ${formatCurrency(dashboard?.marketPosition?.hotelPrice)} | Market: ${formatCurrency(dashboard?.marketPosition?.marketAvg)}`,
      proofLine,
      opportunities[0] ? `Opportunity: ${opportunities[0].opportunity}` : '',
      opportunities[0] ? `Action: ${opportunities[0].action}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export function buildRevenueIntelligenceWorkingModel(dashboard = {}) {
  const evidence = buildEvidence(dashboard);
  const score = readinessScore(evidence);
  const pricingAction = actionFor(dashboard, score, evidence);
  const opportunities = buildOpportunityRows(dashboard, evidence, pricingAction);
  const missingDataActions = buildMissingDataActions(evidence);
  const trust = trustStatus(pricingAction, score, evidence);

  return {
    version: 'revenue-intelligence-working-model-v1',
    generatedAt: new Date().toISOString(),
    hotelId: dashboard?.hotelId || null,
    city: dashboard?.city || dashboard?.marketContext?.city || null,
    stayDate: selectedStayDate(dashboard),
    executiveSummary: {
      title: pricingAction,
      pricingAction,
      confidenceScore: score,
      trustStatus: trust,
      narrative: trust === 'actionable'
        ? 'Revenue Intelligence has enough fresh pricing evidence for controlled action.'
        : 'Revenue Intelligence can guide the story, but strong pricing action remains guarded until required evidence is ready.',
    },
    evidence,
    opportunityRows: opportunities,
    missingDataActions,
    morningBrief: buildMorningBrief({
      dashboard,
      evidence,
      score,
      action: pricingAction,
      opportunities,
    }),
    activationPhases: [
      { phase: 1, label: 'Structured pilot data', status: 'implemented' },
      { phase: 2, label: 'Manual verified signal input', status: 'implemented' },
      { phase: 3, label: 'Live source adapters', status: 'next' },
      { phase: 4, label: 'Automated morning intelligence brief', status: 'model_ready' },
      { phase: 5, label: 'Client delivery and feedback loop', status: 'model_ready' },
    ],
  };
}
