import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  completePropertyResearchJob,
  createPropertyResearchJob,
  getPropertyResearchJob,
  insertPropertyResearchCompetitors,
  insertPropertyResearchEvidence,
  listPropertyResearchJobs,
  selectPropertyResearchCompetitors,
} from '../repositories/propertyResearchRepository.js';

const SOURCE_TYPES = new Set(['website', 'google', 'ota', 'competitor', 'operator']);
const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(html = '') {
  return normalizeWhitespace(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&'),
  );
}

function meaningfulTokens(value = '') {
  return Array.from(
    new Set(
      normalizeWhitespace(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4),
    ),
  );
}

export function scorePropertyNameMatch(hotelName, content) {
  const tokens = meaningfulTokens(hotelName);
  if (tokens.length === 0) return 0;
  const haystack = String(content || '').toLowerCase();
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  return Number((matches / tokens.length).toFixed(4));
}

function extractTitle(html = '') {
  return normalizeWhitespace(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || null;
}

function extractRating(text = '') {
  const patterns = [
    /rating[^0-9]{0,12}([0-4](?:\.\d)?|5(?:\.0)?)/i,
    /([0-4](?:\.\d)?|5(?:\.0)?)\s*(?:\/\s*5|out of 5|stars?)/i,
  ];
  for (const pattern of patterns) {
    const value = Number(text.match(pattern)?.[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 5) return value;
  }
  return null;
}

function extractReviewCount(text = '') {
  const match = text.match(/([0-9][0-9,]*)\s+(?:reviews?|ratings?)/i);
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function extractLink(html = '', pattern) {
  const links = Array.from(String(html).matchAll(/href=["']([^"']+)["']/gi)).map(
    (match) => match[1],
  );
  return links.find((href) => pattern.test(href)) || null;
}

function isPrivateAddress(address = '') {
  if (!address) return true;
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd')) {
    return true;
  }
  if (address.startsWith('fe80:')) return true;
  return PRIVATE_IPV4.some((pattern) => pattern.test(address));
}

export async function assertSafeResearchUrl(rawUrl, lookupImpl = lookup) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw Object.assign(new Error('Evidence URL must be a valid HTTP or HTTPS URL.'), { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error('Evidence URL must use HTTP or HTTPS without embedded credentials.'), {
      status: 400,
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw Object.assign(new Error('Local and private evidence URLs are not allowed.'), { status: 400 });
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw Object.assign(new Error('Local and private evidence URLs are not allowed.'), { status: 400 });
  }

  return parsed.toString();
}

export async function inspectPropertySource(
  source,
  {
    hotelName,
    fetchImpl = globalThis.fetch,
    lookupImpl = lookup,
    timeoutMs = 12_000,
  } = {},
) {
  const sourceType = SOURCE_TYPES.has(source?.sourceType) ? source.sourceType : 'website';
  const sourceUrl = await assertSafeResearchUrl(source?.url, lookupImpl);
  const startedAt = Date.now();

  try {
    let activeUrl = sourceUrl;
    let response;
    for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
      activeUrl = await assertSafeResearchUrl(activeUrl, lookupImpl);
      response = await fetchImpl(activeUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; HotelRADAR Property Research; +https://hotelradar.in)',
        },
      });

      if (![301, 302, 303, 307, 308].includes(Number(response.status))) break;
      const location = response.headers?.get?.('location');
      if (!location || redirectCount === 4) {
        throw new Error('Evidence source exceeded the safe redirect limit.');
      }
      activeUrl = new URL(location, activeUrl).toString();
    }

    const contentType = response.headers?.get?.('content-type') || '';
    const html = contentType.includes('html') ? await response.text() : '';
    const text = stripHtml(html).slice(0, 8000);
    const pageTitle = extractTitle(html);
    const matchScore = scorePropertyNameMatch(hotelName, `${pageTitle || ''} ${text}`);
    const blocked =
      !response.ok ||
      /access denied|captcha|attention required|verify you are human|robot check/i.test(
        `${pageTitle || ''} ${text}`,
      );
    const matchedHotelName = matchScore >= 0.5;
    const confidenceScore = Math.max(
      0,
      Math.min(100, (response.ok ? 25 : 0) + (matchedHotelName ? 50 : 0) + (html ? 15 : 0)),
    );

    return {
      sourceType,
      sourceUrl,
      finalUrl: response.url || activeUrl,
      pageTitle,
      rawValue: text.slice(0, 1200) || null,
      normalizedValue: matchedHotelName ? 'property_match' : 'property_not_verified',
      httpStatus: response.status,
      reachable: response.ok,
      blocked,
      matchedHotelName,
      matchScore,
      ratingValue: extractRating(text),
      reviewCount: extractReviewCount(text),
      bookingEngineUrl: extractLink(html, /(book|booking|reserve|availability|axisrooms)/i),
      contactUrl: extractLink(html, /(contact|tel:|mailto:)/i),
      roomsUrl: extractLink(html, /(room|suite|accommodation)/i),
      confidenceScore,
      fetchMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      sourceType,
      sourceUrl,
      finalUrl: null,
      pageTitle: null,
      rawValue: null,
      normalizedValue: 'source_unavailable',
      httpStatus: null,
      reachable: false,
      blocked: error?.name === 'AbortError' || error?.name === 'TimeoutError',
      matchedHotelName: false,
      matchScore: 0,
      ratingValue: null,
      reviewCount: null,
      bookingEngineUrl: null,
      contactUrl: null,
      roomsUrl: null,
      confidenceScore: 0,
      fetchMs: Date.now() - startedAt,
    };
  }
}

export function summarizePropertyResearch(evidence = [], competitors = []) {
  const usable = evidence.filter(
    (row) => row.reachable && !row.blocked && row.matchedHotelName,
  );
  const website = usable.find((row) => row.sourceType === 'website');
  const bookingPath = usable.find((row) => row.bookingEngineUrl);
  const rating = usable.find((row) => row.ratingValue != null);
  const sourceCoverage = new Set(usable.map((row) => row.sourceType)).size;
  const confidenceScore = Math.min(
    100,
    (website ? 30 : 0) +
      Math.min(30, sourceCoverage * 10) +
      (bookingPath ? 15 : 0) +
      (rating ? 10 : 0) +
      (competitors.length >= 3 ? 15 : competitors.length * 5),
  );
  const confidenceLabel =
    confidenceScore >= 75 ? 'high' : confidenceScore >= 45 ? 'medium' : 'low';
  const status = confidenceScore >= 75 ? 'completed' : 'review_required';

  return {
    status,
    confidenceScore,
    confidenceLabel,
    summary:
      usable.length > 0
        ? `${usable.length} matching source${usable.length === 1 ? '' : 's'} verified; ${competitors.length} market-index competitor candidate${competitors.length === 1 ? '' : 's'} found. Stay-date rates remain unverified and are excluded from pricing.`
        : `No matching source could be verified. ${competitors.length} market-index competitor candidate${competitors.length === 1 ? '' : 's'} found; manual review is required.`,
  };
}

export async function runPropertyResearch(
  {
    hotelName,
    city,
    area = null,
    sources = [],
    requestedBy = null,
  },
  deps = {},
) {
  const repository = {
    createPropertyResearchJob,
    completePropertyResearchJob,
    insertPropertyResearchEvidence,
    selectPropertyResearchCompetitors,
    insertPropertyResearchCompetitors,
    getPropertyResearchJob,
    ...deps.repository,
  };
  const job = await repository.createPropertyResearchJob({
    hotelName,
    city,
    area,
    requestedBy,
  });

  try {
    const evidence = [];
    for (const source of sources) {
      evidence.push(
        await inspectPropertySource(source, {
          hotelName,
          fetchImpl: deps.fetchImpl,
          lookupImpl: deps.lookupImpl,
          timeoutMs: deps.timeoutMs,
        }),
      );
    }
    await repository.insertPropertyResearchEvidence(job.id, evidence);

    const candidates = await repository.selectPropertyResearchCompetitors({
      city,
      hotelName,
      limit: 6,
    });
    const competitors = await repository.insertPropertyResearchCompetitors(job.id, candidates);
    const summary = summarizePropertyResearch(evidence, competitors);
    await repository.completePropertyResearchJob(job.id, summary);
    return repository.getPropertyResearchJob(job.id);
  } catch (error) {
    await repository.completePropertyResearchJob(job.id, {
      status: 'failed',
      confidenceScore: 0,
      confidenceLabel: 'low',
      summary: 'Property research failed before verification completed.',
      failureReason: error.message,
    });
    throw error;
  }
}

export { getPropertyResearchJob, listPropertyResearchJobs };
