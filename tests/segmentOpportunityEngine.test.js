import { computeSegmentOpportunities } from '../src/services/lead-radar/segmentOpportunityEngine.js';

describe('LeadRADAR segment opportunity engine', () => {
  test('adds multiple segment opportunities when multiple rules match', async () => {
    const [hotel] = await computeSegmentOpportunities([
      {
        hotelId: 'hotel-mumbai',
        hotelName: 'Mumbai Hotel',
        city: 'Mumbai',
        leadScore: 80,
        signals: ['HIGH_REVIEW_VOLUME'],
        context: {
          reviewVolumePercentile: 20,
        },
      },
    ]);

    expect(hotel.segmentOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'CORPORATE',
          opportunity: 'Corporate demand potential',
          action: 'Promote weekday corporate packages',
        }),
        expect.objectContaining({
          segment: 'GROUP',
          opportunity: 'Group booking potential',
          action: 'Promote group stay packages',
        }),
      ]),
    );
  });

  test('adds Jaipur wedding and Goa leisure opportunities by city', async () => {
    const results = await computeSegmentOpportunities([
      {
        hotelId: 'hotel-jaipur',
        hotelName: 'Jaipur Hotel',
        city: 'Jaipur',
        leadScore: 60,
        signals: [],
        context: {
          reviewVolumePercentile: null,
        },
      },
      {
        hotelId: 'hotel-goa',
        hotelName: 'Goa Hotel',
        city: 'Goa',
        leadScore: 55,
        signals: [],
        context: {
          reviewVolumePercentile: null,
        },
      },
    ]);

    expect(results[0].segmentOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'WEDDING',
        }),
      ]),
    );
    expect(results[1].segmentOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'LEISURE',
        }),
      ]),
    );
  });

  test('does not add corporate opportunity for non-Mumbai hotels when review volume percentile is missing', async () => {
    const [hotel] = await computeSegmentOpportunities([
      {
        hotelId: 'hotel-goa-missing-context',
        hotelName: 'Goa Missing Context Hotel',
        city: 'Goa',
        leadScore: 0,
        signals: [],
        context: {
          reviewVolumePercentile: null,
        },
      },
    ]);

    expect(hotel.segmentOpportunities).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'CORPORATE',
        }),
      ]),
    );
    expect(hotel.segmentOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'LEISURE',
        }),
      ]),
    );
  });
});
