import { clamp, round } from '../utils/math.js';

const DEFAULT_RULES = {
  staleScrapeHours: 12,
  minCompetitorRows: 2,
  minAirfarePoints: 7,
  minConfidenceScore: 65,
  minSampleForAccuracy: 7,
  minForecastAccuracy: 60,
  maxVolatilityError: 25,
  resolvedWindowDays: 7,
};

function normalizeRules(calibration = {}) {
  const cfg = calibration?.global?.dataHealth || {};
  return {
    staleScrapeHours: Number(cfg.staleScrapeHours || DEFAULT_RULES.staleScrapeHours),
    minCompetitorRows: Number(cfg.minCompetitorRows || DEFAULT_RULES.minCompetitorRows),
    minAirfarePoints: Number(cfg.minAirfarePoints || DEFAULT_RULES.minAirfarePoints),
    minConfidenceScore: Number(cfg.minConfidenceScore || DEFAULT_RULES.minConfidenceScore),
    minSampleForAccuracy: Number(cfg.minSampleForAccuracy || DEFAULT_RULES.minSampleForAccuracy),
    minForecastAccuracy: Number(cfg.minForecastAccuracy || DEFAULT_RULES.minForecastAccuracy),
    maxVolatilityError: Number(cfg.maxVolatilityError || DEFAULT_RULES.maxVolatilityError),
    resolvedWindowDays: Number(cfg.resolvedWindowDays || DEFAULT_RULES.resolvedWindowDays),
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
    metrics.otaMaxGapPct <= metrics.otaParityBand
      ? 'In Parity'
      : metrics.otaMaxGapPct <= metrics.otaAlertThreshold
        ? 'Watch'
        : 'Mismatch';

  const signalConsistency =
    metrics.confidenceScore >= 75 && metrics.marketVolatility <= 55
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

  if (metrics.otaMaxGapPct > metrics.otaAlertThreshold) {
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
    competitorRows: Number((input.competitorRates || []).length),
    airfarePoints: Number((input.airfareSeries || []).length),
    scrapeFreshnessHours: freshnessHours(input.lastScrapedAt),
    otaMaxGapPct: Number(input.otaParity?.summary?.maxAbsGapPct || 0),
    otaInParityChannels: Number(input.otaParity?.summary?.inParity || 0),
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

  const base = {
    lastCheckedAt: now.toISOString(),
    lastScrapedAt: input.lastScrapedAt ? new Date(input.lastScrapedAt).toISOString() : null,
    statuses,
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
        competitorRows: metrics.competitorRows,
        airfarePoints: metrics.airfarePoints,
        scrapeFreshnessHours: metrics.scrapeFreshnessHours,
        otaMaxGapPct: round(metrics.otaMaxGapPct, 2),
        confidenceScore: round(clamp(metrics.confidenceScore, 0, 100), 2),
        marketVolatility: round(clamp(metrics.marketVolatility, 0, 100), 2),
        forecastAccuracy: round(clamp(metrics.forecastAccuracy, 0, 100), 2),
        volatilityError: round(Math.max(0, metrics.volatilityError), 2),
        sampleSize: metrics.sampleSize,
      },
      allIssues: sanitizeIssues(trackedIssues, true),
    },
  };
}
