import { isUuid } from '../utils/validation.js';

const ALLOWED_CITIES = new Set(['Goa', 'Jaipur', 'Mumbai', 'Delhi', 'Gurugram']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function validationError(res, message) {
  return res.status(400).json({
    error: true,
    message,
    code: 'VALIDATION_ERROR',
  });
}

function parseLimit(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return DEFAULT_LIMIT;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  if (parsed > MAX_LIMIT) return null;
  return parsed;
}

function parseOptionalNumber(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  if (typeof rawValue === 'boolean') return rawValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return null;
}

export function validateLeadRadarQuery(req, res, next) {
  const { prompt, filters = {} } = req.body || {};
  if (prompt !== undefined && typeof prompt !== 'string') {
    return validationError(res, 'body.prompt must be a string.');
  }
  if (filters !== undefined && (typeof filters !== 'object' || Array.isArray(filters) || filters === null)) {
    return validationError(res, 'body.filters must be an object.');
  }

  const limit = parseLimit(filters?.limit);
  if (limit === null) {
    return validationError(res, 'body.filters.limit must be a positive integer.');
  }

  req.body = {
    ...(req.body || {}),
    filters: {
      ...(filters || {}),
      limit,
    },
  };
  return next();
}

export function validateLeadRadarHotels(req, res, next) {
  const limit = parseLimit(req.query?.limit);
  if (limit === null) {
    return validationError(res, 'query.limit must be a positive integer.');
  }

  const ratingBelow = parseOptionalNumber(req.query?.ratingBelow);
  if (ratingBelow === null) {
    return validationError(res, 'query.ratingBelow must be a number.');
  }

  const chatbotMissing = parseOptionalBoolean(req.query?.chatbotMissing);
  if (chatbotMissing === null) {
    return validationError(res, 'query.chatbotMissing must be a boolean.');
  }

  if (req.query?.city !== undefined && typeof req.query.city !== 'string') {
    return validationError(res, 'query.city must be a string.');
  }

  req.query = {
    ...req.query,
    limit,
    ratingBelow,
    chatbotMissing,
  };
  return next();
}

export function validateLeadRadarOpportunities(req, res, next) {
  const limit = parseLimit(req.query?.limit);
  if (limit === null) {
    return validationError(res, 'query.limit must be a positive integer.');
  }

  const minLeadScore = parseOptionalNumber(req.query?.minLeadScore);
  if (minLeadScore === null) {
    return validationError(res, 'query.minLeadScore must be a number.');
  }

  if (req.query?.city !== undefined && typeof req.query.city !== 'string') {
    return validationError(res, 'query.city must be a string.');
  }

  req.query = {
    ...req.query,
    limit,
    minLeadScore,
  };
  return next();
}

export function validateLeadRadarHotelId(req, res, next) {
  const hotelId = String(req.params?.hotelId || '').trim();
  if (!isUuid(hotelId)) {
    return validationError(res, 'hotelId must be a valid UUID.');
  }
  return next();
}

export function validateLeadRadarRefresh(req, res, next) {
  const city = String(req.body?.city || '').trim();
  if (!city) {
    return validationError(res, 'body.city is required.');
  }
  if (!ALLOWED_CITIES.has(city)) {
    return validationError(res, 'body.city must be one of Goa, Jaipur, Mumbai, Delhi, or Gurugram.');
  }

  req.body = {
    ...(req.body || {}),
    city,
  };
  return next();
}
