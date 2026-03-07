import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  classifyCategory,
  extractJsonLdBlocks,
  generateGoaWeddingSignals,
  parseSourceSpec,
  runEventCollectionCycle,
} from '../../src/services/ingestion/eventCollectionService.js';

function makeJsonLdHtml(payload) {
  return `<html><head><script type="application/ld+json">${JSON.stringify(payload)}</script></head><body></body></html>`;
}

describe('eventCollectionService', () => {
  test('extracts json-ld blocks and classifies corporate/wedding categories', () => {
    const html = makeJsonLdHtml({
      '@type': 'Event',
      name: 'BKC Leadership Conference 2026',
      startDate: '2026-04-18',
      endDate: '2026-04-19',
      location: { name: 'BKC Hub' },
    });

    const blocks = extractJsonLdBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(classifyCategory({ name: 'Destination Wedding Showcase', description: '' })).toBe('wedding_season');
    expect(classifyCategory({ name: 'Corporate Finance Summit', description: '' })).toBe('conference');
  });

  test('collects events, adds wedding signals and linkedin hints, then writes snapshot', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-collector-'));
    const outputPath = path.join(tmpDir, 'latest.json');
    const linkedinHintsFile = path.join(tmpDir, 'linkedin_hints.json');

    await fs.writeFile(
      linkedinHintsFile,
      JSON.stringify([
        {
          name: 'Mumbai Corporate Roundtable',
          city: 'Mumbai',
          start_date: '2026-04-10',
          end_date: '2026-04-10',
          category: 'conference',
          scale: 'medium',
          confidence: 'tentative',
        },
      ]),
      'utf8',
    );

    const sourcePayload = {
      '@type': 'Event',
      name: 'Goa Music Festival',
      startDate: '2026-04-12',
      endDate: '2026-04-12',
      description: 'Live concert weekend',
      location: {
        name: 'Vagator Beach',
      },
      url: 'https://insider.in/event/goa-music-festival',
    };

    const summary = await runEventCollectionCycle(
      {
        outputPath,
        linkedinHintsFile,
        sources: [
          {
            city: 'Goa',
            source: 'insider.in',
            url: 'https://insider.in/goa/all-events',
          },
        ],
        includeWeddingSignals: true,
        horizonDays: 10,
      },
      {
        fetchImpl: async () => ({ ok: true, status: 200, text: async () => makeJsonLdHtml(sourcePayload) }),
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      },
    );

    expect(summary.sourceSuccess).toBe(1);
    expect(summary.rowsWritten).toBeGreaterThanOrEqual(2);
    expect(summary.weddingSignalsAdded).toBeGreaterThanOrEqual(0);
    expect(summary.linkedinHintsAdded).toBe(1);

    const output = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    const categories = output.map((row) => row.category);
    expect(categories).toContain('music_festival');
    expect(output.some((row) => row.source === 'linkedin-hints')).toBe(true);
  });

  test('uses html fallback parsing for linkedin-like pages without json-ld', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-collector-linkedin-'));
    const outputPath = path.join(tmpDir, 'latest.json');
    const html = `<html><head><title>Mumbai Corporate Planning Meetup | LinkedIn</title></head><body><p>Event date 2026-04-21</p></body></html>`;

    const summary = await runEventCollectionCycle(
      {
        outputPath,
        includeWeddingSignals: false,
        sources: [
          {
            city: 'Mumbai',
            source: 'linkedin-public',
            url: 'https://www.linkedin.com/events/sample',
          },
        ],
      },
      {
        fetchImpl: async () => ({ ok: true, status: 200, text: async () => html }),
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      },
    );

    expect(summary.rowsWritten).toBe(1);
    const output = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(output[0].city).toBe('Mumbai');
    expect(output[0].category).toBe('conference');
    expect(output[0].confidence).toBe('tentative');
  });

  test('parses source spec in City|source|url format', () => {
    expect(parseSourceSpec('Goa|insider.in|https://insider.in/goa/all-events')).toEqual({
      city: 'Goa',
      source: 'insider.in',
      url: 'https://insider.in/goa/all-events',
    });
  });

  test('generates Goa wedding signals for wedding season weekends', () => {
    const rows = generateGoaWeddingSignals(21, new Date('2026-11-01T00:00:00Z'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.city === 'Goa')).toBe(true);
    expect(rows.every((row) => row.category === 'wedding_season')).toBe(true);
  });
});
