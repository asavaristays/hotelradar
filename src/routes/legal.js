import express from 'express';
import { postAcceptBeta } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const legalRouter = express.Router();

legalRouter.post('/api/legal/accept-beta', requireAuth, postAcceptBeta);
