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

const eventCategoryWeights = {
  music_festival: 18,
  ipl_match: 14,
  exhibition: 8,
  conference: 7,
  public_holiday: 12,
  cultural_festival: 10,
  wedding_season: 6,
  general: 5,
};

const eventScaleFactors = {
  small: 0.7,
  medium: 1,
  large: 1.25,
};

const eventConfidenceFactors = {
  confirmed: 1,
  tentative: 0.75,
  rumor: 0.45,
};

const cityCategoryMultipliers = {
  goa: {
    wedding_season: 1.45,
    music_festival: 1.2,
  },
  mumbai: {
    conference: 1.35,
    exhibition: 1.25,
    ipl_match: 1.15,
  },
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

function normalizeCategory(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  return value ? value.replace(/\s+/g, '_') : 'general';
}

function normalizeScale(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'medium';
}

function normalizeConfidence(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'confirmed' || value === 'tentative' || value === 'rumor') return value;
  return 'confirmed';
}

function eventLeadFactor(daysAhead, daysToEnd) {
  if (daysToEnd < 0 || daysAhead > 30) return 0;
  if (daysAhead < 0 && daysToEnd >= 0) return 1.15; // currently ongoing
  if (daysAhead <= 3) return 1;
  if (daysAhead <= 7) return 0.85;
  if (daysAhead <= 14) return 0.7;
  return 0.5;
}

function eventBaseWeight(event = {}, city = '') {
  const category = normalizeCategory(event.category);
  const scale = normalizeScale(event.scale);
  const confidence = normalizeConfidence(event.confidence);
  const explicitImpact = Number(event.impact_score);
  const cityKey = String(city || '').trim().toLowerCase();

  const categoryWeight = eventCategoryWeights[category] || eventCategoryWeights.general;
  const scaleFactor = eventScaleFactors[scale] || 1;
  const confidenceFactor = eventConfidenceFactors[confidence] || 1;
  const baseline = Number.isFinite(explicitImpact) ? explicitImpact : categoryWeight;
  const cityFactor = cityCategoryMultipliers[cityKey]?.[category] || 1;

  return baseline * scaleFactor * confidenceFactor * cityFactor;
}

/**
 * Build holiday/event compression score over next 14 days.
 * @param {{
 *   city:string,
 *   date?:Date,
 *   holidays:Array<{holiday_date:string,holiday_name:string,holiday_type:string}>,
 *   events?:Array<{event_name:string,start_date:string,end_date:string,category?:string,scale?:string,impact_score?:number,confidence?:string}>
 * }} input
 * @returns {{
 *   score:number,
 *   surgeWindow:boolean,
 *   reason:string,
 *   confidence:number,
 *   neutral:boolean,
 *   holidayBoost:number,
 *   eventBoost:number,
 *   eventShare:number,
 *   weddingShare:number,
 *   corporateShare:number,
 *   eventCategoryShare:Record<string, number>
 * }}
 */
export function computeHolidayCompression(input) {
  const city = input.city;
  const today = toDateOnly(input.date || new Date());
  const holidays = input.holidays || [];
  const events = input.events || [];

  let holidayBoost = 0;
  let eventBoost = 0;
  const eventCategoryBoost = {};
  const reasons = [];

  for (const holiday of holidays) {
    const daysAhead = daysBetween(today, holiday.holiday_date);
    if (daysAhead < 0 || daysAhead > 14) continue;

    const weighted = holidayWeight(holiday.holiday_type) * proximityFactor(daysAhead);
    holidayBoost += weighted;

    if (daysAhead <= 3) {
      reasons.push(`${holiday.holiday_name} within ${daysAhead} day(s) adds compression.`);
    }
  }

  for (let i = 0; i <= 6; i += 1) {
    if (isWeekend(addDays(today, i))) {
      holidayBoost += 3;
      break;
    }
  }

  const month = today.getUTCMonth();
  const eventProfiles = citySeasonalEvents[city] || [];
  for (const event of eventProfiles) {
    if (event.months.includes(month)) {
      eventBoost += event.score;
      reasons.push(`${event.name} contributes seasonal compression.`);
      break;
    }
  }

  for (const event of events) {
    const daysAhead = daysBetween(today, event.start_date);
    const daysToEnd = daysBetween(today, event.end_date || event.start_date);
    const leadFactor = eventLeadFactor(daysAhead, daysToEnd);
    if (leadFactor <= 0) continue;

    const category = normalizeCategory(event.category);
    const weighted = eventBaseWeight(event, city) * leadFactor;
    eventBoost += weighted;
    eventCategoryBoost[category] = Number(eventCategoryBoost[category] || 0) + weighted;

    if (daysAhead >= 0 && daysAhead <= 3) {
      reasons.push(`${event.event_name || 'City event'} starts in ${daysAhead} day(s).`);
    } else if (daysAhead > 3 && daysAhead <= 14) {
      reasons.push(`${event.event_name || 'City event'} is approaching in ${daysAhead} day(s).`);
    } else if (daysAhead < 0 && daysToEnd >= 0) {
      reasons.push(`${event.event_name || 'City event'} is currently live.`);
    }
  }

  const compression = holidayBoost + eventBoost;

  const score = clamp(38 + compression, 0, 100);
  const surgeWindow = holidays.some((holiday) => {
    const daysAhead = daysBetween(today, holiday.holiday_date);
    return daysAhead >= 0 && daysAhead <= 3 && ['public', 'long_weekend'].includes(holiday.holiday_type);
  }) || events.some((event) => {
    const daysAhead = daysBetween(today, event.start_date);
    const scale = normalizeScale(event.scale);
    return daysAhead >= 0 && daysAhead <= 3 && scale === 'large';
  });
  const totalBoost = Math.max(0.0001, holidayBoost + eventBoost);
  const eventShare = clamp(eventBoost / totalBoost, 0, 1);
  const safeEventBoost = Math.max(0.0001, eventBoost);
  const eventCategoryShare = Object.entries(eventCategoryBoost).reduce((acc, [category, boost]) => {
    acc[category] = round(Number(boost || 0) / safeEventBoost, 4);
    return acc;
  }, {});
  const weddingShare = clamp(Number(eventCategoryShare.wedding_season || 0), 0, 1);
  const corporateShare = clamp(
    Number(eventCategoryShare.conference || 0) + Number(eventCategoryShare.exhibition || 0),
    0,
    1,
  );
  const hasDynamicEvents = events.length > 0;

  return {
    score: round(score),
    surgeWindow,
    reason: reasons.length
      ? reasons.slice(0, 2).join(' ')
      : 'No major holiday or event compression in next 14 days. Dates may vary.',
    confidence: holidays.length || hasDynamicEvents ? 88 : 70,
    neutral: holidays.length === 0 && !hasDynamicEvents,
    holidayBoost: round(holidayBoost, 2),
    eventBoost: round(eventBoost, 2),
    eventShare: round(eventShare, 4),
    weddingShare: round(weddingShare, 4),
    corporateShare: round(corporateShare, 4),
    eventCategoryShare,
  };
}
