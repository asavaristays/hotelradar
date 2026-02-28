import express from 'express';
import { getHotels } from '../controllers/hotelsController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const hotelsRouter = express.Router();

hotelsRouter.get('/hotels', requireAuth, getHotels);
