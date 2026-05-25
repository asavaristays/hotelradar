import { jest } from '@jest/globals';

const mockGetUpcomingEvents = jest.fn();

jest.unstable_mockModule('../../src/repositories/marketRepository.js', () => ({
  getUpcomingEvents: mockGetUpcomingEvents,
}));

const { runSeasonalBaselineEngine } = await import(
  '../../src/services/engines/seasonalBaselineEngine.js'
);

describe('seasonalBaselineEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('applies Jaipur seasonality and caps event adjustment', async () => {
    mockGetUpcomingEvents.mockResolvedValue([
      { impact_score: 10 },
      { impact_score: 9 },
      { impact_score: 7 },
    ]);

    const result = await runSeasonalBaselineEngine('Jaipur', new Date('2026-11-10T00:00:00Z'));

    expect(result.eventAdjustment).toBe(26);
    expect(result.score).toBe(96);
    expect(result.completeness).toBe(100);
  });

  test('keeps Jaipur monsoon months softer when no events are present', async () => {
    mockGetUpcomingEvents.mockResolvedValue([]);

    const result = await runSeasonalBaselineEngine('Jaipur', new Date('2026-07-10T00:00:00Z'));

    expect(result.eventAdjustment).toBe(0);
    expect(result.score).toBe(38);
  });
});
