import { getHolidays } from '../../repositories/marketRepository.js';
import { clamp, round2 } from '../../utils/math.js';
import { addDays, formatDate, isWeekend } from '../../utils/time.js';

function hasLongWeekend(holidayDates, date) {
  const prev = formatDate(addDays(date, -1));
  const next = formatDate(addDays(date, 1));
  return holidayDates.has(prev) || holidayDates.has(next);
}

export async function runHolidayEngine(city, now = new Date()) {
  const holidays = await getHolidays(city);
  const holidayDates = new Set(holidays.map((h) => formatDate(h.holiday_date)));

  let raw = 0;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (isWeekend(today)) raw += 5;

  if (holidays.some((h) => h.holiday_type === 'major')) raw += 20;
  if (hasLongWeekend(holidayDates, today)) raw += 12;

  const normalized = clamp((raw / 37) * 100, 0, 100);

  return {
    score: round2(normalized),
    rawScore: raw,
    hasMajorHoliday: holidays.some((h) => h.holiday_type === 'major'),
    hasLongWeekend: hasLongWeekend(holidayDates, today),
    completeness: 100,
  };
}
