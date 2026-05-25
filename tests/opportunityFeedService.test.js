import { jest } from '@jest/globals';
import { getMarketOpportunityFeed } from '../src/services/opportunityFeedService.js';

describe('opportunityFeedService', () => {
  test('formats top ranked opportunities for dashboard feed cards', async () => {
    const listTopRankedOpportunitiesForFeed = jest.fn(async () => [
      {
        hotelId: 'hotel-1',
        city: 'Goa',
        signalType: 'WEEKEND_COMPRESSION',
        score: 15,
        createdAt: '2026-03-14T14:30:00.000Z',
        hotelName: 'Candolim Sands',
        latitude: 15.5351,
        longitude: 73.7642,
      },
    ]);

    const payload = await getMarketOpportunityFeed(
      {
        city: 'Goa',
        signalType: 'WEEKEND_COMPRESSION',
        limitPerCity: 10,
        limit: 50,
      },
      { listTopRankedOpportunitiesForFeed },
    );

    expect(listTopRankedOpportunitiesForFeed).toHaveBeenCalledWith({
      city: 'Goa',
      signalType: 'WEEKEND_COMPRESSION',
      limitPerCity: 10,
      limit: 50,
    });

    expect(payload).toEqual({
      opportunities: [
        {
          hotel_id: 'hotel-1',
          city: 'Goa',
          signal_type: 'WEEKEND_COMPRESSION',
          title: 'Weekend Compression',
          description:
            'Compression pressure is rising in this cluster heading into the weekend. Focus area: Candolim Sands.',
          confidence_score: 97,
          impact_score: 15,
          recommended_action: 'Increase weekend rates by 10-15%',
          created_at: '2026-03-14T14:30:00.000Z',
          coordinates: {
            latitude: 15.5351,
            longitude: 73.7642,
          },
        },
      ],
    });
  });
});
