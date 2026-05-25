import { isVisibleHotelRecord } from '../src/utils/hotelVisibility.js';

describe('hotelVisibility', () => {
  test('keeps normal hotel records visible', () => {
    expect(
      isVisibleHotelRecord({
        hotel_name: 'The Oberoi Mumbai',
      }),
    ).toBe(true);
  });

  test('blocks invalid business hotel placeholder records', () => {
    expect(
      isVisibleHotelRecord({
        hotel_name: 'BKC Business Hotel',
      }),
    ).toBe(false);

    expect(
      isVisibleHotelRecord({
        hotelName: 'BKS Business Hotel',
      }),
    ).toBe(false);
  });
});
