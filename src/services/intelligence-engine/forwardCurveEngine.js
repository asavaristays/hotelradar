import { addDays, dateToKey, daysBetween, isWeekend, toDateOnly } from '../../utils/date.js';
import { clamp, round } from '../../utils/math.js';

function holidayWeight(holidayType) {
  if (holidayType === 'long_weekend') return 14;
  if (holidayType === 'public') return 10;
  if (holidayType === 'festival') return 9;
  if (holidayType === 'state') return 8;
  return 6;
}

function eventScaleFactor(rawScale = '') {
  const value = String(rawScale || '').trim().toLowerCase();
  if (value === 'large') return 1.25;
  if (value === 'small') return 0.75;
  return 1;
}

const eventCityMultiplier = {
  goa: {
    wedding_season: 1.4,
    music_festival: 1.15,
  },
  mumbai: {
    conference: 1.3,
    exhibition: 1.2,
    ipl_match: 1.15,
  },
};

function eventWeight(event = {}, city = '') {
  const explicit = Number(event.impact_score);
  const base = Number.isFinite(explicit) ? explicit : 6;
  const category = String(event.category || 'general').trim().toLowerCase();
  const cityKey = String(city || '').trim().toLowerCase();
  const cityFactor = eventCityMultiplier[cityKey]?.[category] || 1;
  return clamp(base * eventScaleFactor(event.scale) * cityFactor, 2, 24);
}

/**
 * Build deterministic 30-day forward demand curve.
 * @param {{
 *  baseDemandScore:number,
 *  competitorDirection:'up'|'stable'|'down',
 *  competitorAvgChange:number,
 *  seasonScore:number,
 *  holidays:Array<{holiday_date:string,holiday_type:string}>,
 *  events?:Array<{start_date:string,end_date:string,impact_score?:number,scale?:string,category?:string}>,
 *  city?:string,
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
  const events = Array.isArray(input.events) ? input.events : [];
  const city = String(input.city || '').trim();

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

    let eventBoost = 0;
    for (const event of events) {
      const startGap = daysBetween(day, event.start_date);
      const endGap = daysBetween(day, event.end_date || event.start_date);
      const base = eventWeight(event, city);

      if (startGap <= 0 && endGap >= 0) {
        eventBoost += base;
      } else if (startGap === 1) {
        eventBoost += Math.max(2, base * 0.3);
      } else if (startGap === 2) {
        eventBoost += Math.max(1, base * 0.15);
      }
    }

    const score = round(
      clamp(baseDemandScore + trendDecay + weekendBoost + holidayBoost + eventBoost + seasonAdjustment, 0, 100),
      2,
    );
    out.push({ date: dateToKey(day), score });
  }

  return out;
}
