function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function evidenceByKey(evidence = [], key) {
  return evidence.find((item) => item?.key === key) || {};
}

function isReady(item = {}) {
  return item.status === 'ready';
}

function isMissing(item = {}) {
  return !item.status || item.status === 'missing' || item.status === 'stale';
}

function valueOf(item = {}) {
  return clean(item.value || 'Not captured');
}

export function buildClientInsightNarrative({ dashboard = {}, model = {} } = {}) {
  const evidence = Array.isArray(model.evidence) ? model.evidence : [];
  const summary = model.executiveSummary || {};
  const officialRate = evidenceByKey(evidence, 'official_rate');
  const otaRate = evidenceByKey(evidence, 'ota_rate');
  const competitorRate = evidenceByKey(evidence, 'competitor_rate');
  const marketPrice = evidenceByKey(evidence, 'market_price');
  const eventPressure = evidenceByKey(evidence, 'event_pressure');
  const travelPressure = evidenceByKey(evidence, 'travel_pressure');
  const micePressure = evidenceByKey(evidence, 'mice_pressure');
  const weddingPressure = evidenceByKey(evidence, 'wedding_pressure');
  const weatherRisk = evidenceByKey(evidence, 'weather_risk');
  const freshness = evidenceByKey(evidence, 'freshness');
  const marketPositionPct = Number(dashboard?.marketPosition?.positionPct);
  const hasMarketPosition = Number.isFinite(marketPositionPct);

  const marketRead = [
    `Market pricing evidence is ${isReady(competitorRate) && isReady(otaRate) ? 'decision-ready' : 'still incomplete'}: own rate ${valueOf(officialRate)}, market ${valueOf(marketPrice)}, OTA ${valueOf(otaRate)}, competitor ${valueOf(competitorRate)}.`,
    isReady(eventPressure)
      ? `Demand pressure is visible through ${valueOf(eventPressure)}.`
      : 'Event and holiday demand pressure is not strong enough yet for a standalone pricing call.',
    travelPressure.status
      ? `Travel/search pressure is ${travelPressure.status} with ${valueOf(travelPressure)}.`
      : 'Travel/search intent is not connected for this date.',
  ];

  const whereHotelIsGoingWrong = [];
  if (hasMarketPosition && marketPositionPct > 12) {
    whereHotelIsGoingWrong.push(
      `The hotel is priced about ${marketPositionPct.toFixed(1)}% above the normalized market. That premium can work only if pickup, parity, and direct-channel conversion are watched daily.`,
    );
  } else if (hasMarketPosition && marketPositionPct < -8) {
    whereHotelIsGoingWrong.push(
      `The hotel appears under-positioned versus market by about ${Math.abs(marketPositionPct).toFixed(1)}%. If demand remains firm, this is a rate-lift opportunity.`,
    );
  }
  if (isMissing(micePressure)) {
    whereHotelIsGoingWrong.push('MICE/offsite opportunity is not captured yet, so weekday group demand can be missed by sales.');
  }
  if (isMissing(weddingPressure)) {
    whereHotelIsGoingWrong.push('Wedding/group movement is not captured yet, so multi-room block opportunities may not reach revenue planning early enough.');
  }
  if (!isReady(freshness)) {
    whereHotelIsGoingWrong.push('Freshness is weak; stale evidence can create confident-looking but unsafe recommendations.');
  }

  const commercialActions = [
    summary.pricingAction
      ? `Revenue: follow ${summary.pricingAction} only after checking pickup and channel parity for the selected stay date.`
      : 'Revenue: hold pricing until the action contract has enough evidence.',
    isReady(eventPressure)
      ? 'Reservations: protect inventory around event/holiday dates; review minimum stay and discount closure.'
      : 'Reservations: keep event watch active before changing restrictions.',
    isMissing(micePressure)
      ? 'Sales: begin MICE/offsite signal capture for nearby venues, corporate events, and weekday enquiries.'
      : 'Sales: validate MICE leads and quote controlled group rates.',
    isMissing(weddingPressure)
      ? 'Sales: add wedding and banquet enquiry tracking to avoid missing group blocks.'
      : 'Sales: convert wedding demand into package and inventory guardrails.',
  ];

  const digitalAssetWatch = [
    'Digital asset intelligence is a beta expansion area: Google Business Profile, review velocity, website rate visibility, booking-engine friction, metasearch parity, and social/search demand should be monitored by location.',
    isReady(otaRate)
      ? `OTA visibility is present through ${valueOf(otaRate)}; next step is to compare official/direct conversion against OTA pressure.`
      : 'OTA visibility is missing; without it, the hotel cannot know if public channels are undercutting or hiding demand.',
  ];

  const betaHardening = [
    'Every recommendation must show source readiness, freshness, and missing evidence.',
    'No missing rate, market price, or suggested price should become zero.',
    'Strong pricing actions must remain locked unless own rate, OTA, competitor, market normalization, and freshness are ready.',
    'Future live beta should add PMS pickup, booking pace, cancellation, review velocity, and digital asset audit feeds.',
  ];

  return {
    marketRead,
    whereHotelIsGoingWrong: whereHotelIsGoingWrong.length
      ? whereHotelIsGoingWrong
      : ['No critical commercial gap is confirmed from current evidence; continue daily signal capture to strengthen the call.'],
    commercialActions,
    digitalAssetWatch,
    betaHardening,
    healthLine: isReady(freshness)
      ? `Evidence freshness is ready with ${valueOf(freshness)}.`
      : 'Evidence freshness needs attention before strong recommendations.',
    riskLine: weatherRisk.status
      ? `Risk layer: ${weatherRisk.label || 'Weather / risk'} is ${weatherRisk.status}${weatherRisk.value ? ` (${weatherRisk.value})` : ''}.`
      : 'Risk layer is not connected yet.',
  };
}
