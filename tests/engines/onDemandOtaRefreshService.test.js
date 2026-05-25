import { __testables } from '../../src/services/onDemandOtaRefreshService.js';

describe('onDemandOtaRefreshService', () => {
  test('skips auto refresh when dashboard is already actionable with fresh OTA coverage', () => {
    const shouldRefresh = __testables.shouldRefreshDashboard(
      {
        city: 'Goa',
        lastScrapedAt: new Date().toISOString(),
        signalQuality: {
          mode: 'actionable',
          otaSourceStatus: 'scraped',
          otaLiveRows: 3,
        },
        dataHealth: {
          diagnostics: {
            thresholds: {
              staleScrapeHours: 12,
              minOtaLiveRowsForAction: 2,
            },
            metrics: {
              otaLiveRows: 3,
            },
          },
        },
      },
      'auto',
    );

    expect(shouldRefresh).toBe(false);
  });

  test('refreshes in auto mode when signal quality is verify', () => {
    const shouldRefresh = __testables.shouldRefreshDashboard(
      {
        city: 'Mumbai',
        signalQuality: {
          mode: 'verify',
          otaSourceStatus: 'estimated',
          otaLiveRows: 0,
        },
      },
      'auto',
    );

    expect(shouldRefresh).toBe(true);
  });

  test('refreshes in force mode regardless of city', () => {
    const shouldRefresh = __testables.shouldRefreshDashboard(
      {
        city: 'Jaipur',
        signalQuality: {
          mode: 'actionable',
          otaSourceStatus: 'scraped',
          otaLiveRows: 9,
        },
      },
      'force',
    );

    expect(shouldRefresh).toBe(true);
  });
});
