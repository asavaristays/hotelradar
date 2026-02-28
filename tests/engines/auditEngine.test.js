import { createResultHash } from '../../src/services/intelligence-engine/auditEngine.js';

describe('auditEngine', () => {
  test('creates deterministic hash for same payload', () => {
    const payload = {
      hotelId: 'h1',
      demandScore: 61.22,
      recommendation: { action: 'increase', base: 8200 },
    };

    const hashA = createResultHash(payload);
    const hashB = createResultHash(payload);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });
});

