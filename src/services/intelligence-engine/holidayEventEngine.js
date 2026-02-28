import { addDays, daysBetween, isWeekend, toDateOnly } from '../../utils/date.js';
import { clamp, round } from '../../utils/math.js';

const citySeasonalEvents = {
  Goa: [
    { name: 'Goa Peak Weekend Circuit', months: [10, 11, 0, 1], score: 10 },
    { name: 'Goa Shoulder Season Events', months: [2, 3, 4, 9], score: 5 },
  ],
  Mumbai: [
    { name: 'Mumbai Business Travel Cycle', months: [0, 1, 6, 7, 8, 9], score: 6 },
    { name: 'Mumbai Event Pulse', months: [10, 11], score: 8 },
  ],
  Jodhpur: [
    { name: 'Rajasthan Heritage Travel Window', months: [9, 10, 11, 0, 1, 2], score: 9 },
    { name: 'Shoulder Leisure Travel', months: [3, 8], score: 4 },
  ],
  Pushkar: [
    { name: 'Pushkar Fair & Pilgrimage Window', months: [9, 10, 11], score: 12 },
    { name: 'Winter Pilgrim Footfall', months: [0, 1, 2], score: 8 },
  ],
  Jawai: [
    { name: 'Leopard Safari Peak Window', months: [9, 10, 11, 0, 1, 2], score: 11 },
    { name: 'Wildlife Shoulder Demand', months: [3, 8], score: 5 },
  ],
  Jaipur: [
    { name: 'Jaipur Heritage Event Window', months: [9, 10, 11, 0, 1, 2], score: 10 },
    { name: 'Jaipur Shoulder Demand', months: [3, 8], score: 5 },
  ],
  Nainital: [
    { name: 'Hill Summer Escape Window', months: [3, 4, 5], score: 11 },
    { name: 'Festive Hill Travel Window', months: [9, 10, 11], score: 8 },
  ],
  Corbett: [
    { name: 'Corbett Safari Peak Window', months: [9, 10, 11, 0, 1, 2], score: 10 },
    { name: 'Weekend Wildlife Demand', months: [3, 4, 5], score: 7 },
  ],
  Mukeshwar: [
    { name: 'Hill Escape Weekend Cycle', months: [2, 3, 4, 5], score: 9 },
    { name: 'Festive Hill Retreat Window', months: [9, 10, 11], score: 8 },
  ],
  Mukteshwar: [
    { name: 'Hill Escape Weekend Cycle', months: [2, 3, 4, 5], score: 9 },
    { name: 'Festive Hill Retreat Window', months: [9, 10, 11], score: 8 },
  ],
};

function holidayWeight(holidayType) {
  if (holidayType === 'long_weekend') return 16;
  if (holidayType === 'public') return 14;
  if (holidayType === 'festival') return 13;
  if (holidayType === 'state') return 12;
  return 8;
}

function proximityFactor(daysAhead) {
  if (daysAhead <= 3) return 1;
  if (daysAhead <= 7) return 0.7;
  return 0.4;
}

/**
 * Build holiday/event compression score over next 14 days.
 * @param {{city:string,date?:Date,holidays:Array<{holiday_date:string,holiday_name:string,holiday_type:string}>}} input
 * @returns {{score:number,surgeWindow:boolean,reason:string,confidence:number,neutral:boolean}}
 */
export function computeHolidayCompression(input) {
  const city = input.city;
  const today = toDateOnly(input.date || new Date());
  const holidays = input.holidays || [];

  let compression = 0;
  const reasons = [];

  for (const holiday of holidays) {
    const daysAhead = daysBetween(today, holiday.holiday_date);
    if (daysAhead < 0 || daysAhead > 14) continue;

    const weighted = holidayWeight(holiday.holiday_type) * proximityFactor(daysAhead);
    compression += weighted;

    if (daysAhead <= 3) {
      reasons.push(`${holiday.holiday_name} within ${daysAhead} day(s) adds compression.`);
    }
  }

  for (let i = 0; i <= 6; i += 1) {
    if (isWeekend(addDays(today, i))) {
      compression += 3;
      break;
    }
  }

  const month = today.getUTCMonth();
  const eventProfiles = citySeasonalEvents[city] || [];
  for (const event of eventProfiles) {
    if (event.months.includes(month)) {
      compression += event.score;
      reasons.push(`${event.name} contributes seasonal compression.`);
      break;
    }
  }

  const score = clamp(38 + compression, 0, 100);
  const surgeWindow = holidays.some((holiday) => {
    const daysAhead = daysBetween(today, holiday.holiday_date);
    return daysAhead >= 0 && daysAhead <= 3 && ['public', 'long_weekend'].includes(holiday.holiday_type);
  });

  return {
    score: round(score),
    surgeWindow,
    reason: reasons.length
      ? reasons.slice(0, 2).join(' ')
      : 'No major holiday or event compression in next 14 days. Dates may vary.',
    confidence: holidays.length ? 88 : 70,
    neutral: holidays.length === 0,
  };
}
