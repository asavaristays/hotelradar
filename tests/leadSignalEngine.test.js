import { computeLeadSignals, scoreHotelLead } from '../src/services/lead-radar/leadSignalEngine.js';

describe('LeadRADAR signal engine', () => {
  test('hotel with rating 3.5 includes LOW_RATING', async () => {
    const result = await scoreHotelLead({
      hotelId: 'hotel-1',
      hotelName: 'Low Rating Hotel',
      city: 'Goa',
      rating: 3.5,
    });

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals).toContain('LOW_RATING');
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(typeof result.leadScore).toBe('number');
  });

  test('hotel with reviewCount 250 includes HIGH_REVIEW_VOLUME', async () => {
    const result = await scoreHotelLead({
      hotelId: 'hotel-2',
      hotelName: 'High Review Hotel',
      city: 'Mumbai',
      reviewCount: 250,
    });

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals).toContain('HIGH_REVIEW_VOLUME');
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(typeof result.leadScore).toBe('number');
  });

  test('hotel with hasChatbot false includes NO_CHATBOT', async () => {
    const result = await scoreHotelLead({
      hotelId: 'hotel-3',
      hotelName: 'No Chatbot Hotel',
      city: 'Jaipur',
      hasChatbot: false,
    });

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals).toContain('NO_CHATBOT');
    expect(result.opportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunity: 'No chatbot detected',
          action: 'Install AI concierge',
        }),
      ]),
    );
    expect(typeof result.leadScore).toBe('number');
  });

  test('hotel with otaChannels includes OTA_PRESENT', async () => {
    const result = await scoreHotelLead({
      hotelId: 'hotel-4',
      hotelName: 'OTA Hotel',
      city: 'Goa',
      otaChannels: ['booking'],
    });

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals).toContain('OTA_PRESENT');
    expect(result.opportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunity: 'OTA presence active',
          action: 'Optimize direct conversion',
        }),
      ]),
    );
    expect(typeof result.leadScore).toBe('number');
  });

  test('hotel with all signals caps leadScore at 100', async () => {
    const [result] = await computeLeadSignals([
      {
        hotelId: 'hotel-5',
        hotelName: 'All Signals Hotel',
        city: 'Goa',
        rating: 3.2,
        reviewCount: 450,
        hasChatbot: false,
        otaChannels: ['booking'],
      },
    ]);

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining([
        'LOW_RATING',
        'HIGH_REVIEW_VOLUME',
        'NO_CHATBOT',
        'OTA_PRESENT',
      ]),
    );
    expect(typeof result.leadScore).toBe('number');
    expect(result.leadScore).toBe(100);
    expect(result.opportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunity: 'Low rating with high review volume',
          action: 'Improve reviews',
        }),
        expect.objectContaining({
          opportunity: 'No chatbot detected',
          action: 'Install AI concierge',
        }),
        expect.objectContaining({
          opportunity: 'OTA presence active',
          action: 'Optimize direct conversion',
        }),
      ]),
    );
  });

  test('computeLeadSignals adds city-level context metrics', async () => {
    const results = await computeLeadSignals([
      {
        hotelId: 'hotel-a',
        hotelName: 'Alpha',
        city: 'Goa',
        rating: 3.2,
        reviewCount: 450,
        hasChatbot: false,
        otaChannels: ['booking'],
      },
      {
        hotelId: 'hotel-b',
        hotelName: 'Beta',
        city: 'Goa',
        rating: 4.4,
        reviewCount: 120,
        hasChatbot: true,
        otaChannels: [],
      },
      {
        hotelId: 'hotel-c',
        hotelName: 'Gamma',
        city: 'Goa',
        rating: null,
        reviewCount: null,
        hasChatbot: null,
        otaChannels: [],
      },
    ]);

    const alpha = results.find((hotel) => hotel.hotelId === 'hotel-a');
    const beta = results.find((hotel) => hotel.hotelId === 'hotel-b');
    const gamma = results.find((hotel) => hotel.hotelId === 'hotel-c');

    expect(alpha.context).toEqual({
      ratingPercentile: 50,
      reviewVolumePercentile: 100,
      chatbotAdoptionRate: 50,
    });
    expect(beta.context).toEqual({
      ratingPercentile: 100,
      reviewVolumePercentile: 50,
      chatbotAdoptionRate: 50,
    });
    expect(gamma.context).toEqual({
      ratingPercentile: null,
      reviewVolumePercentile: null,
      chatbotAdoptionRate: null,
    });
  });

  test('computeLeadSignals preserves hotel coordinates in scored output', async () => {
    const [result] = await computeLeadSignals([
      {
        hotelId: 'hotel-coord',
        hotelName: 'Coordinate Hotel',
        city: 'Goa',
        latitude: 15.456135,
        longitude: 73.8142114,
        rating: null,
        reviewCount: null,
        hasChatbot: null,
        otaChannels: [],
      },
    ]);

    expect(result.latitude).toBe(15.456135);
    expect(result.longitude).toBe(73.8142114);
  });
});
