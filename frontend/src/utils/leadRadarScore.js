function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeOpportunityScore(rawScore) {
  const safeScore = Math.max(0, toNumber(rawScore, 0));
  if (safeScore <= 100) {
    return Math.max(0, Math.min(100, Math.round(safeScore)));
  }

  const normalized = 18 * Math.log10(safeScore + 1) + 10;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function getOpportunityScoreTone(score) {
  const safeScore = normalizeOpportunityScore(score);
  if (safeScore >= 80) return 'leadScoreBadge-hot';
  if (safeScore >= 50) return 'leadScoreBadge-warm';
  return 'leadScoreBadge-cool';
}
