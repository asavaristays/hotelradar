const RATE_SIGNAL_TYPES = new Set(['hotel_rate', 'ota_rate', 'competitor_rate']);

export const LIVE_DATA_SOURCE_TYPES = [
  'official',
  'ota',
  'competitor',
  'airfare',
  'event',
  'weather',
  'search',
  'digital',
  'pms',
  'review',
  'social',
  'system',
];

export const LIVE_DATA_SIGNAL_TYPES = [
  'hotel_rate',
  'ota_rate',
  'competitor_rate',
  'airfare_trend',
  'event_signal',
  'weather_signal',
  'search_trend',
  'digital_asset_signal',
  'pms_pickup',
  'review_velocity',
  'social_signal',
  'freshness',
];

const SOURCE_RELIABILITY = {
  official: 92,
  ota: 84,
  competitor: 78,
  pms: 90,
  event: 74,
  airfare: 70,
  search: 68,
  weather: 72,
  review: 66,
  digital: 64,
  social: 58,
  system: 55,
};

function cleanText(value = '') {
  return String(value || '').trim();
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumericOrNull(value) {
  const parsed = numericOrNull(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeDateKey(value) {
  const raw = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeTimestamp(value, fallbackIso) {
  const raw = cleanText(value);
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

function normalizeSourceType(value = '') {
  const sourceType = cleanText(value).toLowerCase();
  return LIVE_DATA_SOURCE_TYPES.includes(sourceType) ? sourceType : 'system';
}

function normalizeSignalType(value = '', sourceType = 'system') {
  const signalType = cleanText(value).toLowerCase();
  if (LIVE_DATA_SIGNAL_TYPES.includes(signalType)) return signalType;
  if (sourceType === 'official') return 'hotel_rate';
  if (sourceType === 'ota') return 'ota_rate';
  if (sourceType === 'competitor') return 'competitor_rate';
  if (sourceType === 'event') return 'event_signal';
  if (sourceType === 'weather') return 'weather_signal';
  if (sourceType === 'airfare') return 'airfare_trend';
  if (sourceType === 'search') return 'search_trend';
  if (sourceType === 'digital') return 'digital_asset_signal';
  if (sourceType === 'pms') return 'pms_pickup';
  if (sourceType === 'review') return 'review_velocity';
  if (sourceType === 'social') return 'social_signal';
  return 'freshness';
}

function normalizeProofUrl(value = '') {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function defaultFreshnessExpiry(nowIso, sourceType, signalType) {
  const hours =
    RATE_SIGNAL_TYPES.has(signalType)
      ? sourceType === 'official'
        ? 4
        : 2
      : sourceType === 'event'
        ? 72
        : sourceType === 'pms'
          ? 2
          : sourceType === 'search' || sourceType === 'airfare'
            ? 12
            : 24;
  return new Date(new Date(nowIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function trustScore({ sourceType, signalType, proofUrl, observedAt, confidenceScore, valueNumeric }) {
  const base = Number(SOURCE_RELIABILITY[sourceType] || 55);
  const ageHours = Math.max(0, (Date.now() - new Date(observedAt).getTime()) / 36e5);
  const proofBonus = proofUrl ? 8 : RATE_SIGNAL_TYPES.has(signalType) ? -12 : 0;
  const agePenalty = ageHours > 48 ? 18 : ageHours > 24 ? 10 : ageHours > 8 ? 4 : 0;
  const valueBonus = valueNumeric !== null ? 4 : 0;
  const confidenceBlend = clamp(confidenceScore, 0, 100) * 0.2;
  return Math.round(clamp(base + proofBonus + valueBonus + confidenceBlend - 20 - agePenalty, 0, 100));
}

export function normalizeVerifiedLiveObservation(raw = {}, context = {}) {
  const nowIso = context.nowIso || new Date().toISOString();
  const sourceType = normalizeSourceType(raw.sourceType || raw.source_type);
  const signalType = normalizeSignalType(raw.signalType || raw.signal_type, sourceType);
  const checkinDate = normalizeDateKey(raw.checkinDate || raw.checkin_date || raw.stayDate || raw.stay_date);
  const sourceName = cleanText(raw.sourceName || raw.source_name || raw.channel || raw.provider);
  const proofUrl = normalizeProofUrl(raw.proofUrl || raw.proof_url || raw.url || raw.websiteUrl || raw.website_url);
  const observedAt = normalizeTimestamp(raw.observedAt || raw.observed_at || raw.capturedAt || raw.captured_at, nowIso);
  const suppliedNumeric = raw.valueNumeric ?? raw.value_numeric ?? raw.price ?? raw.rate ?? raw.amount ?? null;
  const valueNumeric = RATE_SIGNAL_TYPES.has(signalType)
    ? positiveNumericOrNull(suppliedNumeric)
    : numericOrNull(suppliedNumeric);
  const rejectionReasons = [];

  if (!context.hotelId && !raw.hotelId && !raw.hotel_id) rejectionReasons.push('missing_hotel_id');
  if (!cleanText(context.city || raw.city)) rejectionReasons.push('missing_city');
  if (!checkinDate && signalType !== 'freshness') rejectionReasons.push('missing_checkin_date');
  if (!sourceName) rejectionReasons.push('missing_source_name');
  if (RATE_SIGNAL_TYPES.has(signalType) && valueNumeric === null) rejectionReasons.push('missing_positive_rate');

  if (rejectionReasons.length) {
    return {
      accepted: false,
      reason: rejectionReasons.join(','),
      rejectionReasons,
      observation: null,
    };
  }

  const needsProof = RATE_SIGNAL_TYPES.has(signalType) && !proofUrl;
  const confidenceInput = Number(raw.confidenceScore ?? raw.confidence_score ?? 70);
  const confidenceScore = needsProof ? Math.min(72, confidenceInput) : confidenceInput;
  const verificationStatus = needsProof ? 'needs_proof' : 'verified';
  const freshnessExpiresAt = normalizeTimestamp(
    raw.freshnessExpiresAt || raw.freshness_expires_at,
    defaultFreshnessExpiry(nowIso, sourceType, signalType),
  );
  const observation = {
    runId: raw.runId || raw.run_id || context.runId || null,
    hotelId: raw.hotelId || raw.hotel_id || context.hotelId || null,
    city: cleanText(raw.city || context.city),
    checkinDate,
    sourceType,
    sourceName,
    signalType,
    valueNumeric,
    valueText: cleanText(raw.valueText || raw.value_text),
    currency: cleanText(raw.currency || 'INR') || 'INR',
    proofUrl,
    confidenceScore: clamp(confidenceScore, 0, 100),
    observedAt,
    freshnessExpiresAt,
    metadata: {
      ...(raw.metadata || {}),
      connectorName: cleanText(raw.connectorName || raw.connector_name || raw.sourceAdapter || raw.source_adapter || context.connectorName || 'realtime-signal-capture'),
      verificationStatus,
      verificationReasons: needsProof ? ['rate_evidence_missing_proof_url'] : ['proof_or_source_contract_available'],
      sourceReliability: SOURCE_RELIABILITY[sourceType] || 55,
    },
  };
  observation.metadata.sourceTrustScore = trustScore(observation);

  return {
    accepted: true,
    reason: verificationStatus,
    verificationStatus,
    observation,
  };
}

export function summarizeConnectorVerification(results = []) {
  return results.reduce(
    (summary, result) => {
      if (!result?.accepted) {
        summary.rejectedRows += 1;
        const reason = result?.reason || 'rejected';
        summary.rejectionReasons[reason] = Number(summary.rejectionReasons[reason] || 0) + 1;
        return summary;
      }
      summary.acceptedRows += 1;
      if (result.verificationStatus === 'verified') summary.verifiedRows += 1;
      if (result.verificationStatus === 'needs_proof') summary.needsProofRows += 1;
      const sourceType = result.observation?.sourceType || 'system';
      summary.bySourceType[sourceType] = Number(summary.bySourceType[sourceType] || 0) + 1;
      return summary;
    },
    {
      acceptedRows: 0,
      verifiedRows: 0,
      needsProofRows: 0,
      rejectedRows: 0,
      bySourceType: {},
      rejectionReasons: {},
    },
  );
}
