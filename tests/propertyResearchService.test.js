import { jest } from '@jest/globals';
import {
  assertSafeResearchUrl,
  inspectPropertySource,
  scorePropertyNameMatch,
  summarizePropertyResearch,
} from '../src/services/propertyResearchService.js';

describe('property research service', () => {
  test('matches meaningful property-name tokens', () => {
    expect(
      scorePropertyNameMatch(
        'The Westin Goa',
        'The Westin Goa | Luxury resort in Anjuna',
      ),
    ).toBe(1);
    expect(scorePropertyNameMatch('The Westin Goa', 'Generic hotel search results')).toBe(0);
  });

  test('blocks loopback and private targets', async () => {
    await expect(assertSafeResearchUrl('http://127.0.0.1:3000')).rejects.toThrow(
      'Local and private',
    );
    await expect(assertSafeResearchUrl('http://localhost/admin')).rejects.toThrow(
      'Local and private',
    );
    await expect(
      assertSafeResearchUrl('https://hotel.example', async () => [
        { address: '192.168.1.50', family: 4 },
      ]),
    ).rejects.toThrow('Local and private');
  });

  test('extracts matched website evidence without creating a pricing observation', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      url: 'https://hotel.example/',
      headers: {
        get: (name) => (name === 'content-type' ? 'text/html; charset=utf-8' : null),
      },
      text: async () => `
        <html>
          <head><title>The Westin Goa | Official Site</title></head>
          <body>
            <p>Rated 4.6 out of 5 from 1,245 reviews.</p>
            <a href="/rooms">Rooms</a>
            <a href="https://booking.example/reserve">Book now</a>
          </body>
        </html>
      `,
    }));

    const result = await inspectPropertySource(
      { sourceType: 'website', url: 'https://hotel.example/' },
      {
        hotelName: 'The Westin Goa',
        fetchImpl,
        lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      },
    );

    expect(result.reachable).toBe(true);
    expect(result.matchedHotelName).toBe(true);
    expect(result.ratingValue).toBe(4.6);
    expect(result.reviewCount).toBe(1245);
    expect(result.bookingEngineUrl).toContain('booking.example');
    expect(result).not.toHaveProperty('rate');
    expect(result).not.toHaveProperty('suggestedPrice');
  });

  test('revalidates redirect targets before fetching them', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 302,
      url: 'https://hotel.example/',
      headers: {
        get: (name) => (name === 'location' ? 'http://127.0.0.1/admin' : null),
      },
      text: async () => '',
    }));

    const result = await inspectPropertySource(
      { sourceType: 'website', url: 'https://hotel.example/' },
      {
        hotelName: 'Example Hotel',
        fetchImpl,
        lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.reachable).toBe(false);
    expect(result.normalizedValue).toBe('source_unavailable');
  });

  test('requires manual review when matching evidence is absent', () => {
    const result = summarizePropertyResearch(
      [
        {
          sourceType: 'website',
          reachable: false,
          blocked: false,
          matchedHotelName: false,
        },
      ],
      [{ hotelName: 'Candidate One' }, { hotelName: 'Candidate Two' }],
    );

    expect(result.status).toBe('review_required');
    expect(result.confidenceLabel).toBe('low');
    expect(result.summary).toMatch(/manual review/i);
  });
});
