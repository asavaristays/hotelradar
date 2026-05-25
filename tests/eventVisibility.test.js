import { isPhysicalEventRecord } from '../src/utils/eventVisibility.js';

describe('eventVisibility', () => {
  test('keeps physical venue events visible', () => {
    expect(
      isPhysicalEventRecord({
        event_name: 'Goa Food Festival',
        venue: 'Baga Grounds',
        category: 'festival',
      }),
    ).toBe(true);
  });

  test('filters online and virtual events from signal inputs', () => {
    expect(
      isPhysicalEventRecord({
        event_name: 'Revenue Growth Webinar',
        venue: 'Online',
        category: 'conference',
      }),
    ).toBe(false);

    expect(
      isPhysicalEventRecord({
        event_name: 'Virtual Hospitality Summit',
        venue: 'Zoom',
        category: 'conference',
      }),
    ).toBe(false);
  });
});
