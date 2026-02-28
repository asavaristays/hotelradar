import { requireHotelScope } from '../../src/middleware/authMiddleware.js';

function buildNextCollector() {
  const calls = [];
  function next(error) {
    calls.push(error || null);
  }
  return { next, calls };
}

describe('access control isolation', () => {
  test('allows assigned hotel user and blocks other hotel', () => {
    const middleware = requireHotelScope();
    const allowedReq = {
      params: { id: 'hotel-a' },
      user: { id: 'u1', role: 'hotel_user', hotels: ['hotel-a'] },
    };
    const deniedReq = {
      params: { id: 'hotel-b' },
      user: { id: 'u1', role: 'hotel_user', hotels: ['hotel-a'] },
    };

    const allow = buildNextCollector();
    middleware(allowedReq, {}, allow.next);
    expect(allow.calls[0]).toBeNull();

    const deny = buildNextCollector();
    middleware(deniedReq, {}, deny.next);
    expect(deny.calls[0]).toBeInstanceOf(Error);
    expect(deny.calls[0].message).toContain('hotel access denied');
  });
});

