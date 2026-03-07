import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/pool.js', () => ({
  pool: {
    query: mockQuery,
  },
}));

const { getLatestMarketCheckinDate } = await import('../../src/repositories/marketRepository.js');

describe('marketRepository.getLatestMarketCheckinDate', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('uses a query that excludes ota channels and prefers dates with hotel + competitor rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          checkin_date: '2026-03-16',
          observed_at: '2026-03-07T01:00:00.000Z',
          hotel_rows: 1,
          competitor_rows: 3,
        },
      ],
    });

    const result = await getLatestMarketCheckinDate('hotel-1');

    expect(result).toEqual({
      checkin_date: '2026-03-16',
      observed_at: '2026-03-07T01:00:00.000Z',
      hotel_rows: 1,
      competitor_rows: 3,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['hotel-1']);
    expect(sql).toContain('COUNT(DISTINCT cr.competitor_id) AS competitor_rows');
    expect(sql).toContain('booking|agoda|makemytrip');
    expect(sql).toContain('CASE WHEN hotel_rows > 0 AND competitor_rows > 0 THEN 1 ELSE 0 END DESC');
    expect(sql).toContain('competitor_rows DESC');
    expect(sql).toContain('hotel_rows DESC');
  });
});
