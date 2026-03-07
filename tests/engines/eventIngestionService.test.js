import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runEventIngestionCycle } from '../../src/services/ingestion/eventIngestionService.js';

describe('eventIngestionService', () => {
  test('ingests valid Goa/Mumbai event rows and skips invalid rows', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-ingestion-'));
    const snapshotPath = path.join(tmpDir, 'latest.json');
    const upserts = [];

    const rows = [
      {
        name: 'Sunburn Festival 2026',
        city: 'Goa',
        venue: 'Vagator Beach',
        start_date: '2026-12-27',
        end_date: '2026-12-29',
        category: 'music_festival',
        scale: 'large',
        source: 'insider.in',
      },
      {
        name: 'BKC Finance Expo',
        city: 'Mumbai',
        venue: 'NESCO',
        start_date: '2026-04-14',
        end_date: '2026-04-15',
        category: 'conference',
        scale: 'medium',
        source: 'bookmyshow',
      },
      {
        // invalid row (unsupported city + missing date)
        name: 'Unknown Event',
        city: 'Delhi',
      },
    ];

    await fs.writeFile(snapshotPath, JSON.stringify(rows), 'utf8');

    const summary = await runEventIngestionCycle(
      { snapshotPath },
      {
        readFile: fs.readFile,
        upsertCityEvent: async (payload) => {
          upserts.push(payload);
          return payload;
        },
      },
    );

    expect(summary.rowsRead).toBe(3);
    expect(summary.rowsUpserted).toBe(2);
    expect(summary.skippedRows).toBe(1);
    expect(upserts[0].city).toBe('Goa');
    expect(upserts[1].city).toBe('Mumbai');
    expect(upserts[0].impactScore).toBeGreaterThan(0);
  });

  test('marks cycle as missing snapshot when file does not exist', async () => {
    const summary = await runEventIngestionCycle(
      { snapshotPath: '/tmp/event-ingestion/missing-file.json' },
      {
        readFile: fs.readFile,
        upsertCityEvent: async () => null,
      },
    );

    expect(summary.missingSnapshot).toBe(true);
    expect(summary.rowsRead).toBe(0);
    expect(summary.rowsUpserted).toBe(0);
  });
});
