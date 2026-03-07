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

  test('adds event-driven compression for upcoming large events', () => {
    const today = new Date('2026-03-07T00:00:00Z');
    const withEvent = computeHolidayScore({
      date: today,
      city: 'Mumbai',
      holidays: [],
      events: [
        {
          event_name: 'IPL Match - Wankhede',
          start_date: '2026-03-10',
          end_date: '2026-03-10',
          category: 'ipl_match',
          scale: 'large',
          confidence: 'confirmed',
          impact_score: 14,
        },
      ],
    });
    const withoutEvent = computeHolidayScore({
      date: today,
      city: 'Mumbai',
      holidays: [],
      events: [],
    });

    expect(withEvent.score).toBeGreaterThan(withoutEvent.score);
    expect(withEvent.eventBoost).toBeGreaterThan(0);
    expect(withEvent.eventShare).toBeGreaterThan(0);
    expect(withEvent.reason.toLowerCase()).toContain('ipl');
  });

  test('applies stronger Goa wedding multiplier than generic event weight', () => {
    const today = new Date('2026-11-10T00:00:00Z');
    const withWedding = computeHolidayScore({
      date: today,
      city: 'Goa',
      holidays: [],
      events: [
        {
          event_name: 'Destination Wedding Showcase',
          start_date: '2026-11-13',
          end_date: '2026-11-13',
          category: 'wedding_season',
          scale: 'medium',
          confidence: 'tentative',
        },
      ],
    });
    const generic = computeHolidayScore({
      date: today,
      city: 'Goa',
      holidays: [],
      events: [
        {
          event_name: 'General Community Meet',
          start_date: '2026-11-13',
          end_date: '2026-11-13',
          category: 'general',
          scale: 'medium',
          confidence: 'tentative',
        },
      ],
    });

    expect(withWedding.eventBoost).toBeGreaterThan(generic.eventBoost);
    expect(withWedding.weddingShare).toBeGreaterThan(0);
    expect(generic.weddingShare).toBe(0);
  });

  test('tracks corporate share for conference/exhibition events', () => {
    const today = new Date('2026-03-07T00:00:00Z');
    const result = computeHolidayScore({
      date: today,
      city: 'Mumbai',
      holidays: [],
      events: [
        {
          event_name: 'BKC Corporate Summit',
          start_date: '2026-03-10',
          end_date: '2026-03-11',
          category: 'conference',
          scale: 'large',
          confidence: 'confirmed',
        },
      ],
    });

    expect(result.eventBoost).toBeGreaterThan(0);
    expect(result.corporateShare).toBeGreaterThan(0);
  });
});
