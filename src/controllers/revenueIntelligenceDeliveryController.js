import {
  generateDailyRevenueIntelligenceBriefs,
  generateRevenueIntelligenceBrief,
  getRevenueIntelligenceDeliveryHistory,
  markRevenueIntelligenceDelivery,
  recordRevenueIntelligenceFeedback,
} from '../services/revenueIntelligenceDeliveryService.js';

function resolveHotelId(req) {
  return String(req.params?.id || req.query?.hotel_id || req.body?.hotel_id || '').trim();
}

export async function postGenerateRevenueIntelligenceBrief(req, res, next) {
  try {
    const payload = await generateRevenueIntelligenceBrief({
      hotelId: resolveHotelId(req),
      stayDate: req.body?.stay_date || req.body?.stayDate || req.query?.stay_date || '',
      channel: req.body?.channel || 'manual',
      recipientEmail: req.body?.recipient_email || req.body?.recipientEmail || '',
      subject: req.body?.subject || '',
      generatedBy: req.user?.id || null,
      userRole: req.user?.role || null,
    });
    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function postGenerateDailyRevenueIntelligenceBriefs(req, res, next) {
  try {
    const payload = await generateDailyRevenueIntelligenceBriefs({
      stayDate: req.body?.stay_date || req.body?.stayDate || req.query?.stay_date || '',
      channel: req.body?.channel || 'manual',
      recipientEmail: req.body?.recipient_email || req.body?.recipientEmail || '',
      subject: req.body?.subject || '',
      generatedBy: req.user?.id || null,
      userRole: req.user?.role || null,
      limit: req.body?.limit || req.query?.limit || 25,
    });
    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function getRevenueIntelligenceBriefHistory(req, res, next) {
  try {
    const payload = await getRevenueIntelligenceDeliveryHistory({
      hotelId: resolveHotelId(req) || null,
      limit: req.query?.limit || 20,
    });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function patchRevenueIntelligenceDeliveryStatus(req, res, next) {
  try {
    const payload = await markRevenueIntelligenceDelivery({
      deliveryId: req.params.deliveryId,
      status: req.body?.status,
      deliveryError: req.body?.delivery_error || req.body?.deliveryError || '',
    });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function postRevenueIntelligenceFeedback(req, res, next) {
  try {
    const payload = await recordRevenueIntelligenceFeedback({
      deliveryId: req.params.deliveryId,
      feedbackStatus: req.body?.feedback_status || req.body?.feedbackStatus,
      feedbackNote: req.body?.feedback_note || req.body?.feedbackNote || '',
      feedbackBy: req.user?.id || null,
    });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}
