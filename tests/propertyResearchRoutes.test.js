import request from 'supertest';
import { app } from '../src/app.js';

describe('property research route validation', () => {
  test('rejects unsupported markets', async () => {
    const response = await request(app)
      .post('/api/leadradar/research')
      .send({
        hotelName: 'Example Hotel',
        city: 'Bengaluru',
        sources: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid source types before network or database work', async () => {
    const response = await request(app)
      .post('/api/leadradar/research')
      .send({
        hotelName: 'Example Hotel',
        city: 'Goa',
        sources: [{ sourceType: 'social', url: 'https://example.com' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid research job ids', async () => {
    const response = await request(app).get('/api/leadradar/research/not-a-uuid');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('rejects excessive history limits', async () => {
    const response = await request(app)
      .get('/api/leadradar/research')
      .query({ limit: 101 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
