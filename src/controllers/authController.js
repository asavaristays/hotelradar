import { acceptBetaTerms, login, requestPasswordReset } from '../services/authService.js';

export async function postLogin(req, res, next) {
  try {
    const { email = '', password = '' } = req.body || {};
    if (!email || !password) {
      const error = new Error('Email and password are required.');
      error.status = 400;
      throw error;
    }

    const session = await login(email, password);
    return res.json(session);
  } catch (error) {
    return next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    return res.json({ user: req.user });
  } catch (error) {
    return next(error);
  }
}

export async function postForgotPassword(req, res, next) {
  try {
    const { email = '' } = req.body || {};
    const response = await requestPasswordReset(email, req.ip || null);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
}

export async function postAcceptBeta(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const error = new Error('Unauthorized');
      error.status = 401;
      throw error;
    }

    const result = await acceptBetaTerms(userId);
    return res.json({
      success: true,
      betaAcceptedAt: result.beta_accepted_at,
    });
  } catch (error) {
    return next(error);
  }
}
