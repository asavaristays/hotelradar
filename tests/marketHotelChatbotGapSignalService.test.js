import { jest } from '@jest/globals';
import {
  CHATBOT_GAP,
  buildChatbotGapSignals,
  runMarketHotelChatbotGapSignalEngine,
} from '../src/services/lead-radar/marketHotelChatbotGapSignalService.js';
import { HIGH_REVIEW_ACTIVITY } from '../src/services/lead-radar/marketHotelReviewSignalService.js';

describe('marketHotelChatbotGapSignalService', () => {
  test('buildChatbotGapSignals flags hotels without chatbot that already have HIGH_REVIEW_ACTIVITY', () => {
    const hotels = [
      { id: 'a', hotelName: 'Alpha', city: 'Goa', reviewCount: 500, hasChatbot: false },
      { id: 'b', hotelName: 'Beta', city: 'Goa', reviewCount: 300, hasChatbot: null },
      { id: 'c', hotelName: 'Gamma', city: 'Goa', reviewCount: 200, hasChatbot: true },
    ];
    const existingSignals = [
      { hotelId: 'a', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.5 },
      { hotelId: 'c', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
    ];

    const result = buildChatbotGapSignals(hotels, existingSignals);

    expect(result.hotelsScanned).toBe(3);
    expect(result.signals).toEqual([
      {
        hotelId: 'a',
        signalType: CHATBOT_GAP,
        signalStrength: 500,
      },
    ]);
  });

  test('runMarketHotelChatbotGapSignalEngine replaces only CHATBOT_GAP rows', async () => {
    const replaceMarketHotelSignals = jest.fn(async (_hotelIds, rows) => ({
      deletedRowCount: 3,
      rowCount: rows.length,
    }));

    const summary = await runMarketHotelChatbotGapSignalEngine(
      { city: 'Jaipur', batchSize: 20 },
      {
        listMarketHotelsForSignals: async () => [
          { id: '1', hotelName: 'One', city: 'Jaipur', reviewCount: 220, hasChatbot: null },
          { id: '2', hotelName: 'Two', city: 'Jaipur', reviewCount: 80, hasChatbot: false },
          { id: '3', hotelName: 'Three', city: 'Jaipur', reviewCount: 140, hasChatbot: true },
        ],
        listMarketHotelSignals: async () => [
          { hotelId: '1', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.2 },
          { hotelId: '3', signalType: HIGH_REVIEW_ACTIVITY, signalStrength: 2.1 },
        ],
        replaceMarketHotelSignals,
      },
    );

    expect(replaceMarketHotelSignals).toHaveBeenCalledWith(
      ['1', '2', '3'],
      [
        {
          hotelId: '1',
          signalType: CHATBOT_GAP,
          signalStrength: 220,
        },
      ],
      { batchSize: 20, signalTypes: [CHATBOT_GAP] },
    );
    expect(summary.hotelsScanned).toBe(3);
    expect(summary.signalsCreated).toBe(1);
    expect(summary.deletedSignals).toBe(3);
  });
});
