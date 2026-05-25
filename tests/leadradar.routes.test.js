import request from 'supertest';
import { app } from '../src/app.js';

describe('LeadRADAR route validation', () => {
  test('POST /api/leadradar/query accepts a valid prompt request', async () => {
    const response = await request(app)
      .post('/api/leadradar/query')
      .send({
        prompt: 'Show me Goa hotels with weak OTA parity',
        filters: { limit: 20 },
      });

    expect(response.status).not.toBe(400);
    expect(response.status).not.toBe(404);
    expect(response.body?.code).not.toBe('VALIDATION_ERROR');
  });

  test('POST /api/leadradar/query rejects limit > 100', async () => {
    const response = await request(app)
      .post('/api/leadradar/query')
      .send({
        prompt: 'Find hotels',
        filters: { limit: 101 },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/leadradar/hotels accepts a valid city filter request', async () => {
    const response = await request(app)
      .get('/api/leadradar/hotels')
      .query({ city: 'Goa', limit: 20 });

    expect(response.status).not.toBe(400);
    expect(response.status).not.toBe(404);
    expect(response.body?.code).not.toBe('VALIDATION_ERROR');
  });

  test('GET /api/leadradar/hotels rejects invalid ratingBelow type', async () => {
    const response = await request(app)
      .get('/api/leadradar/hotels')
      .query({ ratingBelow: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/leadradar/opportunities accepts a valid request', async () => {
    const response = await request(app)
      .get('/api/leadradar/opportunities')
      .query({ city: 'Goa', minLeadScore: 50, limit: 10 });

    expect(response.status).not.toBe(400);
    expect(response.status).not.toBe(404);
    expect(response.body?.code).not.toBe('VALIDATION_ERROR');
  });

  test('GET /api/leadradar/opportunities rejects invalid minLeadScore type', async () => {
    const response = await request(app)
      .get('/api/leadradar/opportunities')
      .query({ minLeadScore: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/leadradar/hotel/:hotelId rejects invalid UUID', async () => {
    const response = await request(app)
      .get('/api/leadradar/hotel/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test.each(['Goa', 'Jaipur', 'Mumbai', 'Delhi', 'Gurugram'])(
    'POST /api/leadradar/refresh accepts allowed city %s',
    async (city) => {
      const response = await request(app)
        .post('/api/leadradar/refresh')
        .send({ city });

      expect(response.status).not.toBe(400);
      expect(response.status).not.toBe(404);
      expect(response.body?.code).not.toBe('VALIDATION_ERROR');
    },
  );

  test('POST /api/leadradar/refresh rejects invalid city', async () => {
    const response = await request(app)
      .post('/api/leadradar/refresh')
      .send({ city: 'Corbett' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(true);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
