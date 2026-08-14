import { jest } from '@jest/globals';

const getDashboard = jest.fn();
const insertRevenueBriefDelivery = jest.fn();
const updateRevenueBriefDeliveryStatus = jest.fn();
const sendRevenueIntelligenceEmail = jest.fn();
let smtpConfigured = true;

jest.unstable_mockModule('../src/services/dashboardService.js', () => ({
  getDashboard,
}));

jest.unstable_mockModule('../src/repositories/hotelRepository.js', () => ({
  getHotelById: jest.fn(async () => ({
    id: 'hotel-1',
    hotel_name: 'The Ten Resort Siolim Goa',
    city: 'Goa',
  })),
  listHotels: jest.fn(async () => []),
}));

jest.unstable_mockModule('../src/repositories/revenueIntelligenceDeliveryRepository.js', () => ({
  addRevenueBriefFeedback: jest.fn(),
  insertRevenueBriefDelivery,
  listRevenueBriefDeliveries: jest.fn(async () => []),
  updateRevenueBriefDeliveryStatus,
}));

jest.unstable_mockModule('../src/services/emailDeliveryService.js', () => ({
  isSmtpConfigured: jest.fn(() => smtpConfigured),
  isValidEmail: jest.fn((value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())),
  normalizeEmail: jest.fn((value = '') => String(value || '').trim().toLowerCase()),
  sendRevenueIntelligenceEmail,
}));

const { generateRevenueIntelligenceBrief } = await import('../src/services/revenueIntelligenceDeliveryService.js');

const dashboardPayload = {
  hotel: {
    name: 'The Ten Goa',
  },
  marketContext: {
    checkinDate: '2026-08-15',
  },
  revenueIntelligenceModel: {
    executiveSummary: {
      pricingAction: 'Close Discount',
      confidenceScore: 86,
      trustStatus: 'actionable',
    },
    evidence: [
      { key: 'official_rate', label: 'Official rate', status: 'ready', value: '₹36,800' },
      { key: 'ota_rate', label: 'OTA evidence', status: 'ready', value: '3 OTA rows' },
      { key: 'competitor_rate', label: 'Competitor evidence', status: 'ready', value: '5 comp rows' },
      { key: 'market_price', label: 'Market price', status: 'ready', value: '₹32,471' },
      { key: 'event_pressure', label: 'Event / holiday', status: 'ready', value: '2 signals' },
      { key: 'freshness', label: 'Freshness', status: 'ready', value: '18 fresh rows' },
    ],
    opportunityRows: [
      {
        opportunity: 'Protect premium rate position',
        action: 'Hold rate and validate pickup.',
      },
    ],
    missingDataActions: [],
    morningBrief: {
      whatsappDraft: 'HotelRADAR Morning Revenue Intelligence\n2026-08-15: Close Discount',
    },
  },
};

function deliveryRow(overrides = {}) {
  return {
    id: 'delivery-1',
    hotel_id: 'hotel-1',
    hotel_name: 'The Ten Goa',
    city: 'Goa',
    stay_date: '2026-08-15',
    channel: 'email',
    status: 'queued',
    pricing_action: 'Close Discount',
    confidence_score: 86,
    trust_status: 'actionable',
    recipient_email: 'manish@manishpurohit.in',
    subject: 'HotelRADAR Revenue Intelligence: The Ten Goa',
    brief_text: 'HotelRADAR Revenue Intelligence',
    provider_message_id: null,
    generated_at: '2026-08-14T08:00:00.000Z',
    delivered_at: null,
    feedback_status: null,
    feedback_note: null,
    feedback_at: null,
    ...overrides,
  };
}

describe('revenueIntelligenceDeliveryService email channel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    smtpConfigured = true;
    getDashboard.mockResolvedValue(dashboardPayload);
    insertRevenueBriefDelivery.mockResolvedValue(deliveryRow());
    updateRevenueBriefDeliveryStatus.mockResolvedValue(
      deliveryRow({
        status: 'sent',
        delivered_at: '2026-08-14T08:01:00.000Z',
        provider_message_id: 'message-1',
      }),
    );
    sendRevenueIntelligenceEmail.mockResolvedValue({
      messageId: 'message-1',
      accepted: ['manish@manishpurohit.in'],
      rejected: [],
      response: '250 ok',
    });
  });

  test('sends an email brief and marks the delivery as sent', async () => {
    const result = await generateRevenueIntelligenceBrief({
      hotelId: 'hotel-1',
      stayDate: '2026-08-15',
      channel: 'email',
      recipientEmail: 'Manish@ManishPurohit.in ',
    });

    expect(insertRevenueBriefDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        status: 'queued',
        recipientEmail: 'manish@manishpurohit.in',
        pricingAction: 'Close Discount',
        confidenceScore: 86,
      }),
    );
    expect(sendRevenueIntelligenceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manish@manishpurohit.in',
        subject: expect.stringContaining('HotelRADAR Daily Market Intelligence'),
        text: expect.stringContaining('Recommended action: Close Discount'),
        attachments: [
          expect.objectContaining({
            filename: expect.stringContaining('hotelradar-daily-market-intelligence'),
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    expect(updateRevenueBriefDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'delivery-1',
        status: 'sent',
        providerMessageId: 'message-1',
      }),
    );
    expect(result.delivery.status).toBe('sent');
    expect(result.delivery.recipientEmail).toBe('manish@manishpurohit.in');
  });

  test('records failed status when SMTP is not configured', async () => {
    smtpConfigured = false;
    updateRevenueBriefDeliveryStatus.mockResolvedValue(
      deliveryRow({
        status: 'failed',
        delivery_error: 'SMTP is not configured.',
      }),
    );

    const result = await generateRevenueIntelligenceBrief({
      hotelId: 'hotel-1',
      stayDate: '2026-08-15',
      channel: 'email',
      recipientEmail: 'manish@manishpurohit.in',
    });

    expect(sendRevenueIntelligenceEmail).not.toHaveBeenCalled();
    expect(updateRevenueBriefDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'delivery-1',
        status: 'failed',
      }),
    );
    expect(result.delivery.status).toBe('failed');
    expect(result.emailError).toMatch(/SMTP is not configured/i);
  });
});
