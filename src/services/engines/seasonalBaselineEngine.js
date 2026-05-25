import { getUpcomingEvents } from '../../repositories/marketRepository.js';
import { clamp, round2 } from '../../utils/math.js';

function goaSeasonScore(month) {
  if ([10, 11, 0, 1].includes(month)) return 85;
  if ([2, 3, 4, 9].includes(month)) return 60;
  return 30;
}

function jaipurSeasonScore(month) {
  if ([9, 10, 11, 0, 1, 2].includes(month)) return 78;
  if ([3, 8].includes(month)) return 58;
  return 38;
}

export async function runSeasonalBaselineEngine(city, now = new Date()) {
  const month = now.getUTCMonth();
  let score = 55;
  let eventAdjustment = 0;

  if (city === 'Goa') {
    score = goaSeasonScore(month);
  }

  if (city === 'Mumbai') {
    score = 55;
    const events = await getUpcomingEvents(city);
    eventAdjustment = events.reduce((acc, event) => acc + Number(event.impact_score || 0), 0);
    score = clamp(score + Math.min(20, eventAdjustment), 0, 100);
  }

  if (city === 'Jaipur') {
    score = jaipurSeasonScore(month);
    const events = await getUpcomingEvents(city);
    eventAdjustment = events.reduce((acc, event) => acc + Number(event.impact_score || 0), 0);
    score = clamp(score + Math.min(18, eventAdjustment), 0, 100);
  }

  return {
    score: round2(score),
    eventAdjustment: round2(eventAdjustment),
    completeness: 100,
  };
}
