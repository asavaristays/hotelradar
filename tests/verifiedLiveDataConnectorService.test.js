import { normalizeVerifiedLiveObservation } from '../src/services/verifiedLiveDataConnectorService.js';

describe('verifiedLiveDataConnectorService', () => {
  const context = {
    runId: 'run-1',
    hotelId: 'hotel-1',
    city: 'Goa',
    nowIso: '2026-08-15T04:00:00.000Z',
  };

  test('accepts verified OTA rate evidence with proof and source trust metadata', () => {
    const result = normalizeVerifiedLiveObservation(
      {
        checkinDate: '2026-08-16',
        sourceType: 'ota',
        sourceName: 'Agoda',
        signalType: 'ota_rate',
        valueNumeric: 35400,
        proofUrl: 'https://www.agoda.com/the-ten-goa/rates',
        confidenceScore: 84,
      },
      context,
    );

    expect(result.accepted).toBe(true);
    expect(result.verificationStatus).toBe('verified');
    expect(result.observation).toEqual(
      expect.objectContaining({
        sourceType: 'ota',
        signalType: 'ota_rate',
        valueNumeric: 35400,
        proofUrl: 'https://www.agoda.com/the-ten-goa/rates',
        confidenceScore: 84,
        metadata: expect.objectContaining({
          verificationStatus: 'verified',
          sourceTrustScore: expect.any(Number),
        }),
      }),
    );
  });

  test('keeps unproven rate evidence as needs_proof with capped confidence', () => {
    const result = normalizeVerifiedLiveObservation(
      {
        checkinDate: '2026-08-16',
        sourceType: 'official',
        sourceName: 'The Ten booking engine',
        signalType: 'hotel_rate',
        valueNumeric: 36800,
        confidenceScore: 95,
      },
      context,
    );

    expect(result.accepted).toBe(true);
    expect(result.verificationStatus).toBe('needs_proof');
    expect(result.observation.confidenceScore).toBeLessThanOrEqual(72);
    expect(result.observation.metadata.verificationReasons).toContain('rate_evidence_missing_proof_url');
  });

  test('rejects zero or missing rate values instead of storing fake live data', () => {
    const result = normalizeVerifiedLiveObservation(
      {
        checkinDate: '2026-08-16',
        sourceType: 'competitor',
        sourceName: 'Comparable Resort',
        signalType: 'competitor_rate',
        valueNumeric: 0,
        proofUrl: 'https://example.com/rates',
      },
      context,
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionReasons).toContain('missing_positive_rate');
    expect(result.observation).toBeNull();
  });
});
