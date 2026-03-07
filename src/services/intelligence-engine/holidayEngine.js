import { logger } from '../../config/logger.js';
import { dateToKey, toDateOnly } from '../../utils/date.js';
import { computeHolidayCompression } from './holidayEventEngine.js';

/**
 * Compute holiday/event compression score over next 14 days.
 * @param {{
 *   date?: Date,
 *   city:string,
 *   holidays?: Array<{holiday_date:string, holiday_name:string, holiday_type:string}>,
 *   events?: Array<{start_date:string,end_date:string,event_name:string,category?:string,scale?:string,impact_score?:number,confidence?:string}>
 * }} input
 * @returns {{score:number,reason:string,surgeWindow:boolean,confidence:number,neutral:boolean}}
 */
export function computeHolidayScore(input = {}) {
  const today = toDateOnly(input.date || new Date());
  const holidays = input.holidays || [];
  const events = input.events || [];

  logger.info('engine_input', {
    engine: 'holiday',
    city: input.city,
    holidays: holidays.length,
    events: events.length,
    date: dateToKey(today),
  });

  const result = computeHolidayCompression({
    city: input.city,
    date: today,
    holidays,
    events,
  });

  logger.info('engine_output', { engine: 'holiday', ...result });
  return result;
}
