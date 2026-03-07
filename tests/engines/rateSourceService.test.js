import { detectOtaChannel, isOtaChannelRow, splitRateRows } from '../../src/services/rateSourceService.js';

describe('rateSourceService', () => {
  test('detects ota channel rows and keeps hotel competitors separate', () => {
    const rows = [
      { competitor_name: 'Taj Hari Mahal Jodhpur', website_url: 'https://www.tajhotels.com' },
      { competitor_name: 'Booking.com', website_url: 'https://www.booking.com/hotel/x' },
      { competitor_name: 'Agoda', website_url: 'https://www.agoda.com/hotel/x' },
    ];

    expect(detectOtaChannel(rows[1].competitor_name, rows[1].website_url)).toEqual(
      expect.objectContaining({ key: 'booking', label: 'Booking.com' }),
    );
    expect(isOtaChannelRow(rows[0])).toBe(false);
    expect(isOtaChannelRow(rows[1])).toBe(true);

    const segmented = splitRateRows(rows);
    expect(segmented.hotelCompetitorRates).toHaveLength(1);
    expect(segmented.otaParityRates).toHaveLength(2);
    expect(segmented.hotelCompetitorRates[0].competitor_name).toBe('Taj Hari Mahal Jodhpur');
  });
});
