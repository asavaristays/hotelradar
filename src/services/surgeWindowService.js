import { getHolidays, getUpcomingEvents } from '../repositories/marketRepository.js';

function daysUntil(date) {
  const now = new Date();
  const target = new Date(date);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const ms = targetUtc - todayUtc;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export async function detectSurgeWindow(city) {
  const [holidays, events] = await Promise.all([getHolidays(city), getUpcomingEvents(city)]);

  const nearHoliday = holidays.some((h) => {
    const d = daysUntil(h.holiday_date);
    return d >= 0 && d <= 3 && h.holiday_type === 'major';
  });

  const nearEvent = events.some((e) => {
    const d = daysUntil(e.start_date);
    return d >= 0 && d <= 3 && Number(e.impact_score || 0) >= 12;
  });

  return nearHoliday || nearEvent;
}
