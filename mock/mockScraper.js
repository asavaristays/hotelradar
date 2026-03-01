/**
 * Deterministic mock competitor scraper.
 * Returns current and 48h-old prices so the intelligence engine can run without live scraping.
 * TODO: replace mockScraper with real scraper (Playwright + proxy rotation + anti-bot handling).
 */
const sampleRates = {
  '11111111-1111-4111-8111-111111111111': [
    { id: 'mock-goa-1', price_today: 11600, price_48h_ago: 10500 },
    { id: 'mock-goa-2', price_today: 11200, price_48h_ago: 10200 },
    { id: 'mock-goa-3', price_today: 11400, price_48h_ago: 10350 },
  ],
  '11111111-1111-4111-8111-111111111112': [
    { id: 'mock-goa-b-1', price_today: 9950, price_48h_ago: 9800 },
    { id: 'mock-goa-b-2', price_today: 10050, price_48h_ago: 9900 },
    { id: 'mock-goa-b-3', price_today: 9900, price_48h_ago: 9750 },
  ],
  '22222222-2222-4222-8222-222222222221': [
    { id: 'mock-mum-1', price_today: 14100, price_48h_ago: 13500 },
    { id: 'mock-mum-2', price_today: 13950, price_48h_ago: 13350 },
    { id: 'mock-mum-3', price_today: 14200, price_48h_ago: 13600 },
  ],
  '22222222-2222-4222-8222-222222222222': [
    { id: 'mock-mum-b-1', price_today: 9000, price_48h_ago: 9150 },
    { id: 'mock-mum-b-2', price_today: 8900, price_48h_ago: 9050 },
    { id: 'mock-mum-b-3', price_today: 9050, price_48h_ago: 9200 },
  ],
};

const cityBaseByName = {
  Goa: 10500,
  Mumbai: 13800,
  Jodhpur: 9200,
  Pushkar: 8600,
  Jawai: 11200,
  Jaipur: 9800,
  Nainital: 8900,
  Corbett: 9300,
  Mukeshwar: 9100,
  Mukteshwar: 9100,
};

function normalizeCompSet(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function fallbackCityFromHotel(hotelName = '') {
  const name = String(hotelName || '').toLowerCase();
  if (name.includes('goa')) return 'Goa';
  if (name.includes('mumbai')) return 'Mumbai';
  if (name.includes('jodhpur')) return 'Jodhpur';
  if (name.includes('pushkar')) return 'Pushkar';
  if (name.includes('jawai')) return 'Jawai';
  if (name.includes('jaipur')) return 'Jaipur';
  if (name.includes('nainital')) return 'Nainital';
  if (name.includes('corbett')) return 'Corbett';
  if (name.includes('mukeshwar') || name.includes('mukteshwar')) return 'Mukeshwar';
  return 'Mumbai';
}

function generateFallbackRates(hotelId, context = {}) {
  const city = context.city || fallbackCityFromHotel(context.hotelName);
  const midpoint =
    Number(context.basePriceMax || 0) > 0 && Number(context.basePriceMin || 0) > 0
      ? (Number(context.basePriceMin) + Number(context.basePriceMax)) / 2
      : cityBaseByName[city] || 10000;

  const marketBase = Math.max(3500, Math.round(midpoint * 1.18));
  const namesByCity = {
    Goa: ['Morjim Shoreline Retreat', 'Candolim Bay Suites', 'North Goa Beach House'],
    Mumbai: ['Marine Plaza Prime', 'BKC Signature Stay', 'Colaba Harbour Hotel'],
    Jodhpur: ['Blue City Heritage Inn', 'Clocktower Royal Stay', 'Mehrangarh View Hotel'],
    Pushkar: ['Pushkar Lakefront Residency', 'Desert Courtyard Pushkar', 'Savitri Hills Retreat'],
    Jawai: ['Leopard Trail Camp', 'Granite Hills Safari Lodge', 'Jawai Wilderness Estate'],
    Jaipur: ['Alsisar Haveli Jaipur', 'Narain Niwas Palace', 'Shahpura House Jaipur'],
    Nainital: ['Lakeview Nainital Retreat', 'Mall Road Grand', 'Pines & Peaks Resort'],
    Corbett: ['Jim Corbett River Lodge', 'Ramnagar Forest Retreat', 'Tiger Trail Corbett'],
    Mukeshwar: ['Mukeshwar Hills Resort', 'Pine Crest Mukeshwar', 'Valley View Mukeshwar'],
    Mukteshwar: ['Mukteshwar Hills Resort', 'Pine Crest Mukteshwar', 'Valley View Mukteshwar'],
  };

  const compSetNames = normalizeCompSet(context.compSet);
  const names = compSetNames.length
    ? compSetNames.slice(0, 3)
    : namesByCity[city] || ['Competitor One', 'Competitor Two', 'Competitor Three'];
  const offsets = [220, 80, -90];
  const movementFactors = [1.08, 1.06, 1.05];

  return names.map((name, index) => {
    const today = Math.max(2000, Math.round(marketBase + offsets[index]));
    const old = Math.round(today / movementFactors[index]);
    return {
      id: `mock-${hotelId}-${index + 1}`,
      competitor_name: name,
      price_today: today,
      price_48h_ago: old,
      price_7d_ago: Math.round(old * 0.98),
    };
  });
}

export async function getMockCompetitorRates(hotelId, context = {}) {
  return sampleRates[hotelId] || generateFallbackRates(hotelId, context);
}
