import { getAirfareSeries } from '../../repositories/marketRepository.js';
import { clamp, round2, safePercentChange } from '../../utils/math.js';

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export async function runAirfareTrendEngine(city) {
  const series = await getAirfareSeries(city);
  const recent = series.slice(0, 7).map((r) => Number(r.avg_price));
  const baseline = series.slice(7, 21).map((r) => Number(r.avg_price));

  const recentAvg = average(recent);
  const baselineAvg = average(baseline);
  const changePercent = safePercentChange(recentAvg, baselineAvg);

  let normalized = 40;
  if (changePercent >= 10 && changePercent < 20) normalized = 70;
  if (changePercent >= 20) normalized = 90;
  if (changePercent > 0 && changePercent < 10) normalized = 55;
  if (changePercent < 0) normalized = clamp(40 + changePercent, 10, 40);

  return {
    score: round2(clamp(normalized, 0, 100)),
    changePercent: round2(changePercent),
    recentAvg: round2(recentAvg),
    baselineAvg: round2(baselineAvg),
    completeness: recent.length >= 5 && baseline.length >= 10 ? 100 : 60,
  };
}
