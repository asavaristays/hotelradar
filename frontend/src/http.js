export async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return {
      text: '',
      json: null,
    };
  }

  try {
    return {
      text,
      json: JSON.parse(text),
    };
  } catch {
    return {
      text,
      json: null,
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

export async function parseServerError(response, fallbackPrefix) {
  const body = await readResponseBody(response);
  const payload = body.json;

  const actor =
    payload?.committedBy === 'user'
      ? 'User Error'
      : payload?.committedBy === 'system'
        ? 'System Error'
        : '';
  const base = payload?.error || payload?.message || '';

  return {
    status: response.status,
    code: payload?.code || '',
    message: actor ? `${actor}: ${base}` : base || fallbackMessage(response, fallbackPrefix, body.text),
    payload,
    rawText: body.text,
    isHtml: isHtmlBody(response, body.text),
  };
}
