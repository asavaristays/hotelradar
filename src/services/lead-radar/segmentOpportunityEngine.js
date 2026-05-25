function normalizeCity(city) {
  return String(city || '').trim().toLowerCase();
}

function normalizeNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasSignal(hotel, signal) {
  return Array.isArray(hotel?.signals) && hotel.signals.includes(signal);
}

function buildSegmentOpportunities(hotel) {
  const opportunities = [];
  const city = normalizeCity(hotel?.city);
  const reviewVolumePercentile = normalizeNumeric(hotel?.context?.reviewVolumePercentile);

  if (city === 'mumbai' || (Number.isFinite(reviewVolumePercentile) && reviewVolumePercentile <= 30)) {
    opportunities.push({
      segment: 'CORPORATE',
      opportunity: 'Corporate demand potential',
      action: 'Promote weekday corporate packages',
    });
  }

  if (city === 'jaipur') {
    opportunities.push({
      segment: 'WEDDING',
      opportunity: 'Wedding demand potential',
      action: 'Promote wedding stay and venue packages',
    });
  }

  if (
    Number.isFinite(reviewVolumePercentile) &&
    reviewVolumePercentile <= 20 &&
    hasSignal(hotel, 'HIGH_REVIEW_VOLUME')
  ) {
    opportunities.push({
      segment: 'GROUP',
      opportunity: 'Group booking potential',
      action: 'Promote group stay packages',
    });
  }

  if (city === 'goa') {
    opportunities.push({
      segment: 'LEISURE',
      opportunity: 'Leisure demand potential',
      action: 'Promote leisure stay packages',
    });
  }

  return opportunities;
}

export async function computeSegmentOpportunities(hotels = []) {
  return hotels.map((hotel) => ({
    ...hotel,
    segmentOpportunities: buildSegmentOpportunities(hotel),
  }));
}
