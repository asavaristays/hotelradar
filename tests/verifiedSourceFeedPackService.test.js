import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { provisionVerifiedSourceFeedPack } from '../src/services/verifiedSourceFeedPackService.js';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hotelradar-feed-pack-'));
}

function buildDeps({ writes = [], sources = [] } = {}) {
  return {
    query: async () => ({
      rows: [{
        id: 'hotel-ten-1',
        hotel_name: 'The Ten Resort Siolim Goa',
        city: 'Goa',
      }],
    }),
    mkdir: fs.mkdir,
    access: fs.access,
    writeFile: async (...args) => {
      writes.push(args[0]);
      return fs.writeFile(...args);
    },
    upsertVerifiedLiveDataSource: async (payload) => {
      sources.push(payload);
      return {
        id: `source-${payload.sourceType}`,
        ...payload,
        source_type: payload.sourceType,
        source_name: payload.sourceName,
        adapter_type: payload.adapterType,
        source_url: payload.sourceUrl,
        enabled: payload.enabled,
        last_status: 'never_checked',
      };
    },
  };
}

describe('verifiedSourceFeedPackService', () => {
  test('creates five safe manifests and registers source contracts', async () => {
    const baseDir = await makeTempDir();
    const writes = [];
    const sources = [];

    const result = await provisionVerifiedSourceFeedPack(
      {
        hotelName: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        slug: 'the-ten',
        baseDir,
      },
      buildDeps({ writes, sources }),
    );

    expect(result.files).toHaveLength(5);
    expect(result.sources).toHaveLength(5);
    expect(writes).toHaveLength(5);
    expect(sources.map((source) => source.sourceType)).toEqual([
      'official',
      'ota',
      'competitor',
      'event',
      'pms',
    ]);
    expect(sources.map((source) => source.adapterType)).toEqual([
      'official_rate_manifest',
      'google_hotels_manifest',
      'json_manifest',
      'json_manifest',
      'pms_manifest',
    ]);

    const officialManifest = JSON.parse(
      await fs.readFile(path.join(baseDir, 'the-ten', 'official-rates.json'), 'utf8'),
    );
    expect(officialManifest.rows).toEqual([]);
    expect(officialManifest.template_rows[0].rate).toBe('<positive_rate_only>');
    expect(officialManifest.notes.join(' ')).toMatch(/Never enter zero/i);
  });

  test('preserves existing manifest rows unless overwrite is explicit', async () => {
    const baseDir = await makeTempDir();
    const targetDir = path.join(baseDir, 'the-ten');
    await fs.mkdir(targetDir, { recursive: true });
    const officialPath = path.join(targetDir, 'official-rates.json');
    await fs.writeFile(
      officialPath,
      JSON.stringify({ rows: [{ rate: 35400, checkin_date: '2026-08-16' }] }),
      'utf8',
    );
    const writes = [];

    await provisionVerifiedSourceFeedPack(
      {
        hotelName: 'The Ten Resort Siolim Goa',
        city: 'Goa',
        slug: 'the-ten',
        baseDir,
      },
      buildDeps({ writes }),
    );

    const preserved = JSON.parse(await fs.readFile(officialPath, 'utf8'));
    expect(preserved.rows[0]).toEqual({ rate: 35400, checkin_date: '2026-08-16' });
    expect(writes).not.toContain(officialPath);
  });
});
