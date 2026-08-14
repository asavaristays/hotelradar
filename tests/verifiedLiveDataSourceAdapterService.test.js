import { collectVerifiedLiveDataSourceRows } from '../src/services/verifiedLiveDataSourceAdapterService.js';

describe('verifiedLiveDataSourceAdapterService', () => {
  test('loads a proof manifest and applies connector source defaults', async () => {
    const { rows, sourceResults } = await collectVerifiedLiveDataSourceRows(
      {
        nowIso: '2026-08-15T04:00:00.000Z',
        sources: [
          {
            id: 'source-1',
            hotel_id: 'hotel-1',
            hotel_name: 'The Ten Resort Siolim Goa',
            city: 'Goa',
            source_type: 'official',
            source_name: 'The Ten booking engine',
            adapter_type: 'official_rate_manifest',
            source_url: '/tmp/the-ten-official-rates.json',
            freshness_minutes: 240,
            proof_required: true,
          },
        ],
      },
      {
        readFile: async () => JSON.stringify({
          rows: [
            {
              checkin_date: '2026-08-16',
              rate: 36800,
              proof_url: 'https://letsbook.me/booking/994038?checkin=2026-08-16',
            },
          ],
        }),
        fetchImpl: async () => {
          throw new Error('fetch should not be called');
        },
      },
    );

    expect(sourceResults).toEqual([
      expect.objectContaining({ sourceId: 'source-1', status: 'ok', rows: 1 }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        hotel_id: 'hotel-1',
        hotel_name: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        source_type: 'official',
        source_name: 'The Ten booking engine',
        signal_type: 'hotel_rate',
        proof_url: 'https://letsbook.me/booking/994038?checkin=2026-08-16',
        connector_name: 'official_rate_manifest',
        metadata: expect.objectContaining({
          connectorSourceId: 'source-1',
          proofRequired: true,
        }),
      }),
    ]);
  });

  test('blocks private HTTP source URLs by default', async () => {
    const { rows, sourceResults } = await collectVerifiedLiveDataSourceRows(
      {
        sources: [
          {
            id: 'source-private',
            source_type: 'ota',
            source_name: 'Private source',
            adapter_type: 'ota_rate_manifest',
            source_url: 'http://127.0.0.1:9999/rates.json',
          },
        ],
      },
      {
        readFile: async () => '',
        fetchImpl: async () => ({ ok: true, text: async () => '[]' }),
      },
    );

    expect(rows).toEqual([]);
    expect(sourceResults).toEqual([
      expect.objectContaining({
        sourceId: 'source-private',
        status: 'failed',
        error: expect.stringMatching(/private|local/i),
      }),
    ]);
  });
});
