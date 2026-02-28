import express from 'express';
import { getMe, postForgotPassword, postLogin } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const authRouter = express.Router();

authRouter.post('/auth/login', postLogin);
authRouter.post('/auth/forgot-password', postForgotPassword);
authRouter.get('/auth/me', requireAuth, getMe);
