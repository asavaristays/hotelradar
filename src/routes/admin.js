import express from 'express';
import {
  getCalibrationRunList,
  getCanaryHotelList,
  deleteHotel,
  getCityList,
  getHolidayCalendarList,
  getHotelProfiles,
  getPasswordResetRequestList,
  getSeasonProfileList,
  getStateList,
  getUsageAnalytics,
  getAuditLogList,
  getCalibration,
  patchHotelProfile,
  patchHotelUserProfile,
  patchCanaryHotel,
  patchHotelSubscription,
  postAlertFeedback,
  postCity,
  postHotel,
  postOutcomeCsvUpload,
  postRunNightlyCalibration,
  postResolvePasswordReset,
  postRunCityCalibration,
  postSeasonProfile,
  postState,
  putCalibration,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireRole('super_admin', 'admin'));
adminRouter.get('/admin/states', getStateList);
adminRouter.get('/admin/cities', getCityList);
adminRouter.get('/admin/season-profiles', getSeasonProfileList);
adminRouter.get('/admin/holiday-calendars', getHolidayCalendarList);
adminRouter.get('/admin/hotels', getHotelProfiles);
adminRouter.post('/admin/states', requireRole('super_admin'), postState);
adminRouter.post('/admin/season-profiles', requireRole('super_admin'), postSeasonProfile);
adminRouter.post('/admin/cities', postCity);
adminRouter.post('/admin/hotels', postHotel);
adminRouter.patch('/admin/hotels/:id', patchHotelProfile);
adminRouter.patch('/admin/hotels/:id/user', patchHotelUserProfile);
adminRouter.delete('/admin/hotels/:id', requireRole('super_admin'), deleteHotel);
adminRouter.patch('/admin/hotels/:id/subscription', patchHotelSubscription);
adminRouter.get('/admin/usage', getUsageAnalytics);
adminRouter.get('/admin/password-reset-requests', getPasswordResetRequestList);
adminRouter.post('/admin/password-reset-requests/:id/resolve', postResolvePasswordReset);
adminRouter.get('/admin/audit-logs', getAuditLogList);
adminRouter.get('/admin/calibration', getCalibration);
adminRouter.put('/admin/calibration', putCalibration);
adminRouter.post('/admin/calibration/outcomes-csv', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), postOutcomeCsvUpload);
adminRouter.post('/admin/calibration/run-city', requireRole('super_admin'), postRunCityCalibration);
adminRouter.post('/admin/calibration/run-nightly', requireRole('super_admin'), postRunNightlyCalibration);
adminRouter.get('/admin/calibration/runs', getCalibrationRunList);
adminRouter.get('/admin/calibration/canary-hotels', getCanaryHotelList);
adminRouter.patch('/admin/calibration/canary-hotels/:id', requireRole('super_admin'), patchCanaryHotel);
adminRouter.post('/admin/alerts/:id/feedback', postAlertFeedback);
