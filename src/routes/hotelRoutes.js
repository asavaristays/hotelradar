import express from 'express';
import { getAlerts, getDashboard, getDemand, recalculate } from '../controllers/hotelController.js';

export const hotelRouter = express.Router();

hotelRouter.get('/hotel/:id/dashboard', getDashboard);
hotelRouter.get('/hotel/:id/demand', getDemand);
hotelRouter.get('/hotel/:id/alerts', getAlerts);
hotelRouter.post('/hotel/:id/recalculate', recalculate);
