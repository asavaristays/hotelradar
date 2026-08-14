import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';

async function parseOrThrow(response, message) {
  if (!response.ok) {
    const parsed = await parseServerError(response, message);
    throw new Error(parsed.message);
  }
  return response.json();
}

export async function createPropertyResearch(token, input) {
  const response = await fetch('/api/leadradar/research', {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return parseOrThrow(response, 'Unable to research property');
}

export async function listPropertyResearch(token, { city = '', limit = 20 } = {}) {
  const response = await fetch(
    buildApiPath('/api/leadradar/research', { city, limit }),
    { headers: buildAuthHeaders(token) },
  );
  const payload = await parseOrThrow(response, 'Unable to load property research');
  return Array.isArray(payload?.jobs) ? payload.jobs : [];
}
