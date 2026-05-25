import request from 'supertest';
import { app } from '../src/app.js';

describe('LeadRADAR response contract', () => {
  test('POST /api/leadradar/query returns the expected response shape', async () => {
    const response = await request(app)
      .post('/api/leadradar/query')
      .send({
        prompt: 'hotels in Goa without chatbot',
        filters: { limit: 20 },
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('hotels');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.hotels)).toBe(true);
    expect(typeof response.body.total).toBe('number');

    if (response.body.hotels.length > 0) {
      const firstHotel = response.body.hotels[0];
      expect(firstHotel).toHaveProperty('hotelId');
      expect(firstHotel).toHaveProperty('hotelName');
      expect(firstHotel).toHaveProperty('city');
      expect(firstHotel).toHaveProperty('leadScore');
      expect(firstHotel).toHaveProperty('signals');

      expect(typeof firstHotel.hotelId).toBe('string');
      expect(typeof firstHotel.hotelName).toBe('string');
      expect(typeof firstHotel.city).toBe('string');
      expect(typeof firstHotel.leadScore).toBe('number');
      expect(Array.isArray(firstHotel.signals)).toBe(true);
    }
  });

  test('GET /api/leadradar/opportunities returns the expected response shape', async () => {
    const response = await request(app)
      .get('/api/leadradar/opportunities')
      .query({
        city: 'Goa',
        minLeadScore: 0,
        limit: 20,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('opportunities');
    expect(Array.isArray(response.body.opportunities)).toBe(true);

    if (response.body.opportunities.length > 0) {
      const firstOpportunity = response.body.opportunities[0];
      expect(firstOpportunity).toHaveProperty('hotelId');
      expect(firstOpportunity).toHaveProperty('hotelName');
      expect(firstOpportunity).toHaveProperty('city');
      expect(firstOpportunity).toHaveProperty('leadScore');
      expect(firstOpportunity).toHaveProperty('opportunity');
      expect(firstOpportunity).toHaveProperty('action');

      expect(typeof firstOpportunity.hotelId).toBe('string');
      expect(typeof firstOpportunity.hotelName).toBe('string');
      expect(typeof firstOpportunity.city).toBe('string');
      expect(typeof firstOpportunity.leadScore).toBe('number');
    }
  });

  test('GET /api/leadradar/summary returns the expected response shape', async () => {
    const response = await request(app)
      .get('/api/leadradar/summary');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('hotelsWithoutChatbot');
    expect(response.body).toHaveProperty('hotelsLowRating');
    expect(response.body).toHaveProperty('hotelsHighReviewVolume');
    expect(response.body).toHaveProperty('totalOpportunities');

    expect(typeof response.body.hotelsWithoutChatbot).toBe('number');
    expect(typeof response.body.hotelsLowRating).toBe('number');
    expect(typeof response.body.hotelsHighReviewVolume).toBe('number');
    expect(typeof response.body.totalOpportunities).toBe('number');
  });
});
