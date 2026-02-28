import {
  createCity,
  createHotel,
  createSeasonProfile,
  createState,
  deleteHotelProfile,
  listHotelProfiles,
  listPasswordResetRequests,
  listUsageAnalytics,
  listCities,
  listHolidayCalendars,
  listSeasonProfiles,
  listStates,
  resolvePasswordResetRequest,
  upsertHotelUserForHotel,
  updateHotelProfile,
  updateHotelSubscription,
} from '../repositories/adminRepository.js';
import { listAuditLogs } from '../repositories/auditRepository.js';
import { getCalibrationRows, upsertCalibrationSetting } from '../repositories/calibrationRepository.js';
import { hashPassword } from '../services/authService.js';
import { recalculateDashboard } from '../services/dashboardService.js';
import {
  getCalibrationRunHistory,
  getCanaryList,
  ingestOutcomeCsv,
  labelAlert,
  runNightlyCalibration,
  runCityCalibration,
  setHotelCanary,
} from '../services/intelligence-engine/calibrationFasttrackEngine.js';

function validatePriceBounds(body = {}) {
  const min = Number(body.base_price_min);
  const max = Number(body.base_price_max);

  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    const error = new Error('base_price_min cannot be greater than base_price_max.');
    error.status = 400;
    throw error;
  }
}

function normalizeHotelCreateError(error) {
  if (!error) return error;

  if (error.code === '23514' && error.constraint === 'hotels_city_check') {
    const mapped = new Error(
      'Selected city is not enabled in the database yet. Run latest migrations and retry.',
    );
    mapped.status = 400;
    return mapped;
  }

  if (error.code === '23503' && error.constraint === 'hotels_city_id_fkey') {
    const mapped = new Error('Selected city is invalid. Please choose a valid city from the list.');
    mapped.status = 400;
    return mapped;
  }

  if (error.code === '23505' && error.constraint === 'users_email_key') {
    const mapped = new Error('This email is already linked to another user.');
    mapped.status = 409;
    return mapped;
  }

  return error;
}

export async function postState(req, res, next) {
  try {
    const row = await createState(req.body || {});
    return res.status(201).json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postSeasonProfile(req, res, next) {
  try {
    const row = await createSeasonProfile(req.body || {});
    return res.status(201).json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postCity(req, res, next) {
  try {
    const row = await createCity(req.body || {});
    return res.status(201).json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postHotel(req, res, next) {
  try {
    validatePriceBounds(req.body || {});
    const row = await createHotel(req.body || {});
    if (!row) {
      const error = new Error('Unable to create hotel. Verify city_id.');
      error.status = 400;
      throw error;
    }

    // Run deterministic baseline generation immediately for newly onboarded hotels.
    const dashboard = await recalculateDashboard(row.id, {
      triggered_by: 'admin',
      source: 'admin-hotel-create',
      user_id: req.user?.id || null,
      user_role: req.user?.role || 'admin',
    });

    let user = null;
    const profile = req.body?.user_profile;
    if (profile?.email) {
      user = await upsertHotelUserForHotel({
        hotelId: row.id,
        email: String(profile.email).trim().toLowerCase(),
        passwordHash: profile.password ? hashPassword(String(profile.password)) : null,
        fullName: String(profile.full_name || '').trim(),
        mobileNo: String(profile.mobile_no || '').trim(),
      });
    }

    return res.status(201).json({
      hotel: row,
      user,
      dashboard,
    });
  } catch (error) {
    return next(normalizeHotelCreateError(error));
  }
}

export async function getHotelProfiles(req, res, next) {
  try {
    const rows = await listHotelProfiles({
      stateId: req.query.state_id || '',
      cityId: req.query.city_id || '',
      subscriptionStatus: req.query.subscription_status || '',
      search: String(req.query.search || '').trim(),
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function patchHotelProfile(req, res, next) {
  try {
    validatePriceBounds(req.body || {});
    const row = await updateHotelProfile(req.params.id, req.body || {});
    if (!row) {
      const error = new Error('Hotel not found.');
      error.status = 404;
      throw error;
    }
    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function patchHotelUserProfile(req, res, next) {
  try {
    const { email = '', full_name = '', mobile_no = '', password = '' } = req.body || {};
    const safeEmail = String(email).trim().toLowerCase();
    if (!safeEmail) {
      const error = new Error('email is required.');
      error.status = 400;
      throw error;
    }

    const row = await upsertHotelUserForHotel({
      hotelId: req.params.id,
      email: safeEmail,
      passwordHash: password ? hashPassword(String(password)) : null,
      fullName: String(full_name || '').trim(),
      mobileNo: String(mobile_no || '').trim(),
    });

    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function deleteHotel(req, res, next) {
  try {
    const row = await deleteHotelProfile(req.params.id);
    if (!row) {
      const error = new Error('Hotel not found.');
      error.status = 404;
      throw error;
    }
    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function getUsageAnalytics(req, res, next) {
  try {
    const rows = await listUsageAnalytics({
      hotelId: req.query.hotel_id || '',
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getPasswordResetRequestList(req, res, next) {
  try {
    const rows = await listPasswordResetRequests({
      status: req.query.status || '',
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function postResolvePasswordReset(req, res, next) {
  try {
    const { new_password = '' } = req.body || {};
    if (!new_password || String(new_password).length < 6) {
      const error = new Error('new_password is required and must be at least 6 characters.');
      error.status = 400;
      throw error;
    }

    const row = await resolvePasswordResetRequest({
      requestId: req.params.id,
      resolvedByUserId: req.user?.id || null,
      passwordHash: hashPassword(String(new_password)),
    });

    if (!row) {
      const error = new Error('Reset request not found or already resolved.');
      error.status = 404;
      throw error;
    }

    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function getStateList(req, res, next) {
  try {
    const rows = await listStates();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getCityList(req, res, next) {
  try {
    const rows = await listCities({
      stateId: req.query.state_id || '',
    });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getSeasonProfileList(req, res, next) {
  try {
    const rows = await listSeasonProfiles();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getHolidayCalendarList(req, res, next) {
  try {
    const rows = await listHolidayCalendars();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function patchHotelSubscription(req, res, next) {
  try {
    const status = req.body?.subscription_status;
    if (!status) {
      const error = new Error('subscription_status is required.');
      error.status = 400;
      throw error;
    }
    const row = await updateHotelSubscription(req.params.id, status);
    if (!row) {
      const error = new Error('Hotel not found.');
      error.status = 404;
      throw error;
    }
    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function getAuditLogList(req, res, next) {
  try {
    const limit = Number(req.query.limit || 100);
    const rows = await listAuditLogs(Number.isFinite(limit) ? limit : 100);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getCalibration(req, res, next) {
  try {
    const rows = await getCalibrationRows();
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function putCalibration(req, res, next) {
  try {
    const { key, value } = req.body || {};
    if (!key || value == null) {
      const error = new Error('key and value are required.');
      error.status = 400;
      throw error;
    }
    const row = await upsertCalibrationSetting(key, value);
    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postOutcomeCsvUpload(req, res, next) {
  try {
    const csvText =
      typeof req.body === 'string'
        ? req.body
        : String(req.body?.csv || '');

    if (!csvText.trim()) {
      const error = new Error('CSV payload is required. Send text/csv body or JSON { csv: "..." }.');
      error.status = 400;
      throw error;
    }

    const result = await ingestOutcomeCsv({
      csvText,
      source: String(req.body?.source || req.query.source || 'manual_csv'),
      defaultCity: String(req.body?.city || req.query.city || ''),
      uploadedBy: req.user?.id || null,
    });
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postAlertFeedback(req, res, next) {
  try {
    const row = await labelAlert({
      alertId: req.params.id,
      feedback: req.body?.feedback,
      note: req.body?.note || '',
      userId: req.user?.id || null,
    });
    return res.status(201).json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postRunCityCalibration(req, res, next) {
  try {
    const payload = req.body || {};
    const minObservationsRaw = payload.min_observations;
    const canaryFractionRaw = payload.canary_fraction;
    const minObservations =
      minObservationsRaw == null || String(minObservationsRaw).trim() === ''
        ? null
        : Number(minObservationsRaw);
    const canaryFraction =
      canaryFractionRaw == null || String(canaryFractionRaw).trim() === ''
        ? null
        : Number(canaryFractionRaw);

    const result = await runCityCalibration({
      city: payload.city,
      days: Number(payload.days || 14),
      minObservations,
      canaryFraction,
      dryRun: Boolean(payload.dry_run),
      triggeredBy: req.user?.id || null,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getCalibrationRunList(req, res, next) {
  try {
    const rows = await getCalibrationRunHistory(Number(req.query.limit || 50));
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getCanaryHotelList(req, res, next) {
  try {
    const rows = await getCanaryList(String(req.query.city || ''));
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function patchCanaryHotel(req, res, next) {
  try {
    const row = await setHotelCanary({
      hotelId: req.params.id,
      enabled: Boolean(req.body?.enabled),
      overrideWeights: req.body?.override_weights || {},
      userId: req.user?.id || null,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
}

export async function postRunNightlyCalibration(req, res, next) {
  try {
    const payload = req.body || {};
    const minObservationsRaw = payload.min_observations;
    const canaryFractionRaw = payload.canary_fraction;
    const minObservations =
      minObservationsRaw == null || String(minObservationsRaw).trim() === ''
        ? null
        : Number(minObservationsRaw);
    const canaryFraction =
      canaryFractionRaw == null || String(canaryFractionRaw).trim() === ''
        ? null
        : Number(canaryFractionRaw);

    const result = await runNightlyCalibration({
      days: Number(payload.days || 14),
      minObservations,
      canaryFraction,
      dryRun: Boolean(payload.dry_run),
      triggeredBy: req.user?.id || null,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
