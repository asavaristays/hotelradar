import { parseServerError, readResponseBody } from '../http.js';

function readSessionToken() {
  try {
    const raw = localStorage.getItem('radar_session');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.token || '';
  } catch {
    return '';
  }
}

export async function queryLeadRadar(prompt) {
  const token = readSessionToken();
  const response = await fetch('/api/leadradar/query', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: String(prompt || '').trim(),
    }),
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to query LeadRADAR');
    throw new Error(parsed.message);
  }

  const body = await readResponseBody(response);
  return body.json || { hotels: [], total: 0 };
}

export async function getLeadRadarSummary(city) {
  const token = readSessionToken();
  const query = city ? `?city=${encodeURIComponent(String(city).trim())}` : '';
  const response = await fetch(`/api/leadradar/summary${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load LeadRADAR summary');
    throw new Error(parsed.message);
  }

  const body = await readResponseBody(response);
  return body.json || {
    hotelsWithoutChatbot: 0,
    hotelsLowRating: 0,
    hotelsHighReviewVolume: 0,
    totalOpportunities: 0,
  };
}

export async function getLeadRadarHotels(city, { limit = 100 } = {}) {
  const token = readSessionToken();
  const params = new URLSearchParams();

  if (city) {
    params.set('city', String(city).trim());
  }

  if (limit != null) {
    params.set('limit', String(limit));
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/leadradar/hotels${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Unable to load LeadRADAR hotels');
    throw new Error(parsed.message);
  }

  const body = await readResponseBody(response);
  return body.json || { hotels: [], total: 0 };
}
