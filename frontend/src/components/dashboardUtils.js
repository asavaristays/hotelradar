export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatPercent(value, digits = 1) {
  const number = Number(value || 0);
  const rounded = Number(number.toFixed(digits));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function demandTone(level) {
  switch (level) {
    case 'Low':
      return 'low';
    case 'Moderate':
      return 'moderate';
    case 'High':
      return 'high';
    case 'Surge':
      return 'surge';
    default:
      return 'moderate';
  }
}

export function riskTone(level) {
  switch (level) {
    case 'High':
      return 'high';
    case 'Medium':
      return 'medium';
    case 'Not assessed':
      return 'pending';
    default:
      return 'low';
  }
}

export function stabilityTone(status) {
  switch (status) {
    case 'Highly Volatile':
      return 'high';
    case 'Volatile':
      return 'medium';
    default:
      return 'low';
  }
}
