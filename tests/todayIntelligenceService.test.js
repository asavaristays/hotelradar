import { jest } from '@jest/globals';

const getHotelById = jest.fn();
const getLatestRankedOpportunityScanByCity = jest.fn();
const getTopRankedOpportunitiesByCity = jest.fn();

jest.unstable_mockModule('../src/repositories/hotelRepository.js', () => ({
  getHotelById,
}));

jest.unstable_mockModule('../src/repositories/marketHotelRepository.js', () => ({
  getLatestRankedOpportunityScanByCity,
  getTopRankedOpportunitiesByCity,
}));

const { getTodayMarketIntelligenceForUser } = await import('../src/services/todayIntelligenceService.js');

describe('todayIntelligenceService', () => {
  test('returns top 5 ranked opportunities for the authenticated hotel city', async () => {
    getHotelById.mockResolvedValueOnce({
      id: 'hotel-1',
      city: 'Goa',
    });
    getLatestRankedOpportunityScanByCity.mockResolvedValueOnce('2026-03-14T09:00:00.000Z');
    getTopRankedOpportunitiesByCity.mockResolvedValueOnce([
      {
        signalType: 'WEEKEND_COMPRESSION',
        score: 15,
        createdAt: '2026-03-14T09:00:00.000Z',
        hotelName: 'Candolim Cluster Hotel',
      },
    ]);

    const result = await getTodayMarketIntelligenceForUser({
      id: 'user-1',
      role: 'hotel_user',
      hotels: ['hotel-1'],
    });

    expect(getHotelById).toHaveBeenCalledWith('hotel-1');
    expect(getLatestRankedOpportunityScanByCity).toHaveBeenCalledWith('Goa');
    expect(getTopRankedOpportunitiesByCity).toHaveBeenCalledWith('Goa', { limit: 5 });
    expect(result).toEqual({
      lastMarketScan: '2026-03-14T09:00:00.000Z',
      city: 'Goa',
      opportunities: [
        {
          signalType: 'WEEKEND_COMPRESSION',
          location: 'Candolim Cluster Hotel',
          summary: 'Weekend compression detected near Candolim Cluster Hotel',
          recommendedAction: 'Increase weekend rates by 10-15%',
        },
      ],
    });
  });

  test('throws when authenticated user has no hotel context', async () => {
    await expect(
      getTodayMarketIntelligenceForUser({
        id: 'user-1',
        role: 'admin',
        hotels: [],
      }),
    ).rejects.toMatchObject({
      message: 'Hotel context is required for market intelligence.',
      status: 400,
    });
  });

  test('reuses cached city response for 30 seconds', async () => {
    getHotelById.mockResolvedValue({
      id: 'hotel-1',
      city: 'Goa',
    });
    getLatestRankedOpportunityScanByCity.mockResolvedValue('2026-03-14T09:00:00.000Z');
    getTopRankedOpportunitiesByCity.mockResolvedValue([
      {
        signalType: 'TOURISM_SPIKE',
        score: 8,
        createdAt: '2026-03-14T09:00:00.000Z',
        hotelName: 'Baga Cluster',
      },
    ]);

    const user = {
      id: 'user-1',
      role: 'hotel_user',
      hotels: ['hotel-1'],
    };

    const first = await getTodayMarketIntelligenceForUser(user);
    const second = await getTodayMarketIntelligenceForUser(user);

    expect(first).toEqual(second);
    expect(getLatestRankedOpportunityScanByCity).toHaveBeenCalledTimes(1);
    expect(getTopRankedOpportunitiesByCity).toHaveBeenCalledTimes(1);
  });
});
