import { isUuid } from '../utils/validation.js';

const ALLOWED_CITIES = new Set(['Goa', 'Mumbai', 'Jaipur']);
const ALLOWED_SOURCE_TYPES = new Set(['website', 'google', 'ota', 'competitor', 'operator']);

function fail(res, message) {
  return res.status(400).json({
    error: true,
    message,
    code: 'VALIDATION_ERROR',
  });
}

export function validateCreatePropertyResearch(req, res, next) {
  const hotelName = String(req.body?.hotelName || '').trim();
  const city = String(req.body?.city || '').trim();
  const area = String(req.body?.area || '').trim() || null;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];

  if (hotelName.length < 2 || hotelName.length > 180) {
    return fail(res, 'body.hotelName must contain between 2 and 180 characters.');
  }
  if (!ALLOWED_CITIES.has(city)) {
    return fail(res, 'body.city must be one of Goa, Mumbai, or Jaipur.');
  }
  if (area && area.length > 120) {
    return fail(res, 'body.area must not exceed 120 characters.');
  }
  if (sources.length > 8) {
    return fail(res, 'body.sources supports a maximum of 8 evidence URLs.');
  }

  const normalizedSources = [];
  for (const source of sources) {
    const sourceType = String(source?.sourceType || '').trim().toLowerCase();
    const url = String(source?.url || '').trim();
    if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return fail(res, 'Each sourceType must be website, google, ota, competitor, or operator.');
    }
    if (!url || url.length > 2048) {
      return fail(res, 'Each evidence source must include a URL of at most 2048 characters.');
    }
    normalizedSources.push({ sourceType, url });
  }

  req.body = { hotelName, city, area, sources: normalizedSources };
  return next();
}

export function validatePropertyResearchJobId(req, res, next) {
  if (!isUuid(String(req.params?.jobId || '').trim())) {
    return fail(res, 'jobId must be a valid UUID.');
  }
  return next();
}

export function validateListPropertyResearch(req, res, next) {
  const city = String(req.query?.city || '').trim() || null;
  const limit = req.query?.limit == null ? 20 : Number(req.query.limit);
  if (city && !ALLOWED_CITIES.has(city)) {
    return fail(res, 'query.city must be one of Goa, Mumbai, or Jaipur.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fail(res, 'query.limit must be an integer between 1 and 100.');
  }
  req.query = { ...req.query, city, limit };
  return next();
}
