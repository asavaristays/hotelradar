import {
  getAlerts,
  getDataHealth,
  getCompetitiveGrid,
  getDashboard,
  getOtaParity,
  getPerformanceSummary,
  recalculateDashboard,
} from '../services/dashboardService.js';
import {
  enqueueRecalculationJob,
  getRecalculationJobStatus,
} from '../services/recalcQueueService.js';
import { isUuid } from '../utils/validation.js';
import {
  preventReplayTriggers,
  rateLimitRecalculate,
  validateApiKey,
} from '../services/intelligence-engine/securityEngine.js';
import { getCalibration } from '../config/calibration.js';

function invalidHotelIdError(hotelId) {
  const safe = String(hotelId || '').trim();
  const suffix = safe ? ` Received: '${safe}'.` : '';
  const error = new Error(`Invalid hotel id. UUID expected.${suffix}`);
  error.status = 400;
  return error;
}

export async function getHotelDashboard(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const dashboard = await getDashboard(hotelId, {
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
    });
    return res.json(dashboard);
  } catch (error) {
    return next(error);
  }
}

export async function postRecalculate(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    validateApiKey(req);
    preventReplayTriggers(req);
    const calibration = await getCalibration();
    rateLimitRecalculate({
      hotelId,
      userId: req.user?.id || 'api',
      windowMs: Number(calibration.security?.rateLimit?.windowMs || 60000),
      maxRecalculatePerWindow: Number(calibration.security?.rateLimit?.maxRecalculatePerWindow || 3),
    });
    const payload = req.body || {};
    const forceSync = req.query.sync === 'true' || payload?.mode === 'sync' || payload?.wait_for_completion === true;
    if (forceSync) {
      const dashboard = await recalculateDashboard(hotelId, {
        triggered_by: payload.triggered_by || 'manual',
        source: payload.source || 'api',
        user_id: req.user?.id || null,
        user_role: req.user?.role || null,
      });
      return res.status(200).json(dashboard);
    }

    const job = await enqueueRecalculationJob({
      hotelId,
      requestedBy: req.user?.id || null,
      source: payload.source || 'api',
      payload: {
        triggered_by: payload.triggered_by || 'manual',
        source: payload.source || 'api',
        user_id: req.user?.id || null,
        user_role: req.user?.role || null,
      },
      priority: Number(payload.priority || 100),
      maxAttempts: Number(payload.max_attempts || 3),
    });

    return res.status(202).json({
      jobId: job.id,
      status: job.status,
      hotelId,
      pollUrl: `/hotel/${hotelId}/recalculate-jobs/${job.id}`,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getHotelAlerts(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const alerts = await getAlerts(hotelId);
    return res.json({ alerts });
  } catch (error) {
    return next(error);
  }
}

export async function getHotelCompetitiveGrid(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const grid = await getCompetitiveGrid(hotelId);
    return res.json(grid);
  } catch (error) {
    return next(error);
  }
}

export async function getHotelOtaParity(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const otaParity = await getOtaParity(hotelId);
    return res.json(otaParity);
  } catch (error) {
    return next(error);
  }
}

export async function postWebhookRecalculate(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    validateApiKey(req);
    preventReplayTriggers(req);
    const calibration = await getCalibration();
    rateLimitRecalculate({
      hotelId,
      userId: 'webhook',
      windowMs: Number(calibration.security?.rateLimit?.windowMs || 60000),
      maxRecalculatePerWindow: Number(calibration.security?.rateLimit?.maxRecalculatePerWindow || 3),
    });
    const payload = req.body || {};
    const forceSync = req.query.sync === 'true' || payload?.mode === 'sync' || payload?.wait_for_completion === true;
    if (forceSync) {
      const dashboard = await recalculateDashboard(hotelId, {
        triggered_by: payload.trigger || payload.triggered_by || 'webhook',
        source: payload.source || 'n8n',
        user_id: req.user?.id || null,
        user_role: req.user?.role || null,
      });
      return res.status(200).json(dashboard);
    }

    const job = await enqueueRecalculationJob({
      hotelId,
      requestedBy: req.user?.id || null,
      source: payload.source || 'n8n',
      payload: {
        triggered_by: payload.trigger || payload.triggered_by || 'webhook',
        source: payload.source || 'n8n',
        user_id: req.user?.id || null,
        user_role: req.user?.role || null,
      },
      priority: Number(payload.priority || 90),
      maxAttempts: Number(payload.max_attempts || 3),
    });

    return res.status(202).json({
      jobId: job.id,
      status: job.status,
      hotelId,
      pollUrl: `/hotel/${hotelId}/recalculate-jobs/${job.id}`,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getHotelPerformance(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const summary = await getPerformanceSummary(hotelId);
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
}

export async function getHotelRecalculateJob(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    const jobId = String(req.params.jobId || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    if (!isUuid(jobId)) {
      const error = new Error(`Invalid job id. UUID expected. Received: '${jobId}'.`);
      error.status = 400;
      throw error;
    }

    const row = await getRecalculationJobStatus(jobId);
    if (!row || row.hotelId !== hotelId) {
      const error = new Error('Recalculation job not found.');
      error.status = 404;
      throw error;
    }

    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function getHotelDataHealth(req, res, next) {
  try {
    const hotelId = String(req.params.id || '').trim();
    if (!isUuid(hotelId)) throw invalidHotelIdError(hotelId);
    const payload = await getDataHealth(hotelId, {
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
    });
    return res.json(payload || {});
  } catch (error) {
    return next(error);
  }
}
