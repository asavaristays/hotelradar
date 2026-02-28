import {
  preventReplayTriggers,
  rateLimitRecalculate,
  validateApiKey,
  validateUserRole,
} from '../../src/services/intelligence-engine/securityEngine.js';
import { env } from '../../src/config/env.js';

describe('securityEngine', () => {
  test('blocks replay token reuse', () => {
    const req = {
      headers: { 'x-request-id': 'abc-123' },
      body: {},
    };
    expect(preventReplayTriggers(req)).toBe(true);
    expect(() => preventReplayTriggers(req)).toThrow('Replay detected');
  });

  test('rate limits recalculate bursts', () => {
    const payload = {
      hotelId: 'h1',
      userId: 'u1',
      windowMs: 60000,
      maxRecalculatePerWindow: 2,
    };
    expect(rateLimitRecalculate(payload)).toBe(true);
    expect(rateLimitRecalculate(payload)).toBe(true);
    expect(() => rateLimitRecalculate(payload)).toThrow('Too many recalculations');
  });

  test('rejects unsupported role access', () => {
    expect(() => validateUserRole({ id: 'u2', role: 'hotel_user' }, ['admin'])).toThrow('Forbidden');
  });

  test('rejects invalid API key when enabled', () => {
    const oldValue = env.requireApiKey;
    env.requireApiKey = true;
    expect(() => validateApiKey({ headers: {}, path: '/hotel/x/recalculate' })).toThrow('Unauthorized');
    env.requireApiKey = oldValue;
  });
});
