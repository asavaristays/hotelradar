import { jest } from '@jest/globals';
import { runDailyMarketIntelligence } from '../src/services/lead-radar/dailyMarketIntelligenceService.js';

describe('dailyMarketIntelligenceService', () => {
  test('runs signal engines then rebuilds feed, rankings, benchmarks, and notifications', async () => {
    const executionOrder = [];
    const makeSignalRunner = (name, signalsCreated) =>
      jest.fn(async (options) => {
        executionOrder.push(`${name}:${options.city || 'all'}`);
        return { signalsCreated };
      });

    const runMarketOpportunityFeedEngine = jest.fn(async (options) => {
      executionOrder.push(`feed:${options.city || 'all'}`);
      return { signalsInserted: 12 };
    });
    const runMarketRankedOpportunityEngine = jest.fn(async (options) => {
      executionOrder.push(`ranked:${options.city || 'all'}`);
      return { rankedEntries: 9 };
    });
    const runMarketHotelBenchmarkEngine = jest.fn(async (options) => {
      executionOrder.push(`benchmarks:${options.city || 'all'}`);
      return { hotelsProcessed: 30 };
    });
    const runMarketOpportunityNotificationEngine = jest.fn(async (options) => {
      executionOrder.push(`notifications:${options.city || 'all'}`);
      return { notificationsCreated: 7 };
    });

    const summary = await runDailyMarketIntelligence(
      { city: 'Goa' },
      {
        signalSteps: [
          ['reputation', makeSignalRunner('reputation', 2)],
          ['chatbotGap', makeSignalRunner('chatbotGap', 1)],
          ['otaDependence', makeSignalRunner('otaDependence', 3)],
        ],
        runMarketOpportunityFeedEngine,
        runMarketRankedOpportunityEngine,
        runMarketHotelBenchmarkEngine,
        runMarketOpportunityNotificationEngine,
      },
    );

    expect(executionOrder).toEqual([
      'reputation:Goa',
      'chatbotGap:Goa',
      'otaDependence:Goa',
      'feed:Goa',
      'ranked:Goa',
      'benchmarks:Goa',
      'notifications:Goa',
    ]);
    expect(summary.signalsGenerated).toBe(6);
    expect(summary.feedEntries).toBe(12);
    expect(summary.rankedEntries).toBe(9);
    expect(summary.benchmarksGenerated).toBe(30);
    expect(summary.notificationsGenerated).toBe(7);
    expect(summary.signalResults).toEqual({
      reputation: 2,
      chatbotGap: 1,
      otaDependence: 3,
    });
    expect(summary.failedSteps).toEqual([]);
  });

  test('continues the pipeline when one stage fails', async () => {
    const executionOrder = [];

    const summary = await runDailyMarketIntelligence(
      { city: 'Mumbai' },
      {
        signalSteps: [
          ['review signals', jest.fn(async (options) => {
            executionOrder.push(`review:${options.city}`);
            return { signalsCreated: 4 };
          })],
        ],
        runMarketOpportunityFeedEngine: jest.fn(async (options) => {
          executionOrder.push(`feed:${options.city}`);
          throw new Error('feed exploded');
        }),
        runMarketRankedOpportunityEngine: jest.fn(async (options) => {
          executionOrder.push(`ranked:${options.city}`);
          return { rankedEntries: 3 };
        }),
        runMarketHotelBenchmarkEngine: jest.fn(async (options) => {
          executionOrder.push(`benchmarks:${options.city}`);
          return { hotelsProcessed: 8 };
        }),
        runMarketOpportunityNotificationEngine: jest.fn(async (options) => {
          executionOrder.push(`notifications:${options.city}`);
          return { notificationsCreated: 2 };
        }),
      },
    );

    expect(executionOrder).toEqual([
      'review:Mumbai',
      'feed:Mumbai',
      'ranked:Mumbai',
      'benchmarks:Mumbai',
      'notifications:Mumbai',
    ]);
    expect(summary.signalsGenerated).toBe(4);
    expect(summary.feedEntries).toBe(0);
    expect(summary.rankedEntries).toBe(3);
    expect(summary.benchmarksGenerated).toBe(8);
    expect(summary.notificationsGenerated).toBe(2);
    expect(summary.failedSteps).toEqual(['opportunity feed generation']);
  });
});
