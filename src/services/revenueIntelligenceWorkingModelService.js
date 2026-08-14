function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value) {
  const parsed = numericOrNull(value);
  return parsed !== null && parsed > 0;
}

const ENTERPRISE_HORIZON_DAYS = 15;

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

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))
    ? new Date(`${dateString}T00:00:00Z`)
    : new Date();
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function formatDisplayDate(dateString) {
  const raw = String(dateString || '').slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw || 'selected date';
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
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

function average(values = []) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function rateRowsForDate(dashboard = {}, date) {
  return rows(dashboard).filter((row) => (
    row?.checkinDate === date &&
    ['hotel_rate', 'ota_rate', 'competitor_rate'].includes(String(row?.signalType || '')) &&
    positiveNumber(row?.valueNumeric)
  ));
}

function tariffForDate(dashboard = {}, date, selectedDate) {
  const dateRows = rateRowsForDate(dashboard, date);
  const officialRows = dateRows.filter((row) => row.sourceType === 'official');
  const otaRows = dateRows.filter((row) => row.sourceType === 'ota');
  const competitorRows = dateRows.filter((row) => row.sourceType === 'competitor');
  const selectedOwnRate = date === selectedDate ? numericOrNull(dashboard?.marketPosition?.hotelPrice) : null;
  const selectedMarketRate = date === selectedDate ? numericOrNull(dashboard?.marketPosition?.marketAvg) : null;
  const ownTariff = average(officialRows.map((row) => row.valueNumeric)) || (selectedOwnRate && selectedOwnRate > 0 ? Math.round(selectedOwnRate) : null);
  const otaTariff = average(otaRows.map((row) => row.valueNumeric));
  const competitorTariff = average(competitorRows.map((row) => row.valueNumeric));
  const marketTariff = average([otaTariff, competitorTariff].filter(Boolean)) || (selectedMarketRate && selectedMarketRate > 0 ? Math.round(selectedMarketRate) : null);

  return {
    tariff: ownTariff,
    tariffLabel: ownTariff ? formatCurrency(ownTariff) : 'Not captured',
    marketTariff,
    marketTariffLabel: marketTariff ? formatCurrency(marketTariff) : 'Not captured',
    otaTariff,
    competitorTariff,
    tariffEvidenceRows: dateRows.length,
  };
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
  const summarizedTravelRows = Math.max(
    Number(dashboard?.realtimeSignals?.counts?.airfare || 0),
    Number(dashboard?.realtimeSignals?.counts?.search || 0),
  );
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
      status: signalStatus({ ready: Math.max(travelRows, summarizedTravelRows) >= 2, supporting: Math.max(travelRows, summarizedTravelRows) > 0 }),
      value: Math.max(travelRows, summarizedTravelRows) ? `${Math.max(travelRows, summarizedTravelRows)} signal${Math.max(travelRows, summarizedTravelRows) === 1 ? '' : 's'}` : null,
      count: Math.max(travelRows, summarizedTravelRows),
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

function normalizeImportantDate(entry = {}) {
  const date = String(entry.date || '').slice(0, 10);
  if (!date) return null;
  return {
    date,
    endDate: String(entry.endDate || entry.end_date || entry.date || '').slice(0, 10),
    label: entry.label || entry.name || 'Market pressure date',
    driver: entry.type || entry.source || entry.driver || 'Market signal',
    confidence: String(entry.confidence || entry.priority || '').toLowerCase(),
  };
}

function pressureForDate(date, importantDates = []) {
  const match = importantDates.find((entry) => date >= entry.date && date <= (entry.endDate || entry.date));
  if (!match) {
    return {
      level: 'Proof pending',
      tone: 'missing',
      signal: 'No verified pressure signal captured for this stay date yet.',
      driver: 'Awaiting live rate, OTA, competitor, and demand observations.',
    };
  }
  const high = match.confidence.includes('high') || /independence|long weekend|compression|festival/i.test(match.label);
  return {
    level: high ? 'High watch' : 'Watch',
    tone: high ? 'high' : 'watch',
    signal: match.label,
    driver: match.driver,
  };
}

function actionForEnterpriseDate({ pressure, requiredReady, score }) {
  if (!requiredReady) {
    return 'Do not issue strong pricing action; complete rate proof first.';
  }
  if (pressure.tone === 'high' && score >= 75) {
    return 'Review increase, discount closure, and minimum-stay controls.';
  }
  if (pressure.tone === 'watch') {
    return 'Hold rate and monitor pickup, parity, and comp-set movement.';
  }
  return 'Keep watch; no pressure-led action until evidence changes.';
}

function buildEnterpriseBrief({ dashboard, evidence, score, action, trust, opportunities, missingDataActions }) {
  const stayDate = selectedStayDate(dashboard) || currentDateKey();
  const importantDates = Array.isArray(dashboard?.marketContext?.importantDates)
    ? dashboard.marketContext.importantDates.map(normalizeImportantDate).filter(Boolean)
    : [];
  const required = evidence.filter((item) => item.requiredForStrongAction);
  const requiredReadyCount = required.filter((item) => item.status === 'ready').length;
  const supportingActive = evidence.filter((item) => !item.requiredForStrongAction && item.status !== 'missing').length;
  const requiredReady = required.length > 0 && requiredReadyCount === required.length;
  const missingCritical = missingRequired(evidence);

  const next15Days = Array.from({ length: ENTERPRISE_HORIZON_DAYS }, (_, index) => {
    const date = addDays(stayDate, index);
    const pressure = pressureForDate(date, importantDates);
    const tariff = tariffForDate(dashboard, date, stayDate);
    return {
      date,
      displayDate: formatDisplayDate(date),
      pressure: pressure.level,
      tone: pressure.tone,
      primarySignal: pressure.signal,
      driver: pressure.driver,
      ...tariff,
      evidenceStatus: requiredReady ? 'Ready for controlled review' : 'Rate proof pending',
      recommendedAction: actionForEnterpriseDate({ pressure, requiredReady, score }),
      owner: pressure.tone === 'high' ? 'GM + Revenue' : pressure.tone === 'watch' ? 'Revenue + Sales' : 'Revenue analyst',
    };
  });

  const priorityDates = next15Days.filter((day) => day.tone !== 'missing').slice(0, 5);
  const missingLabels = missingCritical.map((item) => item.label.toLowerCase());

  return {
    version: 'enterprise-revenue-intelligence-v1',
    horizonDays: ENTERPRISE_HORIZON_DAYS,
    decisionPosture: trust === 'actionable'
      ? 'Actionable with controls'
      : trust === 'needs_data'
        ? 'Evidence required'
        : 'Watch-only until proof is complete',
    enterpriseScore: Math.round((score / 10) * 10) / 10,
    morningCadence: 'Every morning: capture sources, verify freshness, recalculate 15-day outlook, deliver GM action brief.',
    marketRead: priorityDates.length
      ? `${priorityDates.length} pressure date${priorityDates.length === 1 ? '' : 's'} need commercial attention in the next ${ENTERPRISE_HORIZON_DAYS} days.`
      : `No verified market-pressure date is ready in the next ${ENTERPRISE_HORIZON_DAYS} days; keep capture running and avoid speculative pricing.`,
    hotelGap: missingLabels.length
      ? `Strong action is blocked by missing ${missingLabels.join(', ')}.`
      : 'Required pricing evidence is ready; use demand pressure to guide controlled action.',
    commercialFocus: opportunities[0]?.opportunity || 'Complete verified data capture before presenting strong recommendations.',
    proofContract: {
      requiredReady: requiredReadyCount,
      requiredTotal: required.length,
      supportingActive,
      missingCritical: missingCritical.length,
      missingDataActions: missingDataActions.length,
    },
    next15Days,
    priorityDates,
    presentationPromise:
      'HotelRADAR does not sell a mystery score. It gives a traceable daily Revenue Intelligence view: what is happening, what proof exists, what is missing, and what the hotel team should do next.',
  };
}

function buildBetaReadiness({ evidence, opportunities, missingDataActions, score, trust }) {
  const required = evidence.filter((item) => item.requiredForStrongAction);
  const supportingSignals = evidence.filter((item) => !item.requiredForStrongAction);
  const requiredReady = required.filter((item) => item.status === 'ready').length;
  const supportingActive = supportingSignals.filter((item) => item.status !== 'missing').length;
  const missingCritical = missingRequired(evidence);
  const staleSignals = evidence.filter((item) => item.status === 'stale');

  const pillars = [
    {
      key: 'decision_contract',
      label: 'Decision contract',
      status: missingCritical.length ? 'supporting' : 'ready',
      score: missingCritical.length ? 70 : 100,
      proof: missingCritical.length
        ? `${missingCritical.length} required evidence gate${missingCritical.length === 1 ? '' : 's'} still open`
        : 'All required pricing gates are ready',
      nextAction: missingCritical.length
        ? `Complete ${missingCritical.map((item) => item.label.toLowerCase()).join(', ')}`
        : 'Use only controlled, evidence-backed pricing actions',
    },
    {
      key: 'source_health',
      label: 'Source health',
      status: staleSignals.length ? 'stale' : requiredReady >= Math.max(1, required.length - 1) ? 'ready' : 'supporting',
      score: staleSignals.length ? 45 : requiredReady >= Math.max(1, required.length - 1) ? 92 : 68,
      proof: `${requiredReady}/${required.length || 1} required feeds ready`,
      nextAction: staleSignals.length
        ? 'Refresh stale observations before strong action'
        : 'Keep official, OTA, competitor, market price, and freshness feeds refreshed',
    },
    {
      key: 'client_story',
      label: 'Client story',
      status: supportingActive >= 3 ? 'ready' : supportingActive > 0 ? 'supporting' : 'missing',
      score: supportingActive >= 3 ? 90 : supportingActive > 0 ? 66 : 35,
      proof: `${supportingActive}/${supportingSignals.length || 1} demand-pressure layers active`,
      nextAction: 'Separate event, travel, MICE, wedding, and risk signals instead of blending them into one score',
    },
    {
      key: 'commercial_actionability',
      label: 'Commercial actionability',
      status: opportunities.length >= 2 ? 'ready' : opportunities.length ? 'supporting' : 'missing',
      score: opportunities.length >= 2 ? 88 : opportunities.length ? 64 : 30,
      proof: `${opportunities.length} revenue opportunity row${opportunities.length === 1 ? '' : 's'} generated`,
      nextAction: 'Convert signal gaps into daily actions for revenue, sales, and reservations teams',
    },
    {
      key: 'automation_loop',
      label: 'Morning automation loop',
      status: missingDataActions.length <= 2 && trust !== 'needs_data' ? 'supporting' : 'missing',
      score: missingDataActions.length <= 2 && trust !== 'needs_data' ? 72 : 48,
      proof: missingDataActions.length
        ? `${missingDataActions.length} missing-data action${missingDataActions.length === 1 ? '' : 's'} remain`
        : 'Brief can be generated from the current working model',
      nextAction: 'Run scheduled capture, recalculation, PDF/email delivery, and feedback logging every morning',
    },
  ];

  const weightedScore =
    score * 0.35 +
    pillars.reduce((sum, pillar) => sum + pillar.score, 0) / Math.max(1, pillars.length) * 0.65;
  const scoreOutOf10 = Math.round((weightedScore / 10) * 10) / 10;

  return {
    targetScore: 8.5,
    scoreOutOf10,
    status: scoreOutOf10 >= 8.5 ? 'beta_ready' : scoreOutOf10 >= 7 ? 'near_beta_ready' : 'hardening',
    summary:
      scoreOutOf10 >= 8.5
        ? 'Revenue Intelligence is strong enough for controlled client demonstrations, provided source-health remains transparent.'
        : 'The product story is in place, but stronger live source coverage is needed before this reaches the target quality bar.',
    pillars,
    nextToReachTen: [
      'Automated OTA and official-rate capture with proof URL and timestamp for every selected stay date.',
      'PMS/booking-pace and cancellation feed so the system can compare market pressure with actual pickup.',
      'Digital asset intelligence covering Google Business Profile, reviews, website booking flow, metasearch parity, and campaign pressure.',
    ],
  };
}

export function buildRevenueIntelligenceWorkingModel(dashboard = {}) {
  const evidence = buildEvidence(dashboard);
  const score = readinessScore(evidence);
  const pricingAction = actionFor(dashboard, score, evidence);
  const opportunities = buildOpportunityRows(dashboard, evidence, pricingAction);
  const missingDataActions = buildMissingDataActions(evidence);
  const trust = trustStatus(pricingAction, score, evidence);
  const enterpriseBrief = buildEnterpriseBrief({
    dashboard,
    evidence,
    score,
    action: pricingAction,
    trust,
    opportunities,
    missingDataActions,
  });
  const betaReadiness = buildBetaReadiness({
    evidence,
    opportunities,
    missingDataActions,
    score,
    trust,
  });

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
    enterpriseBrief,
    betaReadiness,
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
