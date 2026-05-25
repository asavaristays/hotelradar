import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildSourceList,
  classifyCategory,
  eventFromHtmlFallback,
  extractBookMyShowVenue,
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
    expect(summary.sourceResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Goa',
          source: 'insider.in',
          status: 'success',
        }),
      ]),
    );
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
    const missingHintsPath = path.join(tmpDir, 'missing_hints.json');
    const html = `<html><head><title>Mumbai Corporate Planning Meetup | LinkedIn</title></head><body><p>Event date 2026-04-21</p></body></html>`;

    const summary = await runEventCollectionCycle(
      {
        outputPath,
        includeWeddingSignals: false,
        linkedinHintsFile: missingHintsPath,
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
    expect(summary.linkedinHintsAdded).toBe(0);
    const output = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(output[0].city).toBe('Mumbai');
    expect(output[0].category).toBe('conference');
    expect(output[0].confidence).toBe('tentative');
  });

  test('extracts offline BookMyShow venue details from html fallback', () => {
    const html = `
      <html>
        <head>
          <title>Infosys Leadership Meet | BookMyShow</title>
          <meta property="og:description" content="Corporate event at Grand Hyatt Goa on 2026-04-21" />
        </head>
        <body>
          <script>window.__DATA__ = {"venue":"Grand Hyatt Goa"}</script>
          <p>2026-04-21</p>
        </body>
      </html>
    `;

    expect(extractBookMyShowVenue(html)).toBe('Grand Hyatt Goa');

    const event = eventFromHtmlFallback(
      html,
      {
        city: 'Goa',
        source: 'bookmyshow.com',
        url: 'https://in.bookmyshow.com/events/infosys-leadership-meet/ETTEST',
      },
      '2026-03-16T12:00:00.000Z',
    );

    expect(event).toMatchObject({
      city: 'Goa',
      venue: 'Grand Hyatt Goa',
      source: 'bookmyshow.com',
    });
  });

  test('drops online BookMyShow fallback events', () => {
    const html = `
      <html>
        <head>
          <title>Revenue Masterclass Online | BookMyShow</title>
          <meta property="og:description" content="Join online on Zoom at 2026-04-25" />
        </head>
        <body>
          <script>window.__DATA__ = {"venue":"Online"}</script>
          <p>2026-04-25</p>
        </body>
      </html>
    `;

    const event = eventFromHtmlFallback(
      html,
      {
        city: 'Mumbai',
        source: 'bookmyshow.com',
        url: 'https://in.bookmyshow.com/events/revenue-masterclass-online/ETTEST',
      },
      '2026-03-16T12:00:00.000Z',
    );

    expect(event).toBeNull();
  });

  test('writes BookMyShow debug capture when no events are parsed', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-collector-bms-debug-'));
    const outputPath = path.join(tmpDir, 'latest.json');
    const html = `
      <html>
        <head><title>BookMyShow Explore Goa</title></head>
        <body><div id="app"></div></body>
      </html>
    `;

    const summary = await runEventCollectionCycle(
      {
        outputPath,
        includeWeddingSignals: false,
        sources: [
          {
            city: 'Goa',
            source: 'bookmyshow.com',
            url: 'https://in.bookmyshow.com/explore/events-goa',
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

    expect(summary.bookmyshowDebugWritten).toBe(1);
    expect(summary.sourceResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Goa',
          source: 'bookmyshow.com',
          status: 'success',
          rowsCollected: 0,
        }),
      ]),
    );
    const debugHtml = await fs.readFile(path.join(tmpDir, 'debug-bookmyshow', 'goa.html'), 'utf8');
    const debugMeta = JSON.parse(await fs.readFile(path.join(tmpDir, 'debug-bookmyshow', 'goa.json'), 'utf8'));

    expect(debugHtml).toContain('BookMyShow Explore Goa');
    expect(debugMeta.reason).toBe('no_events_parsed');
    expect(debugMeta.city).toBe('Goa');
  });

  test('parses source spec in City|source|url format', () => {
    expect(parseSourceSpec('Goa|insider.in|https://insider.in/goa/all-events')).toEqual({
      city: 'Goa',
      source: 'insider.in',
      url: 'https://insider.in/goa/all-events',
    });
  });

  test('includes broader Jaipur event sources by default', () => {
    const jaipurSources = buildSourceList().filter((entry) => entry.city === 'Jaipur');
    expect(jaipurSources.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(['insider.in', 'bookmyshow.com', 'allevents.in', 'eventbrite.com']),
    );
  });

  test('blocks IPL hint rows before the 2026 season start', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-collector-'));
    const outputPath = path.join(tmpDir, 'latest.json');
    const linkedinHintsFile = path.join(tmpDir, 'linkedin_hints.json');

    await fs.writeFile(
      linkedinHintsFile,
      JSON.stringify([
        {
          name: 'IPL Match - Wankhede',
          city: 'Mumbai',
          venue: 'Wankhede Stadium',
          start_date: '2026-03-12',
          end_date: '2026-03-12',
          category: 'ipl_match',
          scale: 'large',
        },
      ]),
      'utf8',
    );

    const summary = await runEventCollectionCycle(
      {
        outputPath,
        includeWeddingSignals: false,
        linkedinHintsFile,
        sources: [],
      },
      {
        fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }),
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      },
    );

    const output = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(summary.rowsBlocked).toBe(1);
    expect(summary.rowsWritten).toBe(0);
    expect(output).toEqual([]);
  });

  test('generates Goa wedding signals for wedding season weekends', () => {
    const rows = generateGoaWeddingSignals(21, new Date('2026-11-01T00:00:00Z'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.city === 'Goa')).toBe(true);
    expect(rows.every((row) => row.category === 'wedding_season')).toBe(true);
  });
});
