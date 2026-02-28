import { jest } from '@jest/globals';

const mockGetDashboard = jest.fn(async () => ({
  hotelId: '11111111-1111-4111-8111-111111111111',
  city: 'Goa',
  seasonProfile: 'Coastal Leisure',
  demandScore: 64.01,
  demandLevel: 'Moderate',
  confidence: {
    level: 'High',
    score: 88,
    factors: ['Strong competitor consistency'],
  },
  marketStability: {
    status: 'Stable',
    volatilityScore: 16,
  },
  suggestedPricing: {
    base: 8150,
    bands: {
      safe: { min: 7900, max: 8400 },
      aggressive: { min: 8400, max: 8800 },
      premium: { min: 9850, max: 10900 },
    },
    riskLevel: 'Medium',
    marketHeat: 4,
  },
  compression: {
    scarcityScore: 61,
    priceDispersion: 9,
    roomsBelowMarketAvgPct: 55,
    compressionLevel: 'Moderate',
    priceVacuumDetected: false,
    opportunityBand: { min: 9800, max: 10900 },
  },
  marketPosition: { hotelPrice: 6689, marketAvg: 10362, positionPct: -35.45 },
  signalBreakdown: {
    competitorMomentum: 18,
    holidayImpact: 12,
    airfareImpact: 5,
    seasonImpact: 7,
  },
  narrative: {
    summary: 'Demand is moderate.',
    marketStory: 'Competitor momentum is primary.',
    pricingRationale: 'Calibrated increase.',
    actionGuidance: 'Monitor pickup.',
  },
  otaParity: {
    hotelPrice: 6689,
    parityThresholdPct: 2,
    alertThresholdPct: 5,
    rows: [],
    summary: { inParity: 0, underpriced: 0, overpriced: 0, maxAbsGapPct: 0 },
  },
  competitiveGrid: [],
  explanation: ['Competitor trend up'],
  alerts: ['HIGH: Competitor movement'],
  forwardCurve: [],
  performanceSummary: {
    directionAccuracy: 80,
    alertPrecision: 76,
    positionImprovementPct: 12,
    rollingAccuracy30d: 78,
    stabilityDeviation: 22,
    sampleSize: 9,
  },
  lastUpdated: new Date('2026-02-25T00:00:00.000Z').toISOString(),
}));

const mockRecalculate = jest.fn(async () => mockGetDashboard());
const mockGetAlerts = jest.fn(async () => []);
const mockGetCompetitiveGrid = jest.fn(async () => []);
const mockGetOtaParity = jest.fn(async () => ({ rows: [], summary: { maxAbsGapPct: 0 } }));
const mockGetPerformanceSummary = jest.fn(async () => ({ directionAccuracy: 80 }));
const mockGetDataHealth = jest.fn(async () => ({ statuses: { accuracyStatus: 'Reliable' } }));
const mockEnqueueRecalculationJob = jest.fn(async () => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'queued',
}));
const mockGetRecalculationJobStatus = jest.fn(async () => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  hotelId: '11111111-1111-4111-8111-111111111111',
  status: 'queued',
  attempts: 0,
  maxAttempts: 3,
}));

jest.unstable_mockModule('../../src/services/dashboardService.js', () => ({
  getDashboard: mockGetDashboard,
  recalculateDashboard: mockRecalculate,
  getAlerts: mockGetAlerts,
  getCompetitiveGrid: mockGetCompetitiveGrid,
  getOtaParity: mockGetOtaParity,
  getPerformanceSummary: mockGetPerformanceSummary,
  getDataHealth: mockGetDataHealth,
}));

jest.unstable_mockModule('../../src/services/recalcQueueService.js', () => ({
  enqueueRecalculationJob: mockEnqueueRecalculationJob,
  getRecalculationJobStatus: mockGetRecalculationJobStatus,
}));

const {
  getHotelDashboard,
  getHotelDataHealth,
  getHotelOtaParity,
  getHotelRecalculateJob,
  postRecalculate,
  getHotelPerformance,
} = await import('../../src/controllers/dashboardController.js');

function buildRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('dashboard controller output shape', () => {
  test('getHotelDashboard returns required contract', async () => {
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' } };
    const res = buildRes();
    const next = jest.fn();

    await getHotelDashboard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('hotelId');
    expect(res.body).toHaveProperty('city');
    expect(res.body).toHaveProperty('seasonProfile');
    expect(res.body).toHaveProperty('demandScore');
    expect(res.body).toHaveProperty('suggestedPricing.base');
    expect(res.body).toHaveProperty('compression');
    expect(res.body).toHaveProperty('marketPosition.marketAvg');
    expect(res.body).toHaveProperty('narrative');
    expect(res.body).toHaveProperty('competitiveGrid');
    expect(res.body).toHaveProperty('confidence');
    expect(res.body).toHaveProperty('marketStability');
    expect(res.body).toHaveProperty('signalBreakdown');
    expect(res.body).toHaveProperty('forwardCurve');
    expect(res.body).toHaveProperty('performanceSummary');
    expect(res.body).toHaveProperty('otaParity');
    expect(res.body).toHaveProperty('lastUpdated');
  });

  test('getHotelOtaParity returns parity payload', async () => {
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' } };
    const res = buildRes();
    const next = jest.fn();

    await getHotelOtaParity(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('summary.maxAbsGapPct');
  });

  test('getHotelDataHealth returns health payload', async () => {
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' }, user: { role: 'admin' } };
    const res = buildRes();
    const next = jest.fn();

    await getHotelDataHealth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('statuses.accuracyStatus');
  });

  test('getHotelRecalculateJob returns job payload', async () => {
    const req = {
      params: {
        id: '11111111-1111-4111-8111-111111111111',
        jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    };
    const res = buildRes();
    const next = jest.fn();

    await getHotelRecalculateJob(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('hotelId', '11111111-1111-4111-8111-111111111111');
  });

  test('postRecalculate rejects invalid UUID', async () => {
    const req = { params: { id: 'not-a-uuid' }, body: {} };
    const res = buildRes();
    const next = jest.fn();

    await postRecalculate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('Invalid hotel id');
  });

  test('getHotelPerformance returns summary', async () => {
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' } };
    const res = buildRes();
    const next = jest.fn();

    await getHotelPerformance(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('directionAccuracy');
  });
});
