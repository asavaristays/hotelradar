export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function round(value, precision = 2) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function round2(value) {
  return round(value, 2);
}

export function percentChange(current, baseline) {
  if (baseline === 0 || baseline == null || current == null) return 0;
  return ((current - baseline) / baseline) * 100;
}

export function average(values) {
  const filtered = values.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function stdDev(values) {
  const filtered = values.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (filtered.length <= 1) return 0;
  const mean = average(filtered);
  const variance = filtered.reduce((sum, value) => sum + (value - mean) ** 2, 0) / filtered.length;
  return Math.sqrt(variance);
}
