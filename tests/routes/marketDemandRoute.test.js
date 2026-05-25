import request from 'supertest';
import { jest } from '@jest/globals';

const getMarketDemand = jest.fn();

jest.unstable_mockModule('../../src/services/marketDemandService.js', () => ({
  getMarketDemand,
}));

const { app } = await import('../../src/app.js');

describe('GET /api/market-demand', () => {
  test('returns market demand cockpit payload', async () => {
    process.env.NODE_ENV = 'test';
    getMarketDemand.mockResolvedValueOnce({
      city: 'Goa',
      horizon_days: 30,
      markets: ['Goa', 'Mumbai', 'Jaipur'],
      actionable_days: 1,
      days: [
        {
          stay_date: '2026-05-25',
          demand_score: 72,
          confidence_score: 78,
          demand_level: 'High',
          pricing_action: 'Increase',
          price_adjustment_pct: 8,
          trust_status: 'actionable',
          top_drivers: [],
        },
      ],
    });

    const response = await request(app).get('/api/market-demand?city=Goa');

    expect(response.status).toBe(200);
    expect(getMarketDemand).toHaveBeenCalledWith('Goa', { horizonDays: 30 });
    expect(response.body.city).toBe('Goa');
    expect(response.body.days[0].pricing_action).toBe('Increase');
  });
});
