import { round2 } from '../utils/math.js';

export function buildExplanation(payload) {
  const lines = [];
  const {
    competitor,
    holiday,
    airfare,
    season,
    level,
    recommendation,
  } = payload;

  if (competitor.movementPercent >= 5) {
    lines.push(`Competitor average increased ${round2(competitor.movementPercent)}% in last 48 hours.`);
  } else if (competitor.movementPercent <= -5) {
    lines.push(`Competitor average declined ${Math.abs(round2(competitor.movementPercent))}% in last 48 hours.`);
  } else {
    lines.push('Competitor pricing is stable with limited movement in the last 48 hours.');
  }

  if (holiday.hasLongWeekend) {
    lines.push('Upcoming long weekend driving compression.');
  } else if (holiday.hasMajorHoliday) {
    lines.push('Major holiday signal is active for the city.');
  }

  if (airfare.changePercent >= 10) {
    lines.push(`Airfare increased ${round2(airfare.changePercent)}% over 7-day trend.`);
  } else if (airfare.changePercent <= -10) {
    lines.push(`Airfare softened ${Math.abs(round2(airfare.changePercent))}% over 7-day trend.`);
  }

  lines.push(`Seasonal baseline score is ${season.score} for current city conditions.`);
  lines.push(`Demand classified as ${level}. ${recommendation}`);

  return lines.join(' ');
}
