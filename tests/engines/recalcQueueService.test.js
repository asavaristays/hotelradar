import { jest } from '@jest/globals';

const mockClaimNextRecalcJob = jest.fn();
const mockCompleteRecalcJob = jest.fn();
const mockEnqueueRecalcJob = jest.fn();
const mockFailRecalcJob = jest.fn();
const mockGetRecalcJobById = jest.fn();
const mockRecalculateDashboard = jest.fn();

jest.unstable_mockModule('../../src/repositories/recalcJobRepository.js', () => ({
  claimNextRecalcJob: mockClaimNextRecalcJob,
  completeRecalcJob: mockCompleteRecalcJob,
  enqueueRecalcJob: mockEnqueueRecalcJob,
  failRecalcJob: mockFailRecalcJob,
  getRecalcJobById: mockGetRecalcJobById,
}));

jest.unstable_mockModule('../../src/services/dashboardService.js', () => ({
  recalculateDashboard: mockRecalculateDashboard,
}));

const {
  enqueueRecalculationJob,
  getRecalculationJobStatus,
  processNextRecalculationJob,
} = await import('../../src/services/recalcQueueService.js');

describe('recalcQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('enqueues recalculation job and returns normalized payload', async () => {
    mockEnqueueRecalcJob.mockResolvedValueOnce({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      hotel_id: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      created_at: '2026-02-27T00:00:00.000Z',
    });

    const result = await enqueueRecalculationJob({
      hotelId: '11111111-1111-4111-8111-111111111111',
      requestedBy: 'u1',
    });

    expect(result).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      hotelId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      createdAt: '2026-02-27T00:00:00.000Z',
    });
  });

  test('returns null when no queued job exists', async () => {
    mockClaimNextRecalcJob.mockResolvedValueOnce(null);
    const result = await processNextRecalculationJob();
    expect(result).toBeNull();
  });

  test('processes a queued job successfully', async () => {
    mockClaimNextRecalcJob.mockResolvedValueOnce({
      id: 'job1',
      hotel_id: '11111111-1111-4111-8111-111111111111',
      attempts: 1,
      max_attempts: 3,
      payload: { source: 'test' },
      source: 'test',
      requested_by: 'u1',
    });
    mockRecalculateDashboard.mockResolvedValueOnce({
      hotelId: '11111111-1111-4111-8111-111111111111',
      demandScore: 63.5,
      demandLevel: 'Moderate',
      suggestedPricing: { base: 8200, riskLevel: 'Medium' },
      lastUpdated: '2026-02-27T00:00:00.000Z',
    });
    mockCompleteRecalcJob.mockResolvedValueOnce({});

    const result = await processNextRecalculationJob();

    expect(mockCompleteRecalcJob).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        jobId: 'job1',
        status: 'completed',
      }),
    );
  });

  test('marks job failed/retry on processing error', async () => {
    mockClaimNextRecalcJob.mockResolvedValueOnce({
      id: 'job2',
      hotel_id: '11111111-1111-4111-8111-111111111111',
      attempts: 1,
      max_attempts: 3,
      payload: {},
      source: 'test',
      requested_by: 'u1',
    });
    mockRecalculateDashboard.mockRejectedValueOnce(new Error('boom'));
    mockFailRecalcJob.mockResolvedValueOnce({ status: 'queued' });

    const result = await processNextRecalculationJob();

    expect(mockFailRecalcJob).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        jobId: 'job2',
        status: 'queued',
      }),
    );
  });

  test('returns normalized job status by id', async () => {
    mockGetRecalcJobById.mockResolvedValueOnce({
      id: 'job3',
      hotel_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
      attempts: 2,
      max_attempts: 3,
      source: 'api',
      error_message: null,
      created_at: '2026-02-27T00:00:00.000Z',
      started_at: '2026-02-27T00:01:00.000Z',
      finished_at: null,
      result_snapshot: {},
    });

    const result = await getRecalculationJobStatus('job3');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'job3',
        hotelId: '11111111-1111-4111-8111-111111111111',
        status: 'processing',
      }),
    );
  });
});
