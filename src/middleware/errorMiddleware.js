import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const PG_USER_ERROR_CODES = new Set(['23505', '23503', '23514', '22P02']);

function mapStatusToCode(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

export function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const inferredStatus =
    !error?.status && PG_USER_ERROR_CODES.has(String(error?.code || '')) ? 400 : null;
  const status = Number(error?.status || inferredStatus || 500);
  const code = String(error?.codeName || mapStatusToCode(status));
  const isInternal = status >= 500;
  const message = isInternal && env.isProduction ? 'Internal server error.' : error.message;
  const timestamp = new Date().toISOString();

  logger.error('http_error', {
    method: req.method,
    path: req.path,
    status,
    code,
    message: error.message,
    stack: env.isProduction ? undefined : error.stack,
  });

  const payload = {
    success: false,
    message,
    code,
    timestamp,
    // Backward-compatible key for current frontend parsing.
    error: message,
  };

  if (error?.committedBy) {
    payload.committedBy = error.committedBy;
  }

  if (!env.isProduction) {
    payload.details = {
      stack: error.stack,
      path: req.path,
      method: req.method,
    };
  }

  return res.status(status).json(payload);
}
