import { getDashboard } from './dashboardService.js';
import { getHotelById, listHotels } from '../repositories/hotelRepository.js';
import {
  addRevenueBriefFeedback,
  insertRevenueBriefDelivery,
  listRevenueBriefDeliveries,
  updateRevenueBriefDeliveryStatus,
} from '../repositories/revenueIntelligenceDeliveryRepository.js';
import {
  isSmtpConfigured,
  isValidEmail,
  normalizeEmail,
  sendRevenueIntelligenceEmail,
} from './emailDeliveryService.js';
import { buildClientInsightNarrative } from './revenueIntelligenceInsightNarrativeService.js';
import { buildRevenueIntelligencePdf } from './revenueIntelligencePdfService.js';

const FEEDBACK_STATUSES = new Set(['accepted', 'rejected', 'needs_followup', 'client_question', 'not_reviewed']);
const DELIVERY_STATUSES = new Set(['generated', 'queued', 'sent', 'failed', 'reviewed']);

function validationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw validationError('stay_date must be YYYY-MM-DD.');
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw validationError('stay_date must be a valid calendar date.');
  }
  return raw;
}

function currentIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateString, days) {
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

function formatDbDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

function defaultStayDate() {
  return addDays(currentIndiaDate(), 1);
}

function deliveryStatusForChannel(channel = 'manual') {
  if (channel === 'dashboard' || channel === 'manual' || channel === 'api') return 'generated';
  return 'queued';
}

function formatDisplayDate(value = '') {
  const safeDate = normalizeDate(value);
  const parsed = new Date(`${safeDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function defaultSubject({ dashboard = {}, stayDate = '', action = '' } = {}) {
  const hotelName = dashboard?.hotel?.name || dashboard?.hotelName || 'HotelRADAR property';
  const generatedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  return `HotelRADAR Daily Market Intelligence - ${hotelName} - ${formatDisplayDate(stayDate)} - ${action || 'Revenue action'} - ${generatedAt}`;
}

function buildEmailBody({ dashboard = {}, model = {}, stayDate = '' } = {}) {
  const summary = model.executiveSummary || {};
  const brief = model.morningBrief || {};
  const evidence = Array.isArray(model.evidence) ? model.evidence : [];
  const opportunities = Array.isArray(model.opportunityRows) ? model.opportunityRows : [];
  const missingActions = Array.isArray(model.missingDataActions) ? model.missingDataActions : [];
  const hotelName = dashboard?.hotel?.name || dashboard?.hotelName || 'HotelRADAR property';
  const insights = buildClientInsightNarrative({ dashboard, model });
  const generatedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  const evidenceLines = evidence
    .slice(0, 8)
    .map((item) => `- ${item.label}: ${item.status}${item.value ? ` (${item.value})` : ''}`)
    .join('\n');

  const opportunityLines = opportunities
    .slice(0, 4)
    .map((item) => `- ${item.opportunity || item.title || item.label}: ${item.action || item.recommendedAction || item.description || 'Review with revenue team.'}`)
    .join('\n');

  const missingLines = missingActions
    .slice(0, 4)
    .map((item) => `- ${item.label || item.key || 'Signal'}: ${item.action || item}`)
    .join('\n');

  const text = [
    `HotelRADAR Daily Market Intelligence`,
    `Good morning,`,
    '',
    `Please find today's HotelRADAR market intelligence for ${hotelName}. This is not a traditional RMS rate alert; it combines market evidence, demand pressure, freshness, opportunity gaps, and commercial actions so the hotel can decide what to protect, fix, or pursue today.`,
    '',
    `${hotelName} · Stay date ${formatDisplayDate(stayDate)}`,
    `Generated ${generatedAt}`,
    '',
    `Recommended action: ${summary.pricingAction || 'Need More Data'}`,
    `Confidence: ${summary.confidenceScore ?? 'Unavailable'}%`,
    `Trust status: ${summary.trustStatus || 'Unavailable'}`,
    '',
    brief.whatsappDraft || 'Morning Revenue Intelligence brief is generated.',
    '',
    'Market read',
    ...insights.marketRead.map((line) => `- ${line}`),
    '',
    'Where the hotel may be going wrong',
    ...insights.whereHotelIsGoingWrong.map((line) => `- ${line}`),
    '',
    'Commercial actions',
    ...insights.commercialActions.map((line) => `- ${line}`),
    '',
    'Digital asset watch',
    ...insights.digitalAssetWatch.map((line) => `- ${line}`),
    '',
    'Signal readiness',
    evidenceLines || '- No signal classification available.',
    '',
    'Opportunity view',
    opportunityLines || '- No sales opportunity is ready yet.',
    '',
    'Missing / next actions',
    missingLines || '- Continue normal monitoring.',
    '',
    'Note: This is advisory Revenue Intelligence. Validate rate changes in your PMS/channel manager before publishing.',
  ].join('\n');

  const html = `
    <div style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,sans-serif;color:#172033;line-height:1.5">
      <div style="max-width:720px;margin:0 auto;padding:28px 18px">
        <div style="background:#ffffff;border:1px solid #dbe5f1;border-radius:20px;overflow:hidden">
          <div style="padding:22px 26px;border-bottom:1px solid #e7edf5;background:linear-gradient(135deg,#ffffff 0%,#f3fbf9 100%)">
            <div style="font-size:22px;letter-spacing:-0.4px">
              <span style="color:#172033">Hotel</span><span style="color:#55c744">RADAR</span>
            </div>
            <div style="color:#5b6b83;font-size:12px;margin-top:2px">Realtime revenue signals</div>
          </div>
          <div style="padding:26px">
            <p style="margin:0 0 12px">Good morning,</p>
            <p style="margin:0 0 18px;color:#52627a">
              Please find today's HotelRADAR market intelligence for <span style="color:#172033">${hotelName}</span>.
              This is not a traditional RMS rate alert; it highlights market evidence, demand pressure,
              opportunity gaps, digital-asset watch points, and commercial actions.
            </p>
            <div style="border:1px solid #dbe5f1;border-radius:16px;padding:16px;margin:0 0 18px;background:#fbfdff">
              <div style="font-size:12px;color:#5b6b83">Stay date</div>
              <div style="font-size:16px;margin-bottom:12px">${formatDisplayDate(stayDate)}</div>
              <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:10px;border-top:1px solid #edf2f7"><span style="color:#5b6b83;font-size:12px">Recommended action</span><br>${summary.pricingAction || 'Need More Data'}</td>
                  <td style="padding:10px;border-top:1px solid #edf2f7"><span style="color:#5b6b83;font-size:12px">Confidence</span><br>${summary.confidenceScore ?? 'Unavailable'}%</td>
                  <td style="padding:10px;border-top:1px solid #edf2f7"><span style="color:#5b6b83;font-size:12px">Trust status</span><br>${summary.trustStatus || 'Unavailable'}</td>
                </tr>
              </table>
            </div>
            <div style="border-left:4px solid #149b93;padding:8px 0 8px 14px;margin-bottom:20px;color:#52627a;white-space:pre-line">${brief.whatsappDraft || 'Morning Revenue Intelligence brief is generated.'}</div>
            <div style="margin-bottom:18px">
              <div style="font-size:14px;margin-bottom:8px">Market read</div>
              <ul style="margin:0;padding-left:18px;color:#52627a">${insights.marketRead.map((line) => `<li>${line}</li>`).join('')}</ul>
            </div>
            <div style="margin-bottom:18px">
              <div style="font-size:14px;margin-bottom:8px">Where the hotel may be going wrong</div>
              <ul style="margin:0;padding-left:18px;color:#52627a">${insights.whereHotelIsGoingWrong.map((line) => `<li>${line}</li>`).join('')}</ul>
            </div>
            <div style="margin-bottom:18px">
              <div style="font-size:14px;margin-bottom:8px">Commercial actions</div>
              <ul style="margin:0;padding-left:18px;color:#52627a">${insights.commercialActions.slice(0, 4).map((line) => `<li>${line}</li>`).join('')}</ul>
            </div>
            <div style="margin-bottom:18px">
              <div style="font-size:14px;margin-bottom:8px">Signal readiness</div>
              ${(evidence.slice(0, 8).map((item) => `<div style="display:inline-block;margin:0 8px 8px 0;padding:7px 10px;border-radius:999px;background:#f4f8fc;border:1px solid #dbe5f1;font-size:12px">${item.label}: ${item.status}${item.value ? ` · ${item.value}` : ''}</div>`).join('')) || '<div style="color:#5b6b83;font-size:12px">No signal classification available.</div>'}
            </div>
            <div style="margin-bottom:18px">
              <div style="font-size:14px;margin-bottom:8px">Opportunity view</div>
              <ul style="margin:0;padding-left:18px;color:#52627a">${(opportunities.slice(0, 4).map((item) => `<li>${item.opportunity || item.title || item.label}: ${item.action || item.recommendedAction || item.description || 'Review with revenue team.'}</li>`).join('')) || '<li>No sales opportunity is ready yet.</li>'}</ul>
            </div>
            <p style="margin:20px 0 0;color:#52627a;font-size:12px">
              Generated ${generatedAt}. Advisory Revenue Intelligence only. Validate rate changes in PMS/channel manager before publishing.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return { text, html };
}

function publicDelivery(delivery = {}) {
  return {
    id: delivery.id,
    hotelId: delivery.hotel_id,
    hotelName: delivery.hotel_name,
    city: delivery.city,
    stayDate: formatDbDate(delivery.stay_date),
    channel: delivery.channel,
    status: delivery.status,
    pricingAction: delivery.pricing_action,
    confidenceScore: delivery.confidence_score == null ? null : Number(delivery.confidence_score),
    trustStatus: delivery.trust_status,
    recipientEmail: delivery.recipient_email || null,
    subject: delivery.subject || null,
    briefText: delivery.brief_text,
    providerMessageId: delivery.provider_message_id || null,
    generatedAt: delivery.generated_at ? new Date(delivery.generated_at).toISOString() : null,
    deliveredAt: delivery.delivered_at ? new Date(delivery.delivered_at).toISOString() : null,
    feedbackStatus: delivery.feedback_status,
    feedbackNote: delivery.feedback_note,
    feedbackAt: delivery.feedback_at ? new Date(delivery.feedback_at).toISOString() : null,
  };
}

export async function generateRevenueIntelligenceBrief({
  hotelId,
  stayDate = '',
  channel = 'manual',
  recipientEmail = '',
  subject = '',
  generatedBy = null,
  userRole = null,
} = {}) {
  const safeHotelId = String(hotelId || '').trim();
  if (!safeHotelId) throw validationError('hotel_id is required.');
  const safeStayDate = normalizeDate(stayDate || defaultStayDate());
  const safeChannel = ['manual', 'whatsapp', 'email', 'dashboard', 'api'].includes(String(channel || '').trim())
    ? String(channel || '').trim()
    : 'manual';
  const safeRecipientEmail = normalizeEmail(recipientEmail);
  if (safeChannel === 'email' && !isValidEmail(safeRecipientEmail)) {
    throw validationError('A valid recipient_email is required when channel is email.');
  }

  const dashboard = await getDashboard(safeHotelId, {
    checkin_date: safeStayDate,
    user_id: generatedBy,
    user_role: userRole,
    source: 'morning-revenue-intelligence',
    triggered_by: 'phase-4-morning-brief',
  });
  const hotelRecord = await getHotelById(safeHotelId);
  const dashboardForDelivery = {
    ...dashboard,
    hotel: {
      ...(dashboard?.hotel || {}),
      name: dashboard?.hotel?.name || dashboard?.hotelName || hotelRecord?.hotel_name || 'HotelRADAR property',
    },
  };

  const model = dashboard?.revenueIntelligenceModel;
  if (!model?.morningBrief?.whatsappDraft) {
    throw validationError('Revenue Intelligence model did not produce a morning brief.', 422);
  }

  const emailSubject = String(subject || '').trim() || defaultSubject({
    dashboard: dashboardForDelivery,
    stayDate: safeStayDate,
    action: model.executiveSummary?.pricingAction || '',
  });
  const emailBody = buildEmailBody({ dashboard: dashboardForDelivery, model, stayDate: safeStayDate });

  const delivery = await insertRevenueBriefDelivery({
    hotelId: safeHotelId,
    stayDate: safeStayDate,
    channel: safeChannel,
    status: deliveryStatusForChannel(safeChannel),
    pricingAction: model.executiveSummary?.pricingAction || '',
    confidenceScore: model.executiveSummary?.confidenceScore ?? null,
    trustStatus: model.executiveSummary?.trustStatus || '',
    briefText: safeChannel === 'email' ? emailBody.text : model.morningBrief.whatsappDraft,
    modelSnapshot: model,
    generatedBy,
    recipientEmail: safeChannel === 'email' ? safeRecipientEmail : null,
    subject: safeChannel === 'email' ? emailSubject : null,
  });

  if (safeChannel === 'email') {
    try {
      if (!isSmtpConfigured()) {
        throw validationError(
          'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.',
          503,
        );
      }
      const pdf = await buildRevenueIntelligencePdf({
        dashboard: dashboardForDelivery,
        model,
        stayDate: safeStayDate,
      });
      const sendResult = await sendRevenueIntelligenceEmail({
        to: safeRecipientEmail,
        subject: emailSubject,
        text: emailBody.text,
        html: emailBody.html,
        attachments: [
          {
            filename: pdf.filename,
            content: pdf.buffer,
            contentType: pdf.contentType,
          },
        ],
      });
      const sentDelivery = await updateRevenueBriefDeliveryStatus({
        deliveryId: delivery.id,
        status: 'sent',
        deliveredAt: new Date().toISOString(),
        deliveryError: null,
        providerMessageId: sendResult.messageId || null,
        providerResponse: sendResult,
      });
      return {
        delivery: publicDelivery(sentDelivery),
        model,
      };
    } catch (error) {
      const failedDelivery = await updateRevenueBriefDeliveryStatus({
        deliveryId: delivery.id,
        status: 'failed',
        deliveryError: error.message,
      });
      return {
        delivery: publicDelivery(failedDelivery),
        model,
        emailError: error.message,
      };
    }
  }

  return {
    delivery: publicDelivery(delivery),
    model,
  };
}

export async function generateDailyRevenueIntelligenceBriefs({
  stayDate = '',
  channel = 'manual',
  recipientEmail = '',
  subject = '',
  generatedBy = null,
  userRole = null,
  limit = 25,
} = {}) {
  const hotels = await listHotels();
  const selectedHotels = hotels.slice(0, Math.max(1, Math.min(100, Number(limit || 25))));
  const results = [];
  const errors = [];

  for (const hotel of selectedHotels) {
    try {
      const result = await generateRevenueIntelligenceBrief({
        hotelId: hotel.id,
        stayDate,
        channel,
        recipientEmail,
        subject,
        generatedBy,
        userRole,
      });
      results.push(result.delivery);
    } catch (error) {
      errors.push({
        hotelId: hotel.id,
        hotelName: hotel.hotel_name,
        error: error.message,
      });
    }
  }

  return {
    generated: results.length,
    failed: errors.length,
    stayDate: normalizeDate(stayDate || defaultStayDate()),
    deliveries: results,
    errors,
  };
}

export async function markRevenueIntelligenceDelivery({
  deliveryId,
  status,
  deliveryError = '',
} = {}) {
  const safeStatus = String(status || '').trim().toLowerCase();
  if (!DELIVERY_STATUSES.has(safeStatus)) {
    throw validationError('status must be generated, queued, sent, failed, or reviewed.');
  }
  const delivery = await updateRevenueBriefDeliveryStatus({
    deliveryId,
    status: safeStatus,
    deliveredAt: safeStatus === 'sent' ? new Date().toISOString() : null,
    deliveryError: deliveryError || null,
  });
  if (!delivery) throw validationError('Delivery not found.', 404);
  return publicDelivery(delivery);
}

export async function recordRevenueIntelligenceFeedback({
  deliveryId,
  feedbackStatus,
  feedbackNote = '',
  feedbackBy = null,
} = {}) {
  const safeFeedback = String(feedbackStatus || '').trim().toLowerCase();
  if (!FEEDBACK_STATUSES.has(safeFeedback)) {
    throw validationError('feedback_status must be accepted, rejected, needs_followup, client_question, or not_reviewed.');
  }
  const delivery = await addRevenueBriefFeedback({
    deliveryId,
    feedbackStatus: safeFeedback,
    feedbackNote,
    feedbackBy,
  });
  if (!delivery) throw validationError('Delivery not found.', 404);
  return publicDelivery(delivery);
}

export async function getRevenueIntelligenceDeliveryHistory({ hotelId = null, limit = 20 } = {}) {
  const rows = await listRevenueBriefDeliveries({ hotelId, limit });
  return {
    deliveries: rows.map(publicDelivery),
  };
}
