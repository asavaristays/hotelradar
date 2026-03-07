import { clamp, round } from '../utils/math.js';

const DEFAULT_RULES = {
  staleScrapeHours: 12,
  staleEventHours: 24,
  minCompetitorRows: 2,
  minOtaLiveRowsForAction: 2,
  minEventRowsFocusCity: 1,
  minAirfarePoints: 7,
  minConfidenceScore: 65,
  minSampleForAccuracy: 7,
  minForecastAccuracy: 60,
  maxVolatilityError: 25,
  resolvedWindowDays: 7,
};

const FOCUS_CITY_KEYS = new Set(['goa', 'mumbai']);

function normalizeCity(city = '') {
  return String(city || '').trim().toLowerCase();
}

function isFocusCity(city = '') {
  return FOCUS_CITY_KEYS.has(normalizeCity(city));
}

function numericOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRules(calibration = {}) {
  const cfg = calibration?.global?.dataHealth || {};
  return {
    staleScrapeHours: numericOrDefault(cfg.staleScrapeHours, DEFAULT_RULES.staleScrapeHours),
    staleEventHours: numericOrDefault(cfg.staleEventHours, DEFAULT_RULES.staleEventHours),
    minCompetitorRows: numericOrDefault(cfg.minCompetitorRows, DEFAULT_RULES.minCompetitorRows),
    minOtaLiveRowsForAction: numericOrDefault(
      cfg.minOtaLiveRowsForAction,
      DEFAULT_RULES.minOtaLiveRowsForAction,
    ),
    minEventRowsFocusCity: numericOrDefault(
      cfg.minEventRowsFocusCity,
      DEFAULT_RULES.minEventRowsFocusCity,
    ),
    minAirfarePoints: numericOrDefault(cfg.minAirfarePoints, DEFAULT_RULES.minAirfarePoints),
    minConfidenceScore: numericOrDefault(cfg.minConfidenceScore, DEFAULT_RULES.minConfidenceScore),
    minSampleForAccuracy: numericOrDefault(
      cfg.minSampleForAccuracy,
      DEFAULT_RULES.minSampleForAccuracy,
    ),
    minForecastAccuracy: numericOrDefault(
      cfg.minForecastAccuracy,
      DEFAULT_RULES.minForecastAccuracy,
    ),
    maxVolatilityError: numericOrDefault(cfg.maxVolatilityError, DEFAULT_RULES.maxVolatilityError),
    resolvedWindowDays: numericOrDefault(cfg.resolvedWindowDays, DEFAULT_RULES.resolvedWindowDays),
  };
}

function freshnessHours(lastScrapedAt) {
  if (!lastScrapedAt) return null;
  const parsed = new Date(lastScrapedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffHours = (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
  return round(Math.max(0, diffHours), 2);
}

function issue(code, title, severity, message, metadata = {}) {
  return {
    issueCode: code,
    title,
    severity,
    message,
    metadata,
  };
}

function deriveEventFreshnessHours(events = [], explicitSync = null) {
  const explicitHours = freshnessHours(explicitSync);
  if (explicitHours != null) return explicitHours;

  let latestMs = null;
  for (const row of events) {
    const raw = row?.scraped_at || row?.scrapedAt || null;
    if (!raw) continue;
    const parsedMs = new Date(raw).getTime();
    if (Number.isNaN(parsedMs)) continue;
    latestMs = latestMs == null ? parsedMs : Math.max(latestMs, parsedMs);
  }

  if (latestMs == null) return null;
  return freshnessHours(new Date(latestMs).toISOString());
}

function computeStatuses(metrics, rules) {
  const accuracyStatus =
    metrics.sampleSize < rules.minSampleForAccuracy
      ? 'Calibrating'
      : metrics.forecastAccuracy >= rules.minForecastAccuracy &&
          metrics.volatilityError <= rules.maxVolatilityError
        ? 'Reliable'
        : 'Needs Attention';

  const freshnessStatus =
    metrics.scrapeFreshnessHours == null
      ? 'Unknown'
      : metrics.scrapeFreshnessHours <= rules.staleScrapeHours
        ? 'Fresh'
        : 'Stale';

  const otaParityStatus =
    metrics.otaSourceStatus === 'missing'
      ? 'Unavailable'
      : metrics.otaSourceStatus === 'estimated'
        ? 'Estimated'
        : metrics.otaMaxGapPct <= metrics.otaParityBand
          ? 'In Parity'
          : metrics.otaMaxGapPct <= metrics.otaAlertThreshold
            ? 'Watch'
            : 'Mismatch';

  const signalConsistency =
    metrics.competitorRows >= rules.minCompetitorRows &&
    metrics.scrapeFreshnessHours != null &&
    metrics.scrapeFreshnessHours <= rules.staleScrapeHours &&
    metrics.confidenceScore >= 75 &&
    metrics.marketVolatility <= 55
      ? 'Strong'
      : metrics.confidenceScore >= rules.minConfidenceScore
        ? 'Moderate'
        : 'Weak';

  return {
    accuracyStatus,
    freshnessStatus,
    otaParityStatus,
    signalConsistency,
  };
}

function detectIssues(metrics, rules) {
  const issues = [];
  const focusCity = isFocusCity(metrics.city);

  if (metrics.competitorRows < rules.minCompetitorRows) {
    issues.push(
      issue(
        'missing_competitor_data',
        'Competitor Data Incomplete',
        'high',
        `Only ${metrics.competitorRows} competitor row(s) available. Minimum required is ${rules.minCompetitorRows}.`,
        { competitorRows: metrics.competitorRows, minRequired: rules.minCompetitorRows },
      ),
    );
  }

  if (metrics.airfarePoints < rules.minAirfarePoints) {
    issues.push(
      issue(
        'missing_airfare_data',
        'Airfare Signal Incomplete',
        'medium',
        `Only ${metrics.airfarePoints} airfare point(s) available. Minimum required is ${rules.minAirfarePoints}.`,
        { airfarePoints: metrics.airfarePoints, minRequired: rules.minAirfarePoints },
      ),
    );
  }

  if (metrics.scrapeFreshnessHours != null && metrics.scrapeFreshnessHours > rules.staleScrapeHours) {
    issues.push(
      issue(
        'stale_competitor_scrape',
        'Competitor Data Stale',
        'high',
        `Last competitor scrape is ${metrics.scrapeFreshnessHours}h old; freshness SLA is ${rules.staleScrapeHours}h.`,
        { scrapeFreshnessHours: metrics.scrapeFreshnessHours, maxAllowedHours: rules.staleScrapeHours },
      ),
    );
  }

  if (metrics.otaSourceStatus === 'missing') {
    issues.push(
      issue(
        'missing_ota_feed',
        'OTA Feed Missing',
        'medium',
        'No live OTA channel rows were captured for the selected stay date.',
        { otaRows: metrics.otaRows, otaLiveRows: metrics.otaLiveRows },
      ),
    );
  }

  if (metrics.otaSourceStatus === 'estimated') {
    issues.push(
      issue(
        'estimated_ota_feed',
        'OTA Parity Using Estimated Fallback',
        'medium',
        'OTA parity is using estimated market fallback instead of live OTA channel rows.',
        { otaRows: metrics.otaRows, otaLiveRows: metrics.otaLiveRows },
      ),
    );
  }

  if (focusCity && metrics.otaLiveRows < rules.minOtaLiveRowsForAction) {
    issues.push(
      issue(
        'low_live_ota_rows',
        'Live OTA Coverage Incomplete',
        'medium',
        `Only ${metrics.otaLiveRows} live OTA row(s) available. Minimum required for trusted action is ${rules.minOtaLiveRowsForAction}.`,
        { otaLiveRows: metrics.otaLiveRows, minRequired: rules.minOtaLiveRowsForAction },
      ),
    );
  }

  if (focusCity && metrics.eventRows < rules.minEventRowsFocusCity) {
    issues.push(
      issue(
        'missing_city_events',
        'City Event Feed Empty',
        'medium',
        `No city event rows detected for ${metrics.city} in the configured horizon.`,
        { city: metrics.city, eventRows: metrics.eventRows, minRequired: rules.minEventRowsFocusCity },
      ),
    );
  }

  if (
    focusCity &&
    (metrics.eventFreshnessHours == null || metrics.eventFreshnessHours > rules.staleEventHours)
  ) {
    issues.push(
      issue(
        'stale_city_event_feed',
        'City Event Feed Stale',
        'medium',
        metrics.eventFreshnessHours == null
          ? `Event feed freshness is unknown for ${metrics.city}.`
          : `Last event sync is ${metrics.eventFreshnessHours}h old; freshness SLA is ${rules.staleEventHours}h.`,
        {
          city: metrics.city,
          eventFreshnessHours: metrics.eventFreshnessHours,
          maxAllowedHours: rules.staleEventHours,
        },
      ),
    );
  }

  if (metrics.otaSourceStatus === 'scraped' && metrics.otaMaxGapPct > metrics.otaAlertThreshold) {
    issues.push(
      issue(
        'ota_parity_mismatch',
        'OTA Parity Mismatch',
        metrics.otaMaxGapPct > metrics.otaAlertThreshold * 1.5 ? 'high' : 'medium',
        `OTA gap is ${metrics.otaMaxGapPct}% and exceeds alert threshold ${metrics.otaAlertThreshold}%.`,
        {
          otaMaxGapPct: metrics.otaMaxGapPct,
          threshold: metrics.otaAlertThreshold,
          inParityChannels: metrics.otaInParityChannels,
        },
      ),
    );
  }

  if (metrics.confidenceScore < rules.minConfidenceScore) {
    issues.push(
      issue(
        'low_signal_confidence',
        'Low Signal Confidence',
        'medium',
        `Confidence score ${metrics.confidenceScore} is below minimum ${rules.minConfidenceScore}.`,
        { confidenceScore: metrics.confidenceScore, minRequired: rules.minConfidenceScore },
      ),
    );
  }

  if (metrics.sampleSize >= rules.minSampleForAccuracy && metrics.forecastAccuracy < rules.minForecastAccuracy) {
    issues.push(
      issue(
        'low_forecast_accuracy',
        'Forecast Accuracy Below Target',
        'medium',
        `Forecast accuracy ${metrics.forecastAccuracy}% is below target ${rules.minForecastAccuracy}%.`,
        {
          forecastAccuracy: metrics.forecastAccuracy,
          minRequired: rules.minForecastAccuracy,
          sampleSize: metrics.sampleSize,
        },
      ),
    );
  }

  if (metrics.volatilityError > rules.maxVolatilityError) {
    issues.push(
      issue(
        'high_volatility_error',
        'High Volatility Error',
        'medium',
        `Volatility error ${metrics.volatilityError}% is above limit ${rules.maxVolatilityError}%.`,
        { volatilityError: metrics.volatilityError, maxAllowed: rules.maxVolatilityError },
      ),
    );
  }

  return issues;
}

function buildSignalQuality(metrics, rules) {
  const freshnessKnown = metrics.scrapeFreshnessHours != null;
  const freshnessOk = freshnessKnown && metrics.scrapeFreshnessHours <= rules.staleScrapeHours;
  const competitorOk = metrics.competitorRows >= rules.minCompetitorRows;
  const otaLiveOk = metrics.otaLiveRows >= rules.minOtaLiveRowsForAction;
  const confidenceOk = metrics.confidenceScore >= rules.minConfidenceScore;
  const calibrationReady = metrics.sampleSize >= rules.minSampleForAccuracy;
  const focusCity = isFocusCity(metrics.city);
  const eventFreshnessKnown = metrics.eventFreshnessHours != null;
  const eventFreshnessOk = eventFreshnessKnown && metrics.eventFreshnessHours <= rules.staleEventHours;
  const eventCoverageOk = !focusCity || metrics.eventRows >= rules.minEventRowsFocusCity;

  const blockers = [];
  const cautions = [];

  if (!competitorOk) {
    blockers.push(`${metrics.competitorRows}/${rules.minCompetitorRows} competitor rows captured`);
  }
  if (!freshnessKnown) {
    blockers.push('scrape freshness is unknown');
  } else if (!freshnessOk) {
    blockers.push(`last scrape is ${metrics.scrapeFreshnessHours}h old`);
  }
  if (!calibrationReady) {
    blockers.push(`${metrics.sampleSize}/${rules.minSampleForAccuracy} validated snapshots`);
  }

  if (metrics.otaSourceStatus === 'missing') {
    cautions.push('no live OTA feed for the selected stay date');
  } else if (metrics.otaSourceStatus === 'estimated') {
    cautions.push('OTA parity is still using estimated fallback');
  }
  if (focusCity && !otaLiveOk) {
    cautions.push(
      `live OTA rows ${metrics.otaLiveRows}/${rules.minOtaLiveRowsForAction} are below trusted action threshold`,
    );
  }

  if (focusCity && !eventCoverageOk) {
    cautions.push(`event feed has no rows for ${metrics.city} in the active horizon`);
  }
  if (focusCity && !eventFreshnessKnown) {
    cautions.push(`event feed freshness is unknown for ${metrics.city}`);
  } else if (focusCity && !eventFreshnessOk) {
    cautions.push(`event feed is stale at ${metrics.eventFreshnessHours}h (limit ${rules.staleEventHours}h)`);
  }

  if (!confidenceOk) {
    cautions.push(`confidence ${metrics.confidenceScore} is below target ${rules.minConfidenceScore}`);
  }

  if (!blockers.length && metrics.forecastAccuracy < rules.minForecastAccuracy) {
    cautions.push(`forecast accuracy ${metrics.forecastAccuracy}% is below target ${rules.minForecastAccuracy}%`);
  }

  if (blockers.length) {
    return {
      grade: 'Calibrating',
      mode: 'calibrating',
      summary: `Signal quality is still calibrating: ${blockers.join('; ')}.`,
      competitorRows: metrics.competitorRows,
      otaRows: metrics.otaRows,
      otaLiveRows: metrics.otaLiveRows,
      otaSourceStatus: metrics.otaSourceStatus,
      confidenceScore: round(metrics.confidenceScore, 1),
      sampleSize: metrics.sampleSize,
      eventRows: metrics.eventRows,
      eventFreshnessHours: metrics.eventFreshnessHours,
    };
  }

  if (cautions.length) {
    return {
      grade: 'Review',
      mode: 'verify',
      summary: `Verify before acting: ${cautions.join('; ')}.`,
      competitorRows: metrics.competitorRows,
      otaRows: metrics.otaRows,
      otaLiveRows: metrics.otaLiveRows,
      otaSourceStatus: metrics.otaSourceStatus,
      confidenceScore: round(metrics.confidenceScore, 1),
      sampleSize: metrics.sampleSize,
      eventRows: metrics.eventRows,
      eventFreshnessHours: metrics.eventFreshnessHours,
    };
  }

  return {
    grade: 'Trusted',
    mode: 'actionable',
    summary: `Signal quality is trusted: ${metrics.competitorRows} competitor rows and ${metrics.otaLiveRows} OTA channel rows captured within ${metrics.scrapeFreshnessHours}h.`,
    competitorRows: metrics.competitorRows,
    otaRows: metrics.otaRows,
    otaLiveRows: metrics.otaLiveRows,
    otaSourceStatus: metrics.otaSourceStatus,
    confidenceScore: round(metrics.confidenceScore, 1),
    sampleSize: metrics.sampleSize,
    eventRows: metrics.eventRows,
    eventFreshnessHours: metrics.eventFreshnessHours,
  };
}

function sanitizeIssues(issues, includeDiagnostics) {
  return issues.map((row) => ({
    issueCode: row.issue_code || row.issueCode,
    title: row.title,
    severity: row.severity,
    status: row.status || 'open',
    message: row.message,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    ...(includeDiagnostics
      ? {
          metadata: row.metadata || {},
          firstDetectedAt: row.first_detected_at
            ? new Date(row.first_detected_at).toISOString()
            : null,
          lastDetectedAt: row.last_detected_at ? new Date(row.last_detected_at).toISOString() : null,
          resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
          reopenCount: Number(row.reopen_count || 0),
        }
      : {}),
  }));
}

export async function computeDataHealthSnapshot(input, deps = {}) {
  const role = String(input.viewerRole || 'hotel_user').trim();
  const rules = normalizeRules(input.calibration || {});
  const now = new Date();

  const metrics = {
    city: String(input.city || ''),
    competitorRows: Number((input.competitorRates || []).length),
    airfarePoints: Number((input.airfareSeries || []).length),
    scrapeFreshnessHours: freshnessHours(input.lastScrapedAt),
    eventRows: Number((input.events || []).length),
    eventFreshnessHours: deriveEventFreshnessHours(input.events || [], input.lastEventSync || null),
    otaMaxGapPct: Number(input.otaParity?.summary?.maxAbsGapPct || 0),
    otaInParityChannels: Number(input.otaParity?.summary?.inParity || 0),
    otaRows: Number((input.otaParity?.rows || []).length),
    otaLiveRows: Number(
      (input.otaParity?.rows || []).filter((row) => !row?.estimated && Number(row?.otaPrice || 0) > 0).length,
    ),
    otaSourceStatus: input.otaParity?.sourceStatus || 'missing',
    otaParityBand: Number(input.otaParity?.parityThresholdPct || 2),
    otaAlertThreshold: Number(input.otaParity?.alertThresholdPct || 5),
    confidenceScore: Number(input.confidence?.score || 0),
    marketVolatility: Number(input.marketStability?.volatilityScore || 50),
    sampleSize: Number(input.performanceSummary?.sampleSize || 0),
    forecastAccuracy: Number(
      input.performanceSummary?.rollingAccuracy30d ?? input.performanceSummary?.directionAccuracy ?? 0,
    ),
    volatilityError: Number(input.performanceSummary?.stabilityDeviation || 0),
  };

  const detected = detectIssues(metrics, rules);
  const detectedCodes = detected.map((entry) => entry.issueCode);

  if (deps.upsertDataHealthIssue && deps.resolveInactiveDataHealthIssues && deps.listDataHealthIssues) {
    await Promise.all(
      detected.map((entry) =>
        deps.upsertDataHealthIssue({
          hotelId: input.hotelId,
          issueCode: entry.issueCode,
          title: entry.title,
          severity: entry.severity,
          message: entry.message,
          metadata: entry.metadata || {},
          detectedAt: now,
        }),
      ),
    );
    await deps.resolveInactiveDataHealthIssues(input.hotelId, detectedCodes);
  }

  const trackedIssues = deps.listDataHealthIssues
    ? await deps.listDataHealthIssues(input.hotelId, 100)
    : detected.map((entry) => ({
        issue_code: entry.issueCode,
        title: entry.title,
        severity: entry.severity,
        status: 'open',
        message: entry.message,
        metadata: entry.metadata,
        updated_at: now.toISOString(),
      }));

  const openCount = trackedIssues.filter((row) => row.status === 'open').length;
  const resolvedCount = trackedIssues.filter((row) => row.status === 'resolved').length;
  const resolvedCutoff = Date.now() - rules.resolvedWindowDays * 24 * 60 * 60 * 1000;
  const resolvedRecently = trackedIssues.filter(
    (row) => row.status === 'resolved' && row.updated_at && Date.parse(row.updated_at) >= resolvedCutoff,
  );

  const includeDiagnostics = role === 'admin' || role === 'super_admin';
  const statuses = computeStatuses(metrics, rules);
  const signalQuality = buildSignalQuality(metrics, rules);

  const base = {
    lastCheckedAt: now.toISOString(),
    lastScrapedAt: input.lastScrapedAt ? new Date(input.lastScrapedAt).toISOString() : null,
    statuses,
    signalQuality,
    issueCounts: {
      open: openCount,
      resolved: resolvedCount,
    },
    knownIssues: sanitizeIssues(
      trackedIssues.filter((row) => row.status === 'open'),
      includeDiagnostics,
    ),
    resolvedRecently: sanitizeIssues(resolvedRecently, includeDiagnostics),
  };

  if (!includeDiagnostics) {
    return {
      ...base,
      note: 'Showing client-safe health summary. Internal diagnostics are hidden.',
    };
  }

  return {
    ...base,
    diagnostics: {
      thresholds: rules,
      metrics: {
        city: metrics.city,
        competitorRows: metrics.competitorRows,
        airfarePoints: metrics.airfarePoints,
        scrapeFreshnessHours: metrics.scrapeFreshnessHours,
        eventRows: metrics.eventRows,
        eventFreshnessHours: metrics.eventFreshnessHours,
        otaRows: metrics.otaRows,
        otaLiveRows: metrics.otaLiveRows,
        otaSourceStatus: metrics.otaSourceStatus,
        otaMaxGapPct: round(metrics.otaMaxGapPct, 2),
        confidenceScore: round(clamp(metrics.confidenceScore, 0, 100), 2),
        marketVolatility: round(clamp(metrics.marketVolatility, 0, 100), 2),
        forecastAccuracy: round(clamp(metrics.forecastAccuracy, 0, 100), 2),
        volatilityError: round(Math.max(0, metrics.volatilityError), 2),
        sampleSize: metrics.sampleSize,
      },
      signalQuality,
      allIssues: sanitizeIssues(trackedIssues, true),
    },
  };
}
