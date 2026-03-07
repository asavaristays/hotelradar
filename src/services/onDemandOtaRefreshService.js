import { spawn } from 'child_process';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runOtaIngestionCycle } from './ingestion/otaIngestionService.js';

const refreshLocks = new Map();
const refreshLastRunAtMs = new Map();
const FALLBACK_MIN_OTA_LIVE_ROWS = 2;
const FALLBACK_STALE_SCRAPE_HOURS = 12;

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCity(value = '') {
  return String(value || '').trim().toLowerCase();
}

function focusCitySet() {
  return new Set((env.focusCities || []).map((city) => normalizeCity(city)).filter(Boolean));
}

function isFocusCity(city = '') {
  return focusCitySet().has(normalizeCity(city));
}

function normalizeRefreshMode(value, fallback = 'off') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'force' || normalized === 'auto' || normalized === 'off') return normalized;
  return fallback;
}

function computeScrapeFreshnessHours(lastScrapedAt) {
  if (!lastScrapedAt) return null;
  const parsed = new Date(lastScrapedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, (Date.now() - parsed.getTime()) / (60 * 60 * 1000));
}

function shouldRefreshDashboard(dashboard = {}, mode = 'off') {
  if (mode === 'off') return false;
  if (mode === 'force') return true;

  const city = normalizeCity(dashboard?.city || '');
  if (!isFocusCity(city)) return false;

  const signalQuality = dashboard?.signalQuality || {};
  const diagnostics = dashboard?.dataHealth?.diagnostics || {};
  const thresholds = diagnostics?.thresholds || {};
  const metrics = diagnostics?.metrics || {};

  const minimumLiveRows = Math.max(
    1,
    toFiniteNumber(
      thresholds?.minOtaLiveRowsForAction,
      toFiniteNumber(signalQuality?.otaLiveRows, FALLBACK_MIN_OTA_LIVE_ROWS),
    ),
  );
  const staleHoursLimit = Math.max(
    1,
    toFiniteNumber(thresholds?.staleScrapeHours, FALLBACK_STALE_SCRAPE_HOURS),
  );

  const modeValue = String(signalQuality?.mode || '').trim().toLowerCase();
  const otaSourceStatus = String(
    signalQuality?.otaSourceStatus || metrics?.otaSourceStatus || '',
  ).trim().toLowerCase();
  const otaLiveRows = toFiniteNumber(
    signalQuality?.otaLiveRows,
    toFiniteNumber(metrics?.otaLiveRows, 0),
  );
  const freshnessHours = computeScrapeFreshnessHours(
    dashboard?.lastScrapedAt || dashboard?.dataHealth?.lastScrapedAt || null,
  );
  const stale = freshnessHours == null || freshnessHours > staleHoursLimit;

  if (modeValue !== 'actionable') return true;
  if (otaSourceStatus !== 'scraped') return true;
  if (otaLiveRows < minimumLiveRows) return true;
  if (stale) return true;
  return false;
}

function runCollectorCommand(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'pipe',
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timeoutHandle = null;

    const finish = (error, result = null) => {
      if (finished) return;
      finished = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (error) {
        error.stdout = stdout.slice(-1000);
        error.stderr = stderr.slice(-1000);
        reject(error);
        return;
      }
      resolve({
        ...(result || {}),
        stdout: stdout.slice(-1000),
        stderr: stderr.slice(-1000),
      });
    };

    timeoutHandle = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      const timeoutError = new Error(`OTA collector command timed out after ${timeoutMs}ms.`);
      timeoutError.code = 'COLLECTOR_TIMEOUT';
      finish(timeoutError);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => {
      if (code === 0) {
        finish(null, { code, signal });
        return;
      }
      const error = new Error(`OTA collector command failed with exit code ${code ?? 'null'}.`);
      error.code = 'COLLECTOR_FAILED';
      error.exitCode = code;
      error.signal = signal || null;
      finish(error);
    });
  });
}

function activeRefreshResult(hotelId, mode, reason) {
  logger.info('dashboard_live_refresh_skipped_active_lock', {
    hotelId,
    mode,
    reason,
  });
  return {
    refreshed: false,
    reason,
    skipped: true,
    cooldownApplied: false,
  };
}

function cooldownRefreshResult(hotelId, mode, reason, cooldownMs) {
  logger.info('dashboard_live_refresh_skipped_cooldown', {
    hotelId,
    mode,
    reason,
    cooldownMs,
  });
  return {
    refreshed: false,
    reason,
    skipped: true,
    cooldownApplied: true,
    cooldownMs,
  };
}

async function executeRefresh(hotelId, options, deps) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(1000, toFiniteNumber(options.timeoutMs, env.onDemandOtaRefreshTimeoutMs));
  const collectorCommand = String(options.collectorCommand || env.otaCollectorCommand || '').trim();
  const result = {
    refreshed: false,
    reason: 'completed',
    collectorRan: false,
    collectorExitCode: null,
    collectorStdout: '',
    collectorStderr: '',
    ingestionSummary: null,
    durationMs: 0,
    dashboard: null,
  };

  try {
    if (collectorCommand) {
      result.collectorRan = true;
      const collectorResult = await runCollectorCommand(collectorCommand, timeoutMs);
      result.collectorExitCode = collectorResult.code ?? 0;
      result.collectorStdout = collectorResult.stdout || '';
      result.collectorStderr = collectorResult.stderr || '';
    }

    result.ingestionSummary = await runOtaIngestionCycle(
      { snapshotPath: env.otaSnapshotFile || '' },
      deps?.otaIngestionDeps,
    );

    result.dashboard = await deps.recalculateDashboard(hotelId, {
      ...(options.context || {}),
      triggered_by: 'dashboard',
      source: 'live-ota-refresh',
    });
    result.refreshed = true;
  } catch (error) {
    result.reason = error?.code || 'refresh_failed';
    logger.warn('dashboard_live_refresh_failed', {
      hotelId,
      reason: result.reason,
      message: error?.message || 'refresh failed',
      stack: error?.stack || null,
    });
  } finally {
    result.durationMs = Date.now() - startedAt;
  }

  return result;
}

export async function maybeRefreshOtaForDashboard(hotelId, dashboard, options = {}, deps = {}) {
  const mode = normalizeRefreshMode(
    options.refreshMode,
    env.enableOnDemandOtaRefresh ? 'auto' : 'off',
  );

  if (!shouldRefreshDashboard(dashboard, mode)) {
    return {
      refreshed: false,
      reason: 'not_required',
      skipped: true,
      cooldownApplied: false,
      dashboard: null,
    };
  }

  if (refreshLocks.has(hotelId)) {
    return activeRefreshResult(hotelId, mode, 'refresh_in_progress');
  }

  const cooldownMs = Math.max(0, toFiniteNumber(options.cooldownMs, env.onDemandOtaRefreshCooldownSec * 1000));
  const forceRefresh = mode === 'force';
  const lastRun = toFiniteNumber(refreshLastRunAtMs.get(hotelId), 0);
  const now = Date.now();
  if (!forceRefresh && cooldownMs > 0 && lastRun > 0 && now - lastRun < cooldownMs) {
    return cooldownRefreshResult(hotelId, mode, 'cooldown_active', cooldownMs);
  }

  const runner = executeRefresh(hotelId, options, deps)
    .then((result) => {
      refreshLastRunAtMs.set(hotelId, Date.now());
      if (result.refreshed) {
        logger.info('dashboard_live_refresh_completed', {
          hotelId,
          mode,
          durationMs: result.durationMs,
          collectorRan: result.collectorRan,
          rowsRead: result.ingestionSummary?.rowsRead ?? 0,
          competitorRowsIngested: result.ingestionSummary?.competitorRowsIngested ?? 0,
          hotelRateRowsIngested: result.ingestionSummary?.hotelRateRowsIngested ?? 0,
        });
      }
      return result;
    })
    .finally(() => {
      refreshLocks.delete(hotelId);
    });

  refreshLocks.set(hotelId, runner);
  return runner;
}

export const __testables = {
  normalizeRefreshMode,
  shouldRefreshDashboard,
  computeScrapeFreshnessHours,
};
