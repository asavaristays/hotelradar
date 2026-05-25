import { buildSignalDiagnostics } from '../../src/services/signalDiagnosticsService.js';

function buildReadFile(files) {
  return async (filePath) => {
    if (!(filePath in files)) {
      const error = new Error(`ENOENT: ${filePath}`);
      error.code = 'ENOENT';
      throw error;
    }
    return files[filePath];
  };
}

describe('signalDiagnosticsService', () => {
  test('summarizes Jaipur OTA and event snapshot coverage for a hotel', async () => {
    const hotel = {
      id: 'h1',
      hotel_name: 'Royal Heritage Haveli',
      city: 'Jaipur',
      comp_set_json: ['Alsisar Haveli Jaipur', 'Narain Niwas Palace'],
    };

    const diagnostics = await buildSignalDiagnostics(
      hotel,
      {
        events: [{ id: 'evt-1' }],
        lastScrapedAt: '2026-03-10T10:00:00.000Z',
        lastEventSync: '2026-03-10T09:30:00.000Z',
        otaSnapshotPath: '/tmp/ota.json',
        eventSnapshotPath: '/tmp/events.json',
      },
      {
        readFile: buildReadFile({
          '/tmp/ota.json': JSON.stringify([
            {
              hotel_name: 'Royal Heritage Haveli Jaipur',
              competitor_name: 'Alsisar Haveli',
              date: '2026-03-16',
              rate: 7510,
              source: 'google-hotels',
            },
            {
              hotel_name: 'Royal Heritage Haveli Jaipur',
              competitor_name: 'Booking.com',
              date: '2026-03-16',
              rate: 7562,
              source: 'live-ota',
              website_url: 'https://www.booking.com/hotel/in/royal-heritage-haveli.html',
            },
            {
              hotel_name: 'Royal Heritage Haveli Jaipur',
              is_hotel_rate: true,
              date: '2026-03-16',
              rate: 13750,
              source: 'manual-ota',
            },
            {
              city: 'Jaipur',
              hotel_name: 'Unknown Jaipur Hotel',
              competitor_name: 'Random Comp',
              date: '2026-03-16',
              rate: 6000,
            },
          ]),
          '/tmp/events.json': JSON.stringify([
            { city: 'Jaipur', name: 'Jaipur Wedding Expo', start_date: '2026-03-20', source: 'allevents.in' },
            { city: 'Jaipur', name: 'Heritage Business Summit', start_date: '2026-03-25', source: 'eventbrite.com' },
            { city: 'Mumbai', name: 'Ignore Me', start_date: '2026-03-20', source: 'insider.in' },
          ]),
        }),
      },
    );

    expect(diagnostics.ota).toEqual(
      expect.objectContaining({
        snapshotRows: 4,
        cityCandidateRows: 4,
        matchedHotelRows: 3,
        matchedCompetitorRows: 2,
        matchedChannelRows: 1,
        hotelRateRows: 1,
        skippedUnknownHotel: 1,
      }),
    );
    expect(diagnostics.events).toEqual(
      expect.objectContaining({
        snapshotRows: 3,
        cityRows: 2,
        upcomingRows: 2,
        ingestedRows: 1,
      }),
    );
    expect(diagnostics.events.sourceBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'allevents.in', rows: 1 }),
        expect.objectContaining({ source: 'eventbrite.com', rows: 1 }),
      ]),
    );
  });
});
