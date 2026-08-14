import express from 'express';
import {
  getHotelAlerts,
  getHotelCompetitiveGrid,
  getHotelDataHealth,
  getHotelDashboard,
  getHotelOtaParity,
  getHotelPerformance,
  getHotelRecalculateJob,
  postRecalculate,
  postManualMarketSignals,
  postWebhookRecalculate,
} from '../controllers/dashboardController.js';
import { getMarketDemandController } from '../controllers/marketDemandController.js';
import {
  getCompetitorIntelligence,
  getDemandCalendarEntries,
  getDemandForecast,
  getDebugSystemStatus,
  getIntelligenceAlerts,
  getLeadRadarExternalSignalFeed,
  getLeadRadarUpcomingEvents,
  getMarketCompression,
  getMarketIntelligenceMap,
  getMarketIntelligenceOpportunities,
  getMarketPositionIntelligence,
  getMorningBrief,
  getRadarScore,
  getRevenueAdvice,
  getTodayMarketIntelligence,
  postMarketConfidence,
  postNormalizeRates,
  postPositionAnalysis,
} from '../controllers/intelligenceController.js';
import {
  getRevenueIntelligenceBriefHistory,
  patchRevenueIntelligenceDeliveryStatus,
  postGenerateDailyRevenueIntelligenceBriefs,
  postGenerateRevenueIntelligenceBrief,
  postRevenueIntelligenceFeedback,
} from '../controllers/revenueIntelligenceDeliveryController.js';
import { requireAuth, requireBetaAcceptance, requireHotelScope } from '../middleware/authMiddleware.js';

export const dashboardRouter = express.Router();

dashboardRouter.get('/hotel/:id/dashboard', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelDashboard);
dashboardRouter.post('/hotel/:id/recalculate', requireAuth, requireBetaAcceptance(), requireHotelScope(), postRecalculate);
dashboardRouter.post('/hotel/:id/signals', requireAuth, requireBetaAcceptance(), requireHotelScope(), postManualMarketSignals);
dashboardRouter.post('/hotel/:id/revenue-intelligence/brief', requireAuth, requireBetaAcceptance(), requireHotelScope(), postGenerateRevenueIntelligenceBrief);
dashboardRouter.get('/hotel/:id/revenue-intelligence/briefs', requireAuth, requireBetaAcceptance(), requireHotelScope(), getRevenueIntelligenceBriefHistory);
dashboardRouter.get('/hotel/:id/alerts', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelAlerts);
dashboardRouter.get('/hotel/:id/competitive-grid', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelCompetitiveGrid);
dashboardRouter.get('/hotel/:id/ota-parity', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelOtaParity);
dashboardRouter.get('/hotel/:id/performance', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelPerformance);
dashboardRouter.get('/hotel/:id/data-health', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelDataHealth);
dashboardRouter.get('/hotel/:id/recalculate-jobs/:jobId', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelRecalculateJob);
dashboardRouter.post('/webhook/hotel/:id/recalculate', postWebhookRecalculate);
dashboardRouter.post('/intelligence/normalize-rates', requireAuth, requireBetaAcceptance(), postNormalizeRates);
dashboardRouter.post('/intelligence/market-confidence', requireAuth, requireBetaAcceptance(), postMarketConfidence);
dashboardRouter.post('/intelligence/position-analysis', requireAuth, requireBetaAcceptance(), postPositionAnalysis);
dashboardRouter.get('/api/intelligence/advice', requireAuth, requireBetaAcceptance(), getRevenueAdvice);
dashboardRouter.get('/api/intelligence/competitors', requireAuth, requireBetaAcceptance(), getCompetitorIntelligence);
dashboardRouter.get('/api/intelligence/demand-calendar', requireAuth, requireBetaAcceptance(), getDemandCalendarEntries);
dashboardRouter.get('/api/market-demand', requireAuth, requireBetaAcceptance(), getMarketDemandController);
dashboardRouter.get('/api/intelligence/demand-forecast', requireAuth, requireBetaAcceptance(), getDemandForecast);
dashboardRouter.get('/api/intelligence/alerts', requireAuth, requireBetaAcceptance(), getIntelligenceAlerts);
dashboardRouter.get('/api/intelligence/market-compression', requireAuth, requireBetaAcceptance(), getMarketCompression);
dashboardRouter.get('/api/intelligence/morning-brief', requireAuth, requireBetaAcceptance(), getMorningBrief);
dashboardRouter.get('/api/intelligence/map', requireAuth, requireBetaAcceptance(), getMarketIntelligenceMap);
dashboardRouter.get('/api/intelligence/opportunities', requireAuth, requireBetaAcceptance(), getMarketIntelligenceOpportunities);
dashboardRouter.get('/api/intelligence/leadradar-signals', requireAuth, requireBetaAcceptance(), getLeadRadarExternalSignalFeed);
dashboardRouter.get('/api/intelligence/leadradar-events', requireAuth, requireBetaAcceptance(), getLeadRadarUpcomingEvents);
dashboardRouter.get('/api/intelligence/market-position', requireAuth, requireBetaAcceptance(), getMarketPositionIntelligence);
dashboardRouter.get('/api/intelligence/radar-score', requireAuth, requireBetaAcceptance(), getRadarScore);
dashboardRouter.get('/api/intelligence/today', requireAuth, requireBetaAcceptance(), getTodayMarketIntelligence);
dashboardRouter.post('/api/intelligence/revenue-briefs/daily', requireAuth, requireBetaAcceptance(), postGenerateDailyRevenueIntelligenceBriefs);
dashboardRouter.get('/api/intelligence/revenue-briefs', requireAuth, requireBetaAcceptance(), getRevenueIntelligenceBriefHistory);
dashboardRouter.patch('/api/intelligence/revenue-briefs/:deliveryId/status', requireAuth, requireBetaAcceptance(), patchRevenueIntelligenceDeliveryStatus);
dashboardRouter.post('/api/intelligence/revenue-briefs/:deliveryId/feedback', requireAuth, requireBetaAcceptance(), postRevenueIntelligenceFeedback);
dashboardRouter.get('/api/debug/system-status', requireAuth, requireBetaAcceptance(), getDebugSystemStatus);
