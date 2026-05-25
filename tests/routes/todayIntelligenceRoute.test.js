import request from 'supertest';
import { jest } from '@jest/globals';

const getTodayMarketIntelligenceForUser = jest.fn();

jest.unstable_mockModule('../../src/services/todayIntelligenceService.js', () => ({
  getTodayMarketIntelligenceForUser,
}));

const { app } = await import('../../src/app.js');

describe('GET /api/intelligence/today', () => {
  test('returns today market intelligence payload', async () => {
    process.env.NODE_ENV = 'test';
    getTodayMarketIntelligenceForUser.mockResolvedValueOnce({
      lastMarketScan: '2026-03-14T09:00:00.000Z',
      city: 'Goa',
      opportunities: [
        {
          signalType: 'WEEKEND_COMPRESSION',
          location: 'Candolim',
          summary: 'Weekend compression detected near Candolim cluster',
          recommendedAction: 'Increase weekend rates by 10-15%',
        },
      ],
    });

    const response = await request(app).get('/api/intelligence/today');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      lastMarketScan: '2026-03-14T09:00:00.000Z',
      city: 'Goa',
      opportunities: [
        {
          signalType: 'WEEKEND_COMPRESSION',
          location: 'Candolim',
          summary: 'Weekend compression detected near Candolim cluster',
          recommendedAction: 'Increase weekend rates by 10-15%',
        },
      ],
    });
  });
});
