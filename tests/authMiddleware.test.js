import { jest } from '@jest/globals';

const getSessionUser = jest.fn();
const validateUserRole = jest.fn();

jest.unstable_mockModule('../src/services/authService.js', () => ({
  getSessionUser,
}));

jest.unstable_mockModule('../src/services/intelligence-engine/securityEngine.js', () => ({
  validateUserRole,
}));

const { requireAuth } = await import('../src/middleware/authMiddleware.js');

describe('authMiddleware', () => {
  const originalEnforceAuth = process.env.ENFORCE_AUTH_TEST;

  beforeAll(() => {
    process.env.ENFORCE_AUTH_TEST = 'true';
  });

  afterAll(() => {
    process.env.ENFORCE_AUTH_TEST = originalEnforceAuth;
  });

  beforeEach(() => {
    getSessionUser.mockReset();
    validateUserRole.mockReset();
  });

  test('bypasses auth for localhost requests and attaches a synthetic user', async () => {
    const req = {
      ip: '127.0.0.1',
      hostname: 'localhost',
      headers: {},
    };
    const next = jest.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({
      role: 'super_admin',
      hotels: [],
    });
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  test('validates bearer token when provided on non-local requests', async () => {
    const req = {
      ip: '10.0.0.5',
      hostname: 'hotelradar.in',
      headers: {
        authorization: 'Bearer token-123',
      },
    };
    const next = jest.fn();
    getSessionUser.mockResolvedValue({
      id: 'user-1',
      role: 'admin',
      hotels: [],
      beta_accepted_at: '2026-03-15T00:00:00.000Z',
    });

    await requireAuth(req, {}, next);

    expect(getSessionUser).toHaveBeenCalledWith('token-123');
    expect(next).toHaveBeenCalledWith();
    expect(req.user.id).toBe('user-1');
  });
});
