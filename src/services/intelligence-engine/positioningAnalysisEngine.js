import { average, round } from '../../utils/math.js';

function quarterLabel(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${quarter}`;
}

function recommendationFromPosition(positionPercent, confidence) {
  if (positionPercent > 15) {
    return confidence === 'Low'
      ? 'Over market with low confidence. Hold for 24h and reduce 5-8% if parity gap persists.'
      : 'Over market. Reduce 5-10% to improve conversion and parity.'
  }
  if (positionPercent < -15) {
    return confidence === 'Low'
      ? 'Under market with low confidence. Increase cautiously by 3-5% and monitor pickup.'
      : 'Under market. Increase 5-10% to capture ADR upside.'
  }
  return 'Near market median. Maintain rate and monitor competitor movement daily.';
}

function confidenceSmoothingFactor(confidence) {
  if (confidence === 'High') return 1;
  if (confidence === 'Medium') return 0.7;
  return 0.5;
}

function median(values = []) {
  const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid];
  return (clean[mid - 1] + clean[mid]) / 2;
}

function resolveConfidenceByDate(marketConfidenceIndex) {
  const map = new Map();
  for (const row of marketConfidenceIndex || []) {
    const date = String(row?.date || '').trim();
    if (!date) continue;
    map.set(date, {
      confidence: row.market_confidence || 'Low',
      score: Number(row.confidence_score || 0),
    });
  }
  return map;
}

/**
 * Confidence-adjusted pricing position analysis.
 * @param {{
 *  hotel:string,
 *  hotelRates:Array<{date:string,rate:number}>,
 *  competitorNormalizedRates:Array<{date:string,normalized_rate:number}>,
 *  marketConfidenceIndex:Array<{date:string,market_confidence:string,confidence_score:number}>
 * }} input
 * @returns {{
 *  hotel:string,
 *  date_range:string,
 *  position_percent:number,
 *  confidence:string,
 *  recommendation:string,
 *  quarterly_trend:Array<{quarter:string,avg_position_percent:number}>,
 *  anomalies:Array<{date:string,type:string,message:string}>
 * }}
 */
export function analyzeHotelPositioning(input = {}) {
  const hotel = String(input.hotel || '').trim() || 'Unknown Hotel';
  const hotelRates = Array.isArray(input.hotelRates) ? input.hotelRates : [];
  const competitorRows = Array.isArray(input.competitorNormalizedRates)
    ? input.competitorNormalizedRates
    : [];
  const confidenceByDate = resolveConfidenceByDate(input.marketConfidenceIndex || []);

  const hotelByDate = new Map();
  for (const row of hotelRates) {
    const date = String(row?.date || '').trim();
    const rate = Number(row?.rate);
    if (!date || !Number.isFinite(rate) || rate <= 0) continue;
    hotelByDate.set(date, rate);
  }

  const competitorByDate = new Map();
  for (const row of competitorRows) {
    const date = String(row?.date || '').trim();
    const rate = Number(row?.normalized_rate);
    if (!date || !Number.isFinite(rate) || rate <= 0) continue;
    if (!competitorByDate.has(date)) competitorByDate.set(date, []);
    competitorByDate.get(date).push(rate);
  }

  const dates = [...hotelByDate.keys()].filter((date) => competitorByDate.has(date)).sort();
  const timeline = [];
  const anomalies = [];
  let previousRaw = null;
  let previousAdjusted = null;

  for (const date of dates) {
    const hotelRate = hotelByDate.get(date);
    const competitorMedian = median(competitorByDate.get(date));
    if (!Number.isFinite(competitorMedian) || competitorMedian <= 0) continue;

    const rawPosition = ((hotelRate - competitorMedian) / competitorMedian) * 100;
    const confidenceMeta = confidenceByDate.get(date) || { confidence: 'Low', score: 0 };
    const alpha = confidenceSmoothingFactor(confidenceMeta.confidence);
    const adjusted =
      previousAdjusted == null ? rawPosition : previousAdjusted + (rawPosition - previousAdjusted) * alpha;

    if (Math.abs(rawPosition) > 35) {
      anomalies.push({
        date,
        type: 'extreme_position',
        message: `Position deviation ${round(rawPosition, 2)}% vs market median.`,
      });
    }
    if (previousRaw != null && Math.abs(rawPosition - previousRaw) > 20) {
      anomalies.push({
        date,
        type: 'position_volatility',
        message: `Day-over-day position swing ${round(rawPosition - previousRaw, 2)}%.`,
      });
    }
    if (confidenceMeta.confidence !== 'High' && Math.abs(rawPosition - adjusted) > 8) {
      anomalies.push({
        date,
        type: 'low_confidence_smoothing',
        message: `Smoothing applied at ${confidenceMeta.confidence} confidence.`,
      });
    }

    timeline.push({
      date,
      confidence: confidenceMeta.confidence,
      confidence_score: confidenceMeta.score,
      raw_position: round(rawPosition, 2),
      adjusted_position: round(adjusted, 2),
    });

    previousRaw = rawPosition;
    previousAdjusted = adjusted;
  }

  const quarterlyMap = new Map();
  for (const point of timeline) {
    const quarter = quarterLabel(point.date);
    if (!quarterlyMap.has(quarter)) quarterlyMap.set(quarter, []);
    quarterlyMap.get(quarter).push(point.adjusted_position);
  }

  const quarterlyTrend = [...quarterlyMap.entries()]
    .map(([quarter, points]) => ({
      quarter,
      avg_position_percent: round(average(points), 2),
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  const latest = timeline[timeline.length - 1] || null;
  const dateRange =
    timeline.length > 0 ? `${timeline[0].date} to ${timeline[timeline.length - 1].date}` : 'N/A';

  return {
    hotel,
    date_range: dateRange,
    position_percent: latest ? round(latest.adjusted_position, 2) : 0,
    confidence: latest?.confidence || 'Low',
    recommendation: recommendationFromPosition(latest?.adjusted_position || 0, latest?.confidence || 'Low'),
    quarterly_trend: quarterlyTrend,
    anomalies,
  };
}
