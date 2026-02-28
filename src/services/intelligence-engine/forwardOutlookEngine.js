import { addDays, dateToKey, daysBetween, isWeekend, toDateOnly } from '../../utils/date.js';
import { clamp } from '../../utils/math.js';

function heatFromScore(score) {
  if (score <= 20) return 1;
  if (score <= 40) return 2;
  if (score <= 60) return 3;
  if (score <= 80) return 4;
  return 5;
}

function compressionForDate(targetDate, holidays) {
  const sameDay = holidays.find((holiday) => dateToKey(holiday.holiday_date) === dateToKey(targetDate));
  if (sameDay) return sameDay.holiday_name;
  if (isWeekend(targetDate)) return 'Weekend compression';
  return 'Normal demand window';
}

function biasForHeat(heat) {
  if (heat >= 4) return 'Upside';
  if (heat <= 2) return 'Soft';
  return 'Neutral';
}

/**
 * Build a 14-day forward demand outlook strip.
 * @param {{date?:Date,demandScore:number,competitorDirection:'up'|'stable'|'down',holidays:Array<{holiday_date:string,holiday_name:string,holiday_type:string}>}} input
 * @returns {Array<{date:string,heat:number,compression:string,bias:string}>}
 */
export function buildForwardOutlook(input) {
  const today = toDateOnly(input.date || new Date());
  const demandScore = Number(input.demandScore || 50);
  const competitorDirection = input.competitorDirection || 'stable';
  const holidays = Array.isArray(input.holidays) ? input.holidays : [];

  const competitorBias = competitorDirection === 'up' ? 4 : competitorDirection === 'down' ? -4 : 0;

  const outlook = [];
  for (let i = 0; i < 14; i += 1) {
    const day = addDays(today, i);
    let dayAdjustment = competitorBias;

    if (isWeekend(day)) dayAdjustment += 6;

    const upcomingHoliday = holidays.find((holiday) => {
      const gap = daysBetween(day, holiday.holiday_date);
      return gap >= 0 && gap <= 2;
    });

    if (upcomingHoliday?.holiday_type === 'long_weekend') dayAdjustment += 12;
    if (upcomingHoliday?.holiday_type === 'public') dayAdjustment += 9;
    if (upcomingHoliday?.holiday_type === 'regional') dayAdjustment += 6;

    const dayScore = clamp(demandScore + dayAdjustment, 0, 100);
    const heat = heatFromScore(dayScore);

    outlook.push({
      date: dateToKey(day),
      heat,
      compression: compressionForDate(day, holidays),
      bias: biasForHeat(heat),
    });
  }

  return outlook;
}
