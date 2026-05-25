const BLOCKED_HOTEL_NAME_KEYS = new Set([
  'bkc business hotel',
  'bks business hotel',
]);

function normalizeHotelNameKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isVisibleHotelRecord(hotel = {}) {
  const hotelName = normalizeHotelNameKey(
    hotel.hotel_name || hotel.hotelName || hotel.name || '',
  );

  if (!hotelName) {
    return true;
  }

  return !BLOCKED_HOTEL_NAME_KEYS.has(hotelName);
}
