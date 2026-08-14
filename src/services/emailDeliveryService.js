import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

function deliveryError(message, code = 'EMAIL_DELIVERY_FAILED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeEmail(value = '') {
  const safeEmail = String(value || '').trim().toLowerCase();
  if (!safeEmail) return '';
  return safeEmail;
}

export function isValidEmail(value = '') {
  const safeEmail = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail);
}

export function isSmtpConfigured() {
  return Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.emailFrom);
}

function createTransporter() {
  if (!isSmtpConfigured()) {
    throw deliveryError(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.',
      'SMTP_NOT_CONFIGURED',
    );
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    requireTLS: env.smtpRequireTls,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

export async function sendRevenueIntelligenceEmail({
  to,
  subject,
  text,
  html = '',
  attachments = [],
} = {}) {
  const recipientEmail = normalizeEmail(to);
  if (!isValidEmail(recipientEmail)) {
    throw deliveryError('A valid recipient email is required.', 'INVALID_RECIPIENT_EMAIL');
  }
  if (!String(subject || '').trim()) {
    throw deliveryError('Email subject is required.', 'EMAIL_SUBJECT_REQUIRED');
  }
  if (!String(text || '').trim()) {
    throw deliveryError('Email body is required.', 'EMAIL_BODY_REQUIRED');
  }

  const transporter = createTransporter();
  const result = await transporter.sendMail({
    from: env.emailFrom,
    replyTo: env.emailReplyTo || undefined,
    to: recipientEmail,
    subject: String(subject).trim(),
    text,
    html: html || undefined,
    attachments: Array.isArray(attachments) ? attachments : [],
  });

  logger.info('revenue_intelligence_email_sent', {
    to: recipientEmail,
    messageId: result.messageId || null,
    acceptedCount: Array.isArray(result.accepted) ? result.accepted.length : null,
    rejectedCount: Array.isArray(result.rejected) ? result.rejected.length : null,
  });

  return {
    messageId: result.messageId || null,
    accepted: result.accepted || [],
    rejected: result.rejected || [],
    response: result.response || '',
  };
}
