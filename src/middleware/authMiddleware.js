import { getSessionUser } from '../services/authService.js';
import { validateUserRole } from '../services/intelligence-engine/securityEngine.js';

function extractBearer(headerValue) {
  if (!headerValue) return '';
  const [scheme, token] = headerValue.split(' ');
  if (scheme !== 'Bearer') return '';
  return token || '';
}

export async function requireAuth(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'test' && process.env.ENFORCE_AUTH_TEST !== 'true') {
      req.user =
        req.user || {
          id: 'test-user',
          role: 'super_admin',
          hotels: [],
          beta_accepted_at: new Date().toISOString(),
        };
      return next();
    }

    const token = extractBearer(req.headers.authorization || '');
    const user = await getSessionUser(token);
    if (!user) {
      const error = new Error('Unauthorized');
      error.status = 401;
      throw error;
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireBetaAcceptance() {
  return (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
      }

      if (user.beta_accepted_at) return next();

      const error = new Error('Beta legal acceptance required before dashboard access.');
      error.status = 451;
      error.codeName = 'LEGAL_ACCEPTANCE_REQUIRED';
      error.committedBy = 'user';
      throw error;
    } catch (error) {
      return next(error);
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    try {
      validateUserRole(req.user, roles);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireHotelScope() {
  return (req, res, next) => {
    try {
      const hotelId = String(req.params.id || '').trim();
      const user = req.user;

      if (!user) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
      }

      if (user.role === 'super_admin' || user.role === 'admin') return next();
      if (user.role === 'hotel_user' && user.hotels.includes(hotelId)) return next();

      const error = new Error('Forbidden: hotel access denied.');
      error.status = 403;
      throw error;
    } catch (error) {
      return next(error);
    }
  };
}
