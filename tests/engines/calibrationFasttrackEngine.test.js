import { jest } from '@jest/globals';

const mockFindHotelByNameInCity = jest.fn();
const mockUpsertHotelDailyOutcomes = jest.fn();
const mockGetCityCalibrationDataset = jest.fn();
const mockGetCityWeightsForUpdate = jest.fn();
const mockGetCityByName = jest.fn();
const mockGetLatestActiveOrCanaryModelVersionForCity = jest.fn();
const mockGetPreviousModelVersionForCity = jest.fn();
const mockCreateModelVersion = jest.fn();
const mockUpdateModelVersionStatus = jest.fn();
const mockUpdateModelVersionAccuracy = jest.fn();
const mockLinkModelVersionToRun = jest.fn();
const mockListActiveHotelsByCity = jest.fn();
const mockListEnabledCanaryHotelsByCity = jest.fn();
const mockSetCanaryOverride = jest.fn();
const mockGetAlertFeedbackRate = jest.fn();
const mockInsertCalibrationRun = jest.fn();
const mockListCalibrationRuns = jest.fn();
const mockListCanaryOverrides = jest.fn();
const mockListOperationalCities = jest.fn();
const mockUpsertAlertFeedback = jest.fn();
const mockUpsertCalibrationSetting = jest.fn();
const mockGetCalibration = jest.fn();
const mockListOutcomeBootstrapTargets = jest.fn();
const mockInsertOutcomeBootstrapRows = jest.fn();

jest.unstable_mockModule('../../src/repositories/calibrationFasttrackRepository.js', () => ({
  createModelVersion: mockCreateModelVersion,
  findHotelByNameInCity: mockFindHotelByNameInCity,
  getAlertFeedbackRate: mockGetAlertFeedbackRate,
  getCityByName: mockGetCityByName,
  getCityCalibrationDataset: mockGetCityCalibrationDataset,
  getCityWeightsForUpdate: mockGetCityWeightsForUpdate,
  getLatestActiveOrCanaryModelVersionForCity: mockGetLatestActiveOrCanaryModelVersionForCity,
  getPreviousModelVersionForCity: mockGetPreviousModelVersionForCity,
  insertCalibrationRun: mockInsertCalibrationRun,
  linkModelVersionToRun: mockLinkModelVersionToRun,
  listActiveHotelsByCity: mockListActiveHotelsByCity,
  listCalibrationRuns: mockListCalibrationRuns,
  listCanaryOverrides: mockListCanaryOverrides,
  listEnabledCanaryHotelsByCity: mockListEnabledCanaryHotelsByCity,
  listOutcomeBootstrapTargets: mockListOutcomeBootstrapTargets,
  listOperationalCities: mockListOperationalCities,
  setCanaryOverride: mockSetCanaryOverride,
  insertOutcomeBootstrapRows: mockInsertOutcomeBootstrapRows,
  updateModelVersionAccuracy: mockUpdateModelVersionAccuracy,
  updateModelVersionStatus: mockUpdateModelVersionStatus,
  upsertAlertFeedback: mockUpsertAlertFeedback,
  upsertHotelDailyOutcomes: mockUpsertHotelDailyOutcomes,
}));

jest.unstable_mockModule('../../src/repositories/calibrationRepository.js', () => ({
  upsertCalibrationSetting: mockUpsertCalibrationSetting,
}));

jest.unstable_mockModule('../../src/config/calibration.js', () => ({
  getCalibration: mockGetCalibration,
}));

const { ingestOutcomeCsv, runCityCalibration, runDailyOutcomeBootstrap } = await import(
  '../../src/services/intelligence-engine/calibrationFasttrackEngine.js'
);

function buildDataset(days = 10) {
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    rows.push({
      hotel_id: 'h1',
      hotel_name: 'Hotel Taj Goa',
      city: 'Goa',
      outcome_date: `2026-02-${String(10 + i).padStart(2, '0')}`,
      actual_adr: 10000 + i * 120,
      occupancy_pct: 70,
      pickup_rooms: 6,
      demand_id: `d${i}`,
      demand_score: 66,
      demand_level: 'High',
      recommended_action: 'increase',
      suggested_base: 10200 + i * 100,
      signals: {},
    });
  }
  return rows;
}

describe('calibrationFasttrackEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalibration.mockResolvedValue({
      global: { thresholds: { competitorMovement: 8 } },
      calibration: {
        maxWeightDelta: 0.05,
        minOutcomeThreshold: 8,
        maxCanaryPercentage: 0.2,
        revertAccuracyDropThreshold: 0.05,
      },
    });
    mockListOutcomeBootstrapTargets.mockResolvedValue([]);
    mockInsertOutcomeBootstrapRows.mockResolvedValue([]);
  });

  test('ingestOutcomeCsv parses CSV rows and upserts outcome data', async () => {
    mockFindHotelByNameInCity.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      hotel_name: 'Hotel Taj Goa',
      city: 'Goa',
    });
    mockUpsertHotelDailyOutcomes.mockResolvedValue([
      { id: 'o1', hotel_id: '11111111-1111-4111-8111-111111111111' },
    ]);

    const csv = [
      'hotel_name,city,date,actual_adr,occupancy_pct,pickup_rooms',
      'Hotel Taj Goa,Goa,2026-02-25,11800,74,9',
    ].join('\n');

    const result = await ingestOutcomeCsv({
      csvText: csv,
      source: 'manual_csv',
      uploadedBy: '94000000-0000-4000-8000-000000000001',
    });

    expect(result.inserted).toBe(1);
    expect(result.errors).toEqual([]);
    expect(mockFindHotelByNameInCity).toHaveBeenCalledWith('Goa', 'Hotel Taj Goa');
    expect(mockUpsertHotelDailyOutcomes).toHaveBeenCalledTimes(1);
  });

  test('runCityCalibration applies canary-only weights with capped deltas and versioning', async () => {
    mockGetCityWeightsForUpdate.mockResolvedValue({
      city: 'Goa',
      competitor_weight: 0.45,
      holiday_weight: 0.25,
      airfare_weight: 0.2,
      season_weight: 0.1,
    });
    mockGetCityByName.mockResolvedValue({ id: 'city-goa', name: 'Goa' });
    mockGetCityCalibrationDataset
      .mockResolvedValueOnce(buildDataset(10))
      .mockResolvedValueOnce(buildDataset(7));
    mockGetAlertFeedbackRate.mockResolvedValue({ total_feedback: 0, useful_feedback: 0 });
    mockListActiveHotelsByCity.mockResolvedValue([
      { id: 'h1', hotel_name: 'A', city: 'Goa' },
      { id: 'h2', hotel_name: 'B', city: 'Goa' },
      { id: 'h3', hotel_name: 'C', city: 'Goa' },
      { id: 'h4', hotel_name: 'D', city: 'Goa' },
      { id: 'h5', hotel_name: 'E', city: 'Goa' },
    ]);
    mockListEnabledCanaryHotelsByCity.mockResolvedValue([{ hotel_id: 'h1', hotel_name: 'A', city: 'Goa' }]);
    mockGetLatestActiveOrCanaryModelVersionForCity.mockResolvedValue({
      version_id: 'ver-13',
      version_no: 13,
      accuracy_latest: 72,
      weight_snapshot_json: {
        competitor_weight: 0.45,
        holiday_weight: 0.25,
        airfare_weight: 0.2,
        season_weight: 0.1,
      },
    });
    mockCreateModelVersion.mockResolvedValue({ version_id: 'ver-14', version_no: 14, status: 'canary' });
    mockSetCanaryOverride.mockResolvedValue({});
    mockUpdateModelVersionAccuracy.mockResolvedValue({});
    mockInsertCalibrationRun.mockResolvedValue({ id: 'run-1' });
    mockLinkModelVersionToRun.mockResolvedValue({});

    const result = await runCityCalibration({
      city: 'Goa',
      days: 14,
      canaryFraction: 0.2,
      dryRun: false,
      triggeredBy: '94000000-0000-4000-8000-000000000001',
    });

    expect(result.applied).toBe(true);
    expect(result.version.versionNo).toBe(14);
    expect(result.canary.canaryCount).toBe(1);
    expect(mockSetCanaryOverride).toHaveBeenCalledTimes(5);
    expect(mockCreateModelVersion).toHaveBeenCalledTimes(1);
    expect(mockInsertCalibrationRun).toHaveBeenCalledTimes(1);

    const payload = mockInsertCalibrationRun.mock.calls[0][0];
    expect(payload.versionCreated).toBe(true);
    expect(payload.proposedWeights).toBeDefined();
    expect(payload.clampedWeights).toBeDefined();

    const oldW = payload.oldWeights;
    const newW = payload.clampedWeights;
    for (const key of ['competitor_weight', 'holiday_weight', 'airfare_weight', 'season_weight']) {
      const delta = Math.abs((newW[key] - oldW[key]) / oldW[key]);
      expect(delta).toBeLessThanOrEqual(0.0501);
    }
  });

  test('runCityCalibration skips apply when outcome threshold is insufficient', async () => {
    mockGetCityWeightsForUpdate.mockResolvedValue({
      city: 'Goa',
      competitor_weight: 0.45,
      holiday_weight: 0.25,
      airfare_weight: 0.2,
      season_weight: 0.1,
    });
    mockGetCityByName.mockResolvedValue({ id: 'city-goa', name: 'Goa' });
    mockGetCityCalibrationDataset.mockResolvedValue(buildDataset(3));
    mockGetAlertFeedbackRate.mockResolvedValue({ total_feedback: 1, useful_feedback: 1 });
    mockInsertCalibrationRun.mockResolvedValue({ id: 'run-2' });

    const result = await runCityCalibration({
      city: 'Goa',
      days: 14,
      dryRun: false,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('insufficient_data');
    expect(mockCreateModelVersion).not.toHaveBeenCalled();
    expect(mockSetCanaryOverride).not.toHaveBeenCalled();
    expect(mockInsertCalibrationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'insufficient_data',
        versionCreated: false,
      }),
    );
  });

  test('runDailyOutcomeBootstrap inserts only missing rows for focus-city hotels', async () => {
    mockListOutcomeBootstrapTargets.mockResolvedValue([
      {
        id: 'h1',
        hotel_name: 'Hotel Taj Goa',
        city: 'Goa',
        room_count: 42,
        base_price_min: 9000,
        base_price_max: 12000,
        latest_price: 11500,
        latest_suggested_base: 11300,
      },
      {
        id: 'h2',
        hotel_name: 'The Oberoi Mumbai',
        city: 'Mumbai',
        room_count: 58,
        base_price_min: 15000,
        base_price_max: 22000,
        latest_price: null,
        latest_suggested_base: 17800,
      },
    ]);
    mockInsertOutcomeBootstrapRows.mockResolvedValue([
      { hotel_id: 'h1', outcome_date: '2026-03-07' },
      { hotel_id: 'h2', outcome_date: '2026-03-07' },
    ]);

    const result = await runDailyOutcomeBootstrap({
      daysAhead: 1,
      occupancyPct: 73,
      pickupRooms: 5,
      source: 'system_bootstrap',
    });

    expect(result.hotels).toBe(2);
    expect(result.attemptedRows).toBe(2);
    expect(result.insertedRows).toBe(2);
    expect(mockInsertOutcomeBootstrapRows).toHaveBeenCalledTimes(1);
    expect(mockInsertOutcomeBootstrapRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          hotelId: 'h1',
          actualAdr: 11500,
          occupancyPct: 73,
          pickupRooms: 5,
          source: 'system_bootstrap',
        }),
        expect.objectContaining({
          hotelId: 'h2',
          actualAdr: 17800,
          occupancyPct: 73,
          pickupRooms: 5,
          source: 'system_bootstrap',
        }),
      ]),
    );
  });
});
