import { average, clamp, percentChange, round } from '../../utils/math.js';

function weightedDelta(row) {
  const now = Number(row.price_today || 0);
  const p48 = Number(row.price_48h_ago || 0);
  const p7d = Number(row.price_7d_ago || p48 || 0);

  if (now <= 0 || p48 <= 0) {
    return null;
  }

  const delta48 = percentChange(now, p48);
  const delta7d = p7d > 0 ? percentChange(now, p7d) : delta48;
  const isOutlier = Math.abs(delta48) > 30 || Math.abs(delta7d) > 30;
  const smoothed = delta48 * 0.6 + delta7d * 0.4;

  return {
    competitorId: row.id,
    competitorName: row.competitor_name || row.id,
    delta48: round(delta48),
    delta7d: round(delta7d),
    smoothed: round(smoothed),
    outlier: isOutlier,
  };
}

/**
 * Normalize competitor momentum using 48h and 7d references and outlier suppression.
 * @param {Array<{id:string,competitor_name?:string,price_today:number,price_48h_ago:number,price_7d_ago?:number}>} rows
 * @returns {{score:number,avgChangePct:number,direction:'up'|'stable'|'down',cleanedCount:number,outlierCount:number,confidence:number}}
 */
export function normalizeCompetitorMomentum(rows = []) {
  const points = rows.map(weightedDelta).filter(Boolean);

  if (!points.length) {
    return {
      score: 50,
      avgChangePct: 0,
      direction: 'stable',
      cleanedCount: 0,
      outlierCount: 0,
      confidence: 55,
    };
  }

  const cleaned = points.filter((point) => !point.outlier);
  const outlierCount = points.length - cleaned.length;

  const usable = cleaned.length ? cleaned : points;
  const avgChangePct = average(usable.map((point) => point.smoothed));
  const score = clamp(((avgChangePct + 30) / 60) * 100, 0, 100);

  let direction = 'stable';
  if (avgChangePct >= 6) direction = 'up';
  if (avgChangePct <= -6) direction = 'down';

  const coverage = usable.length / points.length;
  const confidence = round(clamp(65 + coverage * 25 - outlierCount * 3, 45, 98));

  return {
    score: round(score),
    avgChangePct: round(avgChangePct),
    direction,
    cleanedCount: usable.length,
    outlierCount,
    confidence,
  };
}
