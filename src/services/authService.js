import crypto from 'crypto';
import { env } from '../config/env.js';
import {
  acceptBetaTermsForUser,
  createPasswordResetRequest,
  getFirstHotelIdForUser,
  getUserByEmail,
  getUserById,
  listUserHotelIds,
} from '../repositories/authRepository.js';

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(data) {
  return crypto.createHmac('sha256', env.authSecret).update(data).digest('base64url');
}

export function hashPassword(rawPassword) {
  return crypto.createHash('sha256').update(`${rawPassword}${env.authPepper}`).digest('hex');
}

export function issueToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function login(email, password) {
  const user = await getUserByEmail(email);
  if (!user || !user.active) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const incomingHash = hashPassword(password);
  if (incomingHash !== user.password_hash) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const hotelIds = await listUserHotelIds(user.id);
  const exp = Date.now() + env.tokenTtlMinutes * 60 * 1000;
  const token = issueToken({
    sub: user.id,
    role: user.role,
    hotels: hotelIds,
    exp,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name || '',
      mobile_no: user.mobile_no || '',
      role: user.role,
      hotels: hotelIds,
      exp,
      beta_accepted_at: user.beta_accepted_at || null,
    },
  };
}

export async function getSessionUser(token) {
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await getUserById(payload.sub);
  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name || '',
    mobile_no: user.mobile_no || '',
    role: user.role,
    hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
    exp: payload.exp,
    beta_accepted_at: user.beta_accepted_at || null,
  };
}

export async function requestPasswordReset(email, requestedByIp = null) {
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail) {
    const error = new Error('Email is required.');
    error.status = 400;
    throw error;
  }

  const user = await getUserByEmail(safeEmail);
  const hotelId = user ? await getFirstHotelIdForUser(user.id) : null;

  await createPasswordResetRequest({
    email: safeEmail,
    userId: user?.id || null,
    hotelId,
    requestedByIp,
  });

  return {
    message:
      'Password reset request submitted. An admin will contact you after verification.',
  };
}

export async function acceptBetaTerms(userId) {
  const accepted = await acceptBetaTermsForUser(userId);
  if (!accepted) {
    const error = new Error('Unable to record beta acceptance.');
    error.status = 500;
    throw error;
  }
  return accepted;
}
