export const PHASE_ONE_MARKET_INTELLIGENCE_TAG = 'phase_1_structured_demo';
export const DEFAULT_PHASE_ONE_HOTEL_NAME = 'The Ten';
export const DEFAULT_PHASE_ONE_CITY = 'Goa';
export const DEFAULT_PHASE_ONE_PRIMARY_DATE = '2026-08-15';

function median(values = []) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function isGoaCity(city = '') {
  return String(city || '').trim().toLowerCase() === 'goa';
}

function adaptMarketText(text = '', city = DEFAULT_PHASE_ONE_CITY) {
  if (isGoaCity(city)) return text;
  return String(text || '')
    .replace(/North Goa/g, city)
    .replace(/Goa/g, city)
    .replace(/Siolim \/ Morjim \/ Vagator cluster/g, `${city} demand cluster`)
    .replace(/Rakhi/g, 'holiday')
    .replace(/Raksha Bandhan/g, 'family travel holiday');
}

function adaptCompetitorRates(competitorRates = [], city = DEFAULT_PHASE_ONE_CITY) {
  if (isGoaCity(city)) return competitorRates;
  const genericNames = [
    `${city} comparable upper-upscale comp 1`,
    `${city} comparable boutique comp 2`,
    `${city} comparable lifestyle comp 3`,
    `${city} comparable resort comp 4`,
    `${city} aspirational benchmark comp 5`,
  ];
  return competitorRates.map(([, rate], index) => [genericNames[index] || `${city} market comp ${index + 1}`, rate]);
}

export function buildPhaseOneMarketIntelligenceScenario({
  now = new Date(),
  hotelName = DEFAULT_PHASE_ONE_HOTEL_NAME,
  city = DEFAULT_PHASE_ONE_CITY,
} = {}) {
  const observedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const baseMetadata = {
    phase: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
    generatedBy: 'seedPhaseOneMarketIntelligence',
    verificationLevel: 'structured_dummy',
    presentationUse: true,
    note: 'Structured pilot data for product validation. Replace source-by-source with verified live adapters in Phase 2.',
  };

  const stayDates = [
    {
      checkinDate: '2026-08-15',
      label: 'Independence Day long weekend',
      narrative: 'National holiday plus weekend creates leisure compression for North Goa.',
      officialRate: 36800,
      otaRates: [
        ['Google Hotels official panel', 36800],
        ['Agoda', 38200],
        ['Expedia', 39400],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 24600],
        ['Villa De Orange Boutique Hotel', 22200],
        ['The Acacia Morjim Goa', 28600],
        ['La Cabana Beach & Spa', 31800],
        ['The Westin Goa', 46200],
      ],
      pressure: { event: 24, airfare: 21, weather: -4 },
    },
    {
      checkinDate: '2026-08-16',
      label: 'Long weekend spillover',
      narrative: 'Second-night stayover demand should be watched for hold/increase opportunities.',
      officialRate: 35200,
      otaRates: [
        ['Google Hotels official panel', 35200],
        ['Agoda', 36100],
        ['Expedia', 37200],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 23800],
        ['Villa De Orange Boutique Hotel', 21400],
        ['The Acacia Morjim Goa', 27600],
        ['La Cabana Beach & Spa', 30600],
        ['The Westin Goa', 43800],
      ],
      pressure: { event: 18, airfare: 18, weather: -5 },
    },
    {
      checkinDate: '2026-08-21',
      label: 'Corporate offsite shoulder',
      narrative: 'MICE/offsite enquiry pressure is supportive, but rate action needs OTA and competitor confirmation.',
      officialRate: 32400,
      otaRates: [
        ['Google Hotels official panel', 32400],
        ['Agoda', 33200],
        ['MakeMyTrip', 33800],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 20200],
        ['Villa De Orange Boutique Hotel', 18800],
        ['The Acacia Morjim Goa', 25800],
        ['La Cabana Beach & Spa', 28200],
        ['The Westin Goa', 40400],
      ],
      pressure: { event: 14, airfare: 12, weather: -6 },
    },
    {
      checkinDate: '2026-08-22',
      label: 'Saturday leisure compression',
      narrative: 'Weekend leisure demand lifts, with boutique comp-set rates moving upward.',
      officialRate: 33800,
      otaRates: [
        ['Google Hotels official panel', 33800],
        ['Agoda', 34600],
        ['Expedia', 35800],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 21600],
        ['Villa De Orange Boutique Hotel', 19800],
        ['The Acacia Morjim Goa', 26800],
        ['La Cabana Beach & Spa', 29600],
        ['The Westin Goa', 42600],
      ],
      pressure: { event: 16, airfare: 14, weather: -5 },
    },
    {
      checkinDate: '2026-08-28',
      label: 'Raksha Bandhan family travel',
      narrative: 'Rakhi falls on Friday, giving family travel a clear weekend extension pattern.',
      officialRate: 37600,
      otaRates: [
        ['Google Hotels official panel', 37600],
        ['Agoda', 38900],
        ['Expedia', 40200],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 25200],
        ['Villa De Orange Boutique Hotel', 22800],
        ['The Acacia Morjim Goa', 29400],
        ['La Cabana Beach & Spa', 32600],
        ['The Westin Goa', 48600],
      ],
      pressure: { event: 22, airfare: 20, weather: -3 },
    },
    {
      checkinDate: '2026-08-29',
      label: 'Rakhi weekend compression',
      narrative: 'Family travel and destination-wedding enquiry pressure create a watch window.',
      officialRate: 39200,
      otaRates: [
        ['Google Hotels official panel', 39200],
        ['Agoda', 40800],
        ['Expedia', 42100],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 26800],
        ['Villa De Orange Boutique Hotel', 24400],
        ['The Acacia Morjim Goa', 31400],
        ['La Cabana Beach & Spa', 34800],
        ['The Westin Goa', 51400],
      ],
      pressure: { event: 26, airfare: 23, weather: -2 },
    },
    {
      checkinDate: '2026-08-30',
      label: 'Sunday departure shoulder',
      narrative: 'Demand softens after the Rakhi weekend; hold/watch unless pickup confirms extension.',
      officialRate: 34800,
      otaRates: [
        ['Google Hotels official panel', 34800],
        ['Agoda', 35600],
        ['Expedia', 36400],
      ],
      competitorRates: [
        ['Stone Wood Riverfront Resort', 22600],
        ['Villa De Orange Boutique Hotel', 20800],
        ['The Acacia Morjim Goa', 27400],
        ['La Cabana Beach & Spa', 30200],
        ['The Westin Goa', 43200],
      ],
      pressure: { event: 12, airfare: 10, weather: -6 },
    },
  ].map((stayDate) => {
    const competitorRates = adaptCompetitorRates(stayDate.competitorRates, city);
    const narrative = adaptMarketText(stayDate.narrative, city);
    return {
      ...stayDate,
      city,
      hotelName,
      narrative,
      competitorRates,
      observedAt,
      marketMedian: median(competitorRates.map(([, rate]) => rate)),
      metadata: {
        ...baseMetadata,
        stayDateLabel: adaptMarketText(stayDate.label, city),
        demandStory: narrative,
      },
    };
  });

  const events = [
    {
      city,
      eventName: 'Independence Day long weekend',
      venue: 'Goa market-wide',
      startDate: '2026-08-15',
      endDate: '2026-08-16',
      category: 'holiday',
      scale: 'large',
      estimatedAttendance: 18000,
      source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
      confidence: 'confirmed',
      eventUrl: 'https://www.timeanddate.com/holidays/india/independence-day',
      impactScore: 24,
    },
    {
      city,
      eventName: 'North Goa corporate offsite/MICE window',
      venue: 'North Goa',
      startDate: '2026-08-21',
      endDate: '2026-08-22',
      category: 'conference',
      scale: 'medium',
      estimatedAttendance: 900,
      source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
      confidence: 'tentative',
      eventUrl: '',
      impactScore: 14,
    },
    {
      city,
      eventName: 'Raksha Bandhan family travel window',
      venue: 'Goa market-wide',
      startDate: '2026-08-28',
      endDate: '2026-08-30',
      category: 'holiday',
      scale: 'large',
      estimatedAttendance: 14000,
      source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
      confidence: 'confirmed',
      eventUrl: 'https://www.timeanddate.com/holidays/india/raksha-bandhan',
      impactScore: 22,
    },
    {
      city,
      eventName: 'North Goa destination wedding enquiry window',
      venue: 'Siolim / Morjim / Vagator cluster',
      startDate: '2026-08-28',
      endDate: '2026-08-30',
      category: 'wedding',
      scale: 'medium',
      estimatedAttendance: 650,
      source: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
      confidence: 'tentative',
      eventUrl: '',
      impactScore: 18,
    },
  ].map((event) => ({
    ...event,
    city,
    eventName: adaptMarketText(event.eventName, city),
    venue: adaptMarketText(event.venue, city),
  }));

  return {
    tag: PHASE_ONE_MARKET_INTELLIGENCE_TAG,
    city,
    hotelName,
    primaryCheckinDate: DEFAULT_PHASE_ONE_PRIMARY_DATE,
    observedAt,
    stayDates,
    events,
    metadata: baseMetadata,
  };
}
