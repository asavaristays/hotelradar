import { addDays, dateToKey, daysBetween, isWeekend, toDateOnly } from '../../utils/date.js';
import { clamp, round } from '../../utils/math.js';

function holidayWeight(holidayType) {
  if (holidayType === 'long_weekend') return 14;
  if (holidayType === 'public') return 10;
  if (holidayType === 'festival') return 9;
  if (holidayType === 'state') return 8;
  return 6;
}

/**
 * Build deterministic 30-day forward demand curve.
 * @param {{
 *  baseDemandScore:number,
 *  competitorDirection:'up'|'stable'|'down',
 *  competitorAvgChange:number,
 *  seasonScore:number,
 *  holidays:Array<{holiday_date:string,holiday_type:string}>,
 *  startDate?:Date
 * }} input
 * @returns {Array<{date:string,score:number}>}
 */
export function buildForwardCurve(input) {
  const startDate = toDateOnly(input.startDate || new Date());
  const baseDemandScore = Number(input.baseDemandScore || 50);
  const competitorDirection = input.competitorDirection || 'stable';
  const competitorAvgChange = Number(input.competitorAvgChange || 0);
  const seasonScore = Number(input.seasonScore || 50);
  const holidays = Array.isArray(input.holidays) ? input.holidays : [];

  const directionMultiplier = competitorDirection === 'up' ? 1 : competitorDirection === 'down' ? -1 : 0;
  const trendStrength = clamp(competitorAvgChange * 0.45 * directionMultiplier, -8, 8);
  const seasonAdjustment = (seasonScore - 50) * 0.15;

  const out = [];
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(startDate, i);
    const trendDecay = trendStrength * (1 - i / 35);
    const weekendBoost = isWeekend(day) ? 4 : 0;

    let holidayBoost = 0;
    for (const holiday of holidays) {
      const gap = daysBetween(day, holiday.holiday_date);
      if (gap === 0) holidayBoost += holidayWeight(holiday.holiday_type);
      if (gap === 1) holidayBoost += 4;
      if (gap === 2) holidayBoost += 2;
    }

    const score = round(clamp(baseDemandScore + trendDecay + weekendBoost + holidayBoost + seasonAdjustment, 0, 100), 2);
    out.push({ date: dateToKey(day), score });
  }

  return out;
}
