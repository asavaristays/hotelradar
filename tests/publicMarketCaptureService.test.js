import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runPublicMarketCapture, __test__ } from '../src/services/publicMarketCaptureService.js';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hotelradar-public-market-'));
}

async function seedManifest(baseDir, slug, fileName) {
  const target = path.join(baseDir, slug, fileName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify({ rows: [] }, null, 2), 'utf8');
  return target;
}

function mockFetch() {
  return async (url) => {
    const rawUrl = String(url);
    if (rawUrl.includes('date.nager.at')) {
      const payload = [
        {
          date: '2026-08-15',
          localName: 'Independence Day',
          name: 'Independence Day',
          countryCode: 'IN',
        },
      ];
      return {
        ok: true,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    }
    if (rawUrl.includes('api.open-meteo.com')) {
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: ['2026-08-15', '2026-08-16'],
            precipitation_sum: [6, 0],
            wind_speed_10m_max: [28, 12],
            temperature_2m_max: [31, 30],
            weather_code: [61, 1],
          },
        }),
      };
    }
    throw new Error(`Unexpected URL ${rawUrl}`);
  };
}

describe('publicMarketCaptureService', () => {
  test('feeds public holiday and weather signals without PMS credentials', async () => {
    const baseDir = await makeTempDir();
    const slug = 'the-ten';
    await Promise.all([
      seedManifest(baseDir, slug, 'official-rates.json'),
      seedManifest(baseDir, slug, 'ota-rates.json'),
      seedManifest(baseDir, slug, 'competitor-rates.json'),
      seedManifest(baseDir, slug, 'demand-signals.json'),
    ]);

    const result = await runPublicMarketCapture(
      {
        hotelId: 'hotel-1',
        hotelName: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        slug,
        baseDir,
        startDate: '2026-08-15',
        horizonDays: 2,
        includeHolidays: true,
        includeWeather: true,
      },
      {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
        access: fs.access,
        fetchImpl: mockFetch(),
      },
    );

    expect(result.generatedRows).toBeGreaterThanOrEqual(3);
    expect(result.files.find((entry) => entry.filePath.endsWith('pms-pickup.json'))).toBeUndefined();
    const demand = JSON.parse(await fs.readFile(path.join(baseDir, slug, 'demand-signals.json'), 'utf8'));
    expect(demand.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'event',
          source_name: 'Nager.Date public holiday API',
          checkin_date: '2026-08-15',
          value_text: expect.stringMatching(/Independence Day/i),
        }),
        expect.objectContaining({
          source_type: 'weather',
          source_name: 'Open-Meteo forecast API',
          checkin_date: '2026-08-15',
        }),
      ]),
    );
  });

  test('merges verified tariff snapshot rows and rejects zero or unproofed rates', async () => {
    const baseDir = await makeTempDir();
    const slug = 'the-ten';
    await Promise.all([
      seedManifest(baseDir, slug, 'official-rates.json'),
      seedManifest(baseDir, slug, 'ota-rates.json'),
      seedManifest(baseDir, slug, 'competitor-rates.json'),
      seedManifest(baseDir, slug, 'demand-signals.json'),
    ]);
    const snapshotFile = path.join(baseDir, 'tariff-snapshot.json');
    await fs.writeFile(
      snapshotFile,
      JSON.stringify({
        rows: [
          {
            source_type: 'official',
            source_name: 'The Ten official booking engine',
            checkin_date: '2026-08-16',
            rate: 35400,
            proof_url: 'https://letsbook.me/booking/994038?checkin=2026-08-16',
          },
          {
            source_type: 'ota',
            source_name: 'Agoda',
            checkin_date: '2026-08-16',
            rate: 0,
            proof_url: 'https://www.google.com/travel/hotels/example',
          },
          {
            source_type: 'competitor',
            source_name: 'Nearby competitor',
            checkin_date: '2026-08-16',
            rate: 25000,
          },
        ],
      }),
      'utf8',
    );

    const result = await runPublicMarketCapture(
      {
        hotelId: 'hotel-1',
        hotelName: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        slug,
        baseDir,
        startDate: '2026-08-16',
        horizonDays: 1,
        tariffSnapshotFile: snapshotFile,
        includeHolidays: false,
        includeWeather: false,
      },
      {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
        access: fs.access,
        fetchImpl: mockFetch(),
      },
    );

    expect(result.generatedRows).toBe(1);
    expect(result.rejectedRows).toHaveLength(2);
    expect(result.rejectedRows.map((entry) => entry.reason).join(' ')).toMatch(/missing_positive_rate/);
    expect(result.rejectedRows.map((entry) => entry.reason).join(' ')).toMatch(/missing_proof_url/);
    const official = JSON.parse(await fs.readFile(path.join(baseDir, slug, 'official-rates.json'), 'utf8'));
    expect(official.rows).toEqual([
      expect.objectContaining({
        source_type: 'official',
        signal_type: 'hotel_rate',
        rate: 35400,
      }),
    ]);
  });

  test('feeds airline and event demand snapshots into demand signals', async () => {
    const baseDir = await makeTempDir();
    const slug = 'the-ten';
    await Promise.all([
      seedManifest(baseDir, slug, 'official-rates.json'),
      seedManifest(baseDir, slug, 'ota-rates.json'),
      seedManifest(baseDir, slug, 'competitor-rates.json'),
      seedManifest(baseDir, slug, 'demand-signals.json'),
    ]);
    const demandSnapshotFile = path.join(baseDir, 'demand-snapshot.json');
    await fs.writeFile(
      demandSnapshotFile,
      JSON.stringify({
        rows: [
          {
            source_type: 'airfare',
            source_name: 'Airport arrivals / flight pressure provider',
            signal_type: 'airfare_trend',
            checkin_date: '2026-08-16',
            value_numeric: 74,
            value_text: 'Inbound travel pressure is elevated for Goa weekend arrivals.',
            proof_url: 'https://provider.example/flights/goi/2026-08-16',
          },
          {
            source_type: 'event',
            source_name: 'Venue / wedding market watch',
            checkin_date: '2026-08-16',
            value_numeric: 78,
            value_text: 'Wedding and private event pressure reported for North Goa.',
            proof_url: 'https://source.example/goa-events',
            metadata: { category: 'wedding' },
          },
        ],
      }),
      'utf8',
    );

    const result = await runPublicMarketCapture(
      {
        hotelId: 'hotel-1',
        hotelName: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        slug,
        baseDir,
        startDate: '2026-08-16',
        horizonDays: 1,
        demandSnapshotFile,
        includeHolidays: false,
        includeWeather: false,
      },
      {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
        access: fs.access,
        fetchImpl: mockFetch(),
      },
    );

    expect(result.generatedRows).toBe(2);
    const demand = JSON.parse(await fs.readFile(path.join(baseDir, slug, 'demand-signals.json'), 'utf8'));
    expect(demand.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'airfare',
          signal_type: 'airfare_trend',
          value_numeric: 74,
        }),
        expect.objectContaining({
          source_type: 'event',
          signal_type: 'event_signal',
          metadata: expect.objectContaining({ category: 'wedding' }),
        }),
      ]),
    );
  });

  test('normalizes tariff snapshots without converting missing rates to zero', () => {
    const result = __test__.normalizeTariffSnapshotRows({
      rows: [
        {
          source_type: 'official',
          source_name: 'Direct',
          checkin_date: '2026-08-16',
          rate: '',
          proof_url: 'https://example.com',
        },
      ],
    });

    expect(result.rows).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/missing_positive_rate/);
  });
});
