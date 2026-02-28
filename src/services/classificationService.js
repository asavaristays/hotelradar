export function classifyDemandScore(score) {
  if (score <= 40) return 'Low';
  if (score <= 65) return 'Moderate';
  if (score <= 85) return 'High';
  return 'Surge';
}

export function recommendationForLevel(level) {
  switch (level) {
    case 'Low':
      return 'Defensive pricing: consider tactical discounts and tighter inventory controls.';
    case 'Moderate':
      return 'Maintain pricing with optional slight increase (2-5%) on high-conversion dates.';
    case 'High':
      return 'Increase rates by 8-15% while monitoring pickup and competitor response.';
    case 'Surge':
      return 'Increase rates by 15-25%, enforce minimum stay rules on peak dates.';
    default:
      return 'Maintain current pricing and monitor demand signals.';
  }
}
