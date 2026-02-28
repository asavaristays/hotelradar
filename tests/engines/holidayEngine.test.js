import { computeHolidayScore } from '../../src/services/intelligence-engine/holidayEngine.js';

describe('holidayEngine', () => {
  test('raises score for public holiday within 3 days', () => {
    const today = new Date('2026-02-25T00:00:00Z');
    const result = computeHolidayScore({
      date: today,
      city: 'Goa',
      holidays: [{ holiday_date: '2026-02-27', holiday_name: 'Festival', holiday_type: 'public' }],
    });

    expect(result.score).toBeGreaterThan(50);
    expect(result.surgeWindow).toBe(true);
    expect(result.neutral).toBe(false);
  });

  test('falls back to neutral mode when no holiday data', () => {
    const result = computeHolidayScore({ city: 'Goa', holidays: [] });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.neutral).toBe(true);
  });
});
