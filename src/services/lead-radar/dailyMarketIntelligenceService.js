import { logger } from '../../config/logger.js';
import { runMarketHotelReviewSignalEngine } from './marketHotelReviewSignalService.js';
import { runMarketHotelReputationSignalEngine } from './marketHotelReputationSignalService.js';
import { runMarketHotelChatbotGapSignalEngine } from './marketHotelChatbotGapSignalService.js';
import { runMarketHotelOtaDependenceSignalEngine } from './marketHotelOtaDependenceSignalService.js';
import { runMarketHotelDemandSurgeClusterSignalEngine } from './marketHotelDemandSurgeClusterSignalService.js';
import { runMarketHotelPricePressureSignalEngine } from './marketHotelPricePressureSignalService.js';
import { runMarketHotelEventDemandZoneSignalEngine } from './marketHotelEventDemandZoneSignalService.js';
import { runMarketHotelWeddingDemandZoneSignalEngine } from './marketHotelWeddingDemandZoneSignalService.js';
import { runMarketHotelCorporateEventClusterSignalEngine } from './marketHotelCorporateEventClusterSignalService.js';
import { runMarketHotelTourismSpikeSignalEngine } from './marketHotelTourismSpikeSignalService.js';
import { runMarketHotelAirportDemandSignalEngine } from './marketHotelAirportDemandSignalService.js';
import { runMarketHotelWeekendCompressionSignalEngine } from './marketHotelWeekendCompressionSignalService.js';
import { runMarketHotelFestivalDemandSignalEngine } from './marketHotelFestivalDemandSignalService.js';
import { runMarketOpportunityFeedEngine } from './marketOpportunityFeedService.js';
import { runMarketRankedOpportunityEngine } from './marketRankedOpportunityService.js';
import { runMarketHotelBenchmarkEngine } from './marketHotelBenchmarkService.js';
import { runMarketOpportunityNotificationEngine } from './marketOpportunityNotificationService.js';

const signalSteps = [
  ['review signals', runMarketHotelReviewSignalEngine],
  ['reputation signals', runMarketHotelReputationSignalEngine],
  ['chatbot gap signals', runMarketHotelChatbotGapSignalEngine],
  ['ota dependence signals', runMarketHotelOtaDependenceSignalEngine],
  ['demand surge clusters', runMarketHotelDemandSurgeClusterSignalEngine],
  ['price pressure signals', runMarketHotelPricePressureSignalEngine],
  ['event demand zones', runMarketHotelEventDemandZoneSignalEngine],
  ['wedding demand zones', runMarketHotelWeddingDemandZoneSignalEngine],
  ['corporate event clusters', runMarketHotelCorporateEventClusterSignalEngine],
  ['tourism spike signals', runMarketHotelTourismSpikeSignalEngine],
  ['airport demand signals', runMarketHotelAirportDemandSignalEngine],
  ['weekend compression signals', runMarketHotelWeekendCompressionSignalEngine],
  ['festival demand signals', runMarketHotelFestivalDemandSignalEngine],
];

const defaultDeps = {
  signalSteps,
  runMarketOpportunityFeedEngine,
  runMarketRankedOpportunityEngine,
  runMarketHotelBenchmarkEngine,
  runMarketOpportunityNotificationEngine,
};

const downstreamSteps = [
  ['opportunity feed generation', 'feedEntries', (deps, options) =>
    deps.runMarketOpportunityFeedEngine(options)],
  ['opportunity ranking', 'rankedEntries', (deps, options) =>
    deps.runMarketRankedOpportunityEngine(options)],
  ['benchmark generation', 'benchmarksGenerated', (deps, options) =>
    deps.runMarketHotelBenchmarkEngine(options)],
  ['notification generation', 'notificationsGenerated', (deps, options) =>
    deps.runMarketOpportunityNotificationEngine(options)],
];

export async function runDailyMarketIntelligence(options = {}, deps = defaultDeps) {
  const startedAt = Date.now();
  const startTime = new Date(startedAt);
  const stepOptions = options.city ? { city: options.city } : {};

  logger.info('daily_market_intelligence_started', {
    city: options.city || 'all',
    startTime: startTime.toISOString(),
  });

  let signalsGenerated = 0;
  const signalResults = {};
  const completedSteps = [];
  const failedSteps = [];

  for (const [key, runner] of deps.signalSteps) {
    logger.info('daily_market_intelligence_stage_started', {
      city: options.city || 'all',
      stage: key,
    });

    try {
      const summary = await runner(stepOptions);
      const count = Number(summary?.signalsCreated || 0);
      signalsGenerated += count;
      signalResults[key] = count;
      completedSteps.push(key);

      logger.info('daily_market_intelligence_stage_completed', {
        city: options.city || 'all',
        stage: key,
        signalsCreated: count,
      });
    } catch (error) {
      failedSteps.push(key);
      logger.error('daily_market_intelligence_stage_failed', {
        city: options.city || 'all',
        stage: key,
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  }

  const summary = {
    city: options.city || 'all',
    startTime: startTime.toISOString(),
    signalsGenerated,
    feedEntries: 0,
    rankedEntries: 0,
    benchmarksGenerated: 0,
    notificationsGenerated: 0,
    durationMs: 0,
    signalResults,
    completedSteps,
    failedSteps,
  };

  for (const [label, summaryKey, runner] of downstreamSteps) {
    logger.info('daily_market_intelligence_stage_started', {
      city: options.city || 'all',
      stage: label,
    });

    try {
      const stageSummary = await runner(deps, stepOptions);
      if (summaryKey === 'feedEntries') {
        summary.feedEntries = Number(stageSummary?.signalsInserted || 0);
      } else if (summaryKey === 'rankedEntries') {
        summary.rankedEntries = Number(stageSummary?.rankedEntries || 0);
      } else if (summaryKey === 'benchmarksGenerated') {
        summary.benchmarksGenerated = Number(stageSummary?.hotelsProcessed || 0);
      } else if (summaryKey === 'notificationsGenerated') {
        summary.notificationsGenerated = Number(stageSummary?.notificationsCreated || 0);
      }

      completedSteps.push(label);
      logger.info('daily_market_intelligence_stage_completed', {
        city: options.city || 'all',
        stage: label,
        value: summary[summaryKey],
      });
    } catch (error) {
      failedSteps.push(label);
      logger.error('daily_market_intelligence_stage_failed', {
        city: options.city || 'all',
        stage: label,
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  }

  summary.durationMs = Date.now() - startedAt;

  logger.info('daily_market_intelligence_completed', summary);
  return summary;
}
