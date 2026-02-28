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
  postWebhookRecalculate,
} from '../controllers/dashboardController.js';
import {
  postMarketConfidence,
  postNormalizeRates,
  postPositionAnalysis,
} from '../controllers/intelligenceController.js';
import { requireAuth, requireBetaAcceptance, requireHotelScope } from '../middleware/authMiddleware.js';

export const dashboardRouter = express.Router();

dashboardRouter.get('/hotel/:id/dashboard', requireAuth, requireBetaAcceptance(), requireHotelScope(), getHotelDashboard);
dashboardRouter.post('/hotel/:id/recalculate', requireAuth, requireBetaAcceptance(), requireHotelScope(), postRecalculate);
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
