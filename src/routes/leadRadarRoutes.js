import express from 'express';
import {
  getHotel,
  getHotels,
  getOpportunities,
  getSummary,
  queryPrompt,
  refreshLeadData,
} from '../controllers/leadRadarController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  validateLeadRadarHotelId,
  validateLeadRadarHotels,
  validateLeadRadarOpportunities,
  validateLeadRadarQuery,
  validateLeadRadarRefresh,
} from '../middleware/leadRadarValidation.js';

export const leadRadarRouter = express.Router();

leadRadarRouter.use(requireAuth, requireRole('super_admin', 'admin'));
leadRadarRouter.post('/query', validateLeadRadarQuery, queryPrompt);
leadRadarRouter.get('/hotels', validateLeadRadarHotels, getHotels);
leadRadarRouter.get('/opportunities', validateLeadRadarOpportunities, getOpportunities);
// Optional query param: city
leadRadarRouter.get('/summary', getSummary);
leadRadarRouter.get('/hotel/:hotelId', validateLeadRadarHotelId, getHotel);
leadRadarRouter.post('/refresh', validateLeadRadarRefresh, refreshLeadData);
