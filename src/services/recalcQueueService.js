import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  claimNextRecalcJob,
  completeRecalcJob,
  enqueueRecalcJob,
  failRecalcJob,
  getRecalcJobById,
} from '../repositories/recalcJobRepository.js';
import { recalculateDashboard } from './dashboardService.js';

function retryDelaySeconds(attempts) {
  const base = Number(env.recalcQueueRetryBaseSeconds || 20);
  const max = Number(env.recalcQueueRetryMaxSeconds || 300);
  const delay = base * (2 ** Math.max(0, Number(attempts || 1) - 1));
  return Math.min(max, Math.max(base, delay));
}

function summarizeDashboard(result) {
  return {
    hotelId: result.hotelId,
    demandScore: Number(result.demandScore || 0),
    demandLevel: result.demandLevel || 'Moderate',
    suggestedBase: Number(result?.suggestedPricing?.base || 0),
    riskLevel: result?.suggestedPricing?.riskLevel || 'Low',
    lastUpdated: result.lastUpdated || new Date().toISOString(),
  };
}

export async function enqueueRecalculationJob({
  hotelId,
  requestedBy = null,
  source = 'api',
  payload = {},
  priority = 100,
  maxAttempts = Number(env.recalcQueueMaxAttempts || 3),
}) {
  const row = await enqueueRecalcJob({
    hotelId,
    payload,
    requestedBy,
    source,
    priority,
    maxAttempts,
  });

  return {
    id: row.id,
    hotelId: row.hotel_id,
    status: row.status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || maxAttempts),
    createdAt: row.created_at,
  };
}

export async function getRecalculationJobStatus(jobId) {
  const row = await getRecalcJobById(jobId);
  if (!row) return null;
  return {
    id: row.id,
    hotelId: row.hotel_id,
    status: row.status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
    source: row.source,
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    result: row.result_snapshot || {},
  };
}

export async function processNextRecalculationJob() {
  const job = await claimNextRecalcJob();
  if (!job) return null;

  const startedAt = Date.now();
  try {
    logger.info('recalc_job_started', {
      jobId: job.id,
      hotelId: job.hotel_id,
      attempts: Number(job.attempts || 0),
      maxAttempts: Number(job.max_attempts || 0),
    });

    const payload = job.payload || {};
    const dashboard = await recalculateDashboard(job.hotel_id, {
      triggered_by: payload.triggered_by || 'queue',
      source: payload.source || job.source || 'queue',
      user_id: payload.user_id || job.requested_by || null,
      user_role: payload.user_role || null,
      checkin_date: payload.checkin_date || null,
      manual_signal_overrides: payload.manual_signal_overrides || null,
    });

    const summary = summarizeDashboard(dashboard);
    await completeRecalcJob(job.id, summary);

    logger.info('recalc_job_completed', {
      jobId: job.id,
      hotelId: job.hotel_id,
      durationMs: Date.now() - startedAt,
      demandScore: summary.demandScore,
      demandLevel: summary.demandLevel,
    });

    return {
      jobId: job.id,
      hotelId: job.hotel_id,
      status: 'completed',
      summary,
    };
  } catch (error) {
    const attempts = Number(job.attempts || 0);
    const maxAttempts = Number(job.max_attempts || 1);
    const retryAfterSeconds = retryDelaySeconds(attempts);
    const failed = await failRecalcJob({
      jobId: job.id,
      attempts,
      maxAttempts,
      retryAfterSeconds,
      errorMessage: error.message || 'Recalculation failed.',
    });

    logger.error('recalc_job_failed', {
      jobId: job.id,
      hotelId: job.hotel_id,
      attempts,
      maxAttempts,
      retryAfterSeconds,
      status: failed?.status || 'failed',
      error: error.message,
    });

    return {
      jobId: job.id,
      hotelId: job.hotel_id,
      status: failed?.status || 'failed',
      errorMessage: error.message || 'Recalculation failed.',
    };
  }
}
