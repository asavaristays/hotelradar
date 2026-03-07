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

export async function parseServerError(response, fallbackPrefix) {
  const body = await readResponseBody(response);
  const payload = body.json;

  const actor =
    payload?.committedBy === 'user'
      ? 'User Error'
      : payload?.committedBy === 'system'
        ? 'System Error'
        : '';
  const base = payload?.error || payload?.message || body.text || '';

  return {
    status: response.status,
    code: payload?.code || '',
    message: actor ? `${actor}: ${base}` : base || `${fallbackPrefix} (HTTP ${response.status}).`,
    payload,
  };
}
