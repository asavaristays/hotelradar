export const SESSION_EXPIRED_EVENT = 'radar:session-expired';

export async function readResponseBody(response) {
  let text = '';
  try {
    text = await response.text();
  } catch {
    return {
      text: '',
      json: null,
      readError: true,
    };
  }

  if (!text) {
    return {
      text: '',
      json: null,
      readError: false,
    };
  }

  try {
    return {
      text,
      json: JSON.parse(text),
      readError: false,
    };
  } catch {
    return {
      text,
      json: null,
      readError: false,
    };
  }
}

function normalizeFallbackPrefix(fallbackPrefix) {
  const raw = String(fallbackPrefix || 'Request failed').trim();
  return raw.replace(/[.\s]+$/, '') || 'Request failed';
}

function isHtmlBody(response, text = '') {
  const contentType = response?.headers?.get?.('content-type') || '';
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return true;
  }

  return /^\s*(<!doctype html|<html|<head|<body)\b/i.test(String(text || ''));
}

function fallbackMessage(response, fallbackPrefix, text = '') {
  const prefix = normalizeFallbackPrefix(fallbackPrefix);
  if (isHtmlBody(response, text) || [502, 503, 504].includes(Number(response?.status || 0))) {
    return `${prefix}. Service is temporarily unavailable. Please retry in a minute.`;
  }
  return `${prefix} (HTTP ${response.status}).`;
}

function createSessionExpiredEvent(detail) {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(SESSION_EXPIRED_EVENT, { detail });
  }

  const event = new Event(SESSION_EXPIRED_EVENT);
  Object.defineProperty(event, 'detail', {
    value: detail,
    enumerable: true,
  });
  return event;
}

function notifySessionExpired(detail = {}) {
  if (typeof globalThis.dispatchEvent !== 'function') return false;

  try {
    return globalThis.dispatchEvent(createSessionExpiredEvent(detail));
  } catch {
    return false;
  }
}

export async function parseServerError(response, fallbackPrefix) {
  const body = await readResponseBody(response);
  const payload = body.json;
  const status = Number(response?.status || 0);
  const isUnauthorized = status === 401 || String(payload?.code || '').trim() === 'UNAUTHORIZED';
  const sessionExpiredMessage = 'Session expired. Please sign in again.';

  if (isUnauthorized) {
    notifySessionExpired({
      message: sessionExpiredMessage,
      status,
      code: payload?.code || 'UNAUTHORIZED',
    });
  }

  const actor =
    payload?.committedBy === 'user'
      ? 'User Error'
      : payload?.committedBy === 'system'
        ? 'System Error'
        : '';
  const base = payload?.error || payload?.message || '';

  return {
    status,
    code: payload?.code || (isUnauthorized ? 'UNAUTHORIZED' : ''),
    message: isUnauthorized
      ? sessionExpiredMessage
      : actor
        ? `${actor}: ${base}`
        : base || fallbackMessage(response, fallbackPrefix, body.text),
    payload,
    rawText: body.text,
    isHtml: isHtmlBody(response, body.text),
    sessionExpired: isUnauthorized,
  };
}

export function buildAuthHeaders(token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${safeToken}`,
  };
}

export function buildApiPath(path, params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (value == null) {
      continue;
    }

    const safe = String(value).trim();
    if (!safe) {
      continue;
    }

    search.set(key, safe);
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
