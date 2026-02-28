import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const recalcBuckets = new Map();
const replayCache = new Map();

function nowMs() {
  return Date.now();
}

function cleanOldEntries(map, ttlMs) {
  const cutoff = nowMs() - ttlMs;
  for (const [key, value] of map.entries()) {
    if (value.ts < cutoff) map.delete(key);
  }
}

export function logSecurityEvents(event, meta = {}) {
  logger.warn('security_event', { event, ...meta });
}

export function validateApiKey(req) {
  if (!env.requireApiKey) return true;

  const requestKey = req.headers['x-api-key'];
  if (!requestKey || requestKey !== env.internalApiKey) {
    const error = new Error('Unauthorized: invalid API key.');
    error.status = 401;
    logSecurityEvents('invalid_api_key', { path: req.path });
    throw error;
  }
  return true;
}

export function validateUserRole(user, allowedRoles = []) {
  if (!user) {
    const error = new Error('Unauthorized: missing user session.');
    error.status = 401;
    logSecurityEvents('missing_user_session');
    throw error;
  }
  if (!allowedRoles.length || allowedRoles.includes(user.role)) return true;

  const error = new Error('Forbidden: insufficient role.');
  error.status = 403;
  logSecurityEvents('role_denied', { userId: user.id, role: user.role, allowedRoles });
  throw error;
}

export function preventReplayTriggers(req, replayWindowMs = 5 * 60 * 1000) {
  cleanOldEntries(replayCache, replayWindowMs);
  const token =
    req.headers['x-request-id'] ||
    req.body?.trigger_id ||
    req.body?.idempotency_key;

  if (!token) return true;

  if (replayCache.has(token)) {
    const error = new Error('Replay detected: duplicate trigger token.');
    error.status = 409;
    logSecurityEvents('replay_blocked', { token });
    throw error;
  }

  replayCache.set(token, { ts: nowMs() });
  return true;
}

export function rateLimitRecalculate({
  hotelId,
  userId = 'system',
  windowMs = 60000,
  maxRecalculatePerWindow = 3,
}) {
  cleanOldEntries(recalcBuckets, windowMs);
  const bucketKey = `${hotelId}:${userId}`;
  const current = recalcBuckets.get(bucketKey);
  const ts = nowMs();

  if (!current || ts - current.windowStart >= windowMs) {
    recalcBuckets.set(bucketKey, { count: 1, windowStart: ts, ts });
    return true;
  }

  if (current.count >= maxRecalculatePerWindow) {
    const error = new Error('Too many recalculations. Try again shortly.');
    error.status = 429;
    logSecurityEvents('rate_limit_blocked', { bucketKey, count: current.count, windowMs });
    throw error;
  }

  recalcBuckets.set(bucketKey, {
    count: current.count + 1,
    windowStart: current.windowStart,
    ts,
  });
  return true;
}

