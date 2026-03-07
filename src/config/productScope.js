import { env } from './env.js';

const DEFAULT_FOCUS_CITIES = ['Goa', 'Mumbai'];

function normalizeCity(value = '') {
  return String(value || '').trim().toLowerCase();
}

function toUniqueCities(values = []) {
  const unique = new Map();
  for (const raw of values) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const key = normalizeCity(trimmed);
    if (!key) continue;
    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  }
  return Array.from(unique.values());
}

const focusCities = toUniqueCities(env.focusCities?.length ? env.focusCities : DEFAULT_FOCUS_CITIES);
const focusCityKeys = focusCities.map(normalizeCity);

function isCityInScope(city = '') {
  return focusCityKeys.includes(normalizeCity(city));
}

function assertCityInScope(city = '', label = 'city') {
  if (!isCityInScope(city)) {
    const error = new Error(
      `${label} is outside current product scope. Only ${focusCities.join(', ')} are enabled.`,
    );
    error.status = 400;
    throw error;
  }
}

export {
  focusCities,
  focusCityKeys,
  isCityInScope,
  assertCityInScope,
  normalizeCity,
};
