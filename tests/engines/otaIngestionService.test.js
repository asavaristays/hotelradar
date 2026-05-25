import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runOtaIngestionCycle } from '../../src/services/ingestion/otaIngestionService.js';

function buildDeps(overrides = {}) {
  const competitors = new Map();
  const competitorRates = [];
  const hotelRates = [];

  const deps = {
    listActiveHotelsForIngestion: async () => [
      {
        id: 'hotel-1',
        hotel_name: 'Royal Heritage Haveli',
        city: 'Jaipur',
        comp_set_json: ['Alsisar Haveli Jaipur', 'Narain Niwas Palace'],
      },
    ],
    getCompetitorByHotelAndName: async (_hotelId, name) => competitors.get(String(name).toLowerCase()) || null,
    insertCompetitor: async ({ competitorName }) => {
      const row = {
        id: `comp-${competitors.size + 1}`,
        competitor_name: competitorName,
      };
      competitors.set(String(competitorName).toLowerCase(), row);
      return row;
    },
    getLatestCompetitorPrice: async () => 7000,
    insertCompetitorRateSnapshot: async (payload) => {
      competitorRates.push(payload);
      return payload;
    },
    insertHotelRateSnapshot: async (payload) => {
      hotelRates.push(payload);
      return payload;
    },
    readFile: fs.readFile,
    ...overrides,
  };

  return { deps, competitors, competitorRates, hotelRates };
}

describe('otaIngestionService', () => {
  test('ingests competitor + hotel rate rows from OTA snapshot JSON', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ota-ingestion-'));
    const snapshotPath = path.join(tmpDir, 'latest.json');

    const rows = [
      {
        hotel_name: 'Royal Heritage Haveli',
        competitor_name: 'Alsisar Haveli Jaipur',
        checkin_date: '2026-04-16',
        room_category: 'Deluxe',
        list_of_rates: [{ rate: 7508, tax_included: false, rate_type: 'BAR', source: 'google-hotels' }],
        cancellation_type: 'free_cancellation',
        source: 'google-hotels',
      },
      {
        hotel_name: 'Royal Heritage Haveli',
        is_hotel_rate: true,
        checkin_date: '2026-04-16',
        hotel_rate: 6999,
        source: 'pms',
      },
    ];

    await fs.writeFile(snapshotPath, JSON.stringify(rows), 'utf8');

    const { deps, competitorRates, hotelRates } = buildDeps();
    const summary = await runOtaIngestionCycle({ snapshotPath }, deps);

    expect(summary.rowsRead).toBe(2);
    expect(summary.competitorRowsIngested).toBe(1);
    expect(summary.hotelRateRowsIngested).toBe(1);
    expect(competitorRates).toHaveLength(1);
    expect(hotelRates).toHaveLength(1);
    expect(competitorRates[0].priceToday).toBe(7508);
    expect(competitorRates[0].price48hAgo).toBe(7000);
    expect(hotelRates[0].price).toBe(6999);
  });

  test('marks cycle as missing snapshot when file does not exist', async () => {
    const { deps } = buildDeps();
    const summary = await runOtaIngestionCycle(
      { snapshotPath: '/tmp/ota-ingestion/missing-file.json' },
      deps,
    );
    expect(summary.missingSnapshot).toBe(true);
    expect(summary.rowsRead).toBe(0);
    expect(summary.competitorRowsIngested).toBe(0);
  });

  test('maps Jaipur hotel rows when snapshot hotel name includes city suffix', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ota-ingestion-'));
    const snapshotPath = path.join(tmpDir, 'latest.json');

    await fs.writeFile(
      snapshotPath,
      JSON.stringify([
        {
          hotel_name: 'Royal Heritage Haveli Jaipur',
          competitor_name: 'Shahpura House Jaipur',
          checkin_date: '2026-04-17',
          rate: 7280,
          source: 'google-hotels',
        },
      ]),
      'utf8',
    );

    const { deps, competitorRates } = buildDeps();
    const summary = await runOtaIngestionCycle({ snapshotPath }, deps);

    expect(summary.competitorRowsIngested).toBe(1);
    expect(summary.skippedUnknownHotel).toBe(0);
    expect(competitorRates[0].hotelId).toBe('hotel-1');
  });

  test('reuses existing Jaipur competitor when snapshot omits city suffix', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ota-ingestion-'));
    const snapshotPath = path.join(tmpDir, 'latest.json');

    await fs.writeFile(
      snapshotPath,
      JSON.stringify([
        {
          hotel_name: 'Royal Heritage Haveli Jaipur',
          competitor_name: 'Alsisar Haveli',
          checkin_date: '2026-04-18',
          rate: 7510,
          source: 'google-hotels',
        },
      ]),
      'utf8',
    );

    const { deps, competitors, competitorRates } = buildDeps();
    const summary = await runOtaIngestionCycle({ snapshotPath }, deps);

    expect(summary.competitorRowsIngested).toBe(1);
    expect(competitors.size).toBe(2);
    expect(competitorRates[0].competitorId).toBe('comp-1');
  });
});
