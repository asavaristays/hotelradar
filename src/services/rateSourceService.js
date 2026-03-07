export const OTA_CHANNELS = [
  { key: 'booking', label: 'Booking.com', patterns: [/booking/i] },
  { key: 'agoda', label: 'Agoda', patterns: [/agoda/i] },
  { key: 'makemytrip', label: 'MakeMyTrip', patterns: [/makemytrip/i, /\bmmt\b/i] },
  { key: 'goibibo', label: 'Goibibo', patterns: [/goibibo/i] },
  { key: 'expedia', label: 'Expedia', patterns: [/expedia/i] },
  { key: 'trip', label: 'Trip.com', patterns: [/trip\.?com/i] },
  { key: 'tripadvisor', label: 'Tripadvisor', patterns: [/tripadvisor/i] },
];

export function detectOtaChannel(rawName = '', rawUrl = '') {
  const value = `${String(rawName || '')} ${String(rawUrl || '')}`.toLowerCase();
  for (const channel of OTA_CHANNELS) {
    if (channel.patterns.some((pattern) => pattern.test(value))) {
      return channel;
    }
  }
  return null;
}

export function isOtaChannelRow(row = {}) {
  return Boolean(detectOtaChannel(row?.competitor_name, row?.website_url || row?.url));
}

export function splitRateRows(rows = []) {
  const hotelCompetitorRates = [];
  const otaParityRates = [];

  for (const row of rows) {
    if (isOtaChannelRow(row)) {
      otaParityRates.push(row);
    } else {
      hotelCompetitorRates.push(row);
    }
  }

  return {
    hotelCompetitorRates,
    otaParityRates,
  };
}
