import { average, round } from '../utils/math.js';
import { OTA_CHANNELS, detectOtaChannel } from './rateSourceService.js';

const OTA_ESTIMATE_FACTORS = {
  booking: 1.04,
  agoda: 0.98,
  makemytrip: 1.01,
  goibibo: 0.99,
  expedia: 1.02,
};

function statusFromGap(gapPct, parityThresholdPct) {
  const absGap = Math.abs(Number(gapPct || 0));
  if (absGap <= parityThresholdPct) return 'In Parity';
  if (gapPct > parityThresholdPct) return 'Overpriced vs OTA';
  return 'Underpriced vs OTA';
}

function buildFallbackRows({ marketAvgPrice, hotelPrice, parityThresholdPct }) {
  const anchorPrice = Number(marketAvgPrice || hotelPrice || 0);
  if (anchorPrice <= 0) return [];

  return OTA_CHANNELS.slice(0, 3).map((channel) => {
    const otaPrice = Math.round(anchorPrice * (OTA_ESTIMATE_FACTORS[channel.key] || 1));
    const gapPct = otaPrice > 0 ? round(((hotelPrice - otaPrice) / otaPrice) * 100, 2) : 0;
    return {
      channel: channel.label,
      otaPrice,
      gapPct,
      status: statusFromGap(gapPct, parityThresholdPct),
      estimated: true,
      source: 'estimated_market',
    };
  });
}

export function computeOtaParity({
  hotelPrice,
  competitorRates = [],
  parityThresholdPct = 2,
  alertThresholdPct = 5,
  lastScrapedAt = null,
  marketAvgPrice = null,
  allowEstimateFallback = true,
}) {
  const safeHotelPrice = Number(hotelPrice || 0);
  const byChannel = new Map();

  for (const row of competitorRates) {
    const channel = detectOtaChannel(row?.competitor_name, row?.website_url || row?.url);
    if (!channel) continue;

    const price = Number(row?.price_today || 0);
    if (!Number.isFinite(price) || price <= 0) continue;

    if (!byChannel.has(channel.key)) {
      byChannel.set(channel.key, {
        channel: channel.label,
        prices: [],
      });
    }
    byChannel.get(channel.key).prices.push(price);
  }

  let rows = [...byChannel.values()].map((entry) => {
    const otaPrice = round(average(entry.prices), 0);
    const gapPct = otaPrice > 0 ? round(((safeHotelPrice - otaPrice) / otaPrice) * 100, 2) : 0;
    return {
      channel: entry.channel,
      otaPrice,
      gapPct,
      status: statusFromGap(gapPct, parityThresholdPct),
      estimated: false,
      source: 'scraped',
    };
  });

  if (!rows.length && allowEstimateFallback) {
    rows = buildFallbackRows({
      marketAvgPrice,
      hotelPrice: safeHotelPrice,
      parityThresholdPct,
    });
  }

  const sortedRows = rows.sort((left, right) => left.channel.localeCompare(right.channel));
  const sourceStatus = !sortedRows.length
    ? 'missing'
    : sortedRows.some((row) => row.estimated)
      ? 'estimated'
      : 'scraped';
  const maxAbsGapPct = sortedRows.length
    ? round(Math.max(...sortedRows.map((row) => Math.abs(Number(row.gapPct || 0)))), 2)
    : 0;

  return {
    hotelPrice: safeHotelPrice,
    parityThresholdPct,
    alertThresholdPct,
    lastScrapedAt: lastScrapedAt ? new Date(lastScrapedAt).toISOString() : null,
    sourceStatus,
    channelCount: sortedRows.length,
    summary: {
      inParity: sortedRows.filter((row) => row.status === 'In Parity').length,
      underpriced: sortedRows.filter((row) => row.status === 'Underpriced vs OTA').length,
      overpriced: sortedRows.filter((row) => row.status === 'Overpriced vs OTA').length,
      maxAbsGapPct,
      alertTriggered: maxAbsGapPct > alertThresholdPct,
    },
    rows: sortedRows,
  };
}
