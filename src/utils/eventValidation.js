const IPL_MATCH_MIN_START_BY_YEAR = {
  '2026': '2026-03-28',
};

export function validateEvent(event) {
  if (!event) return false;

  const name = String(event.name || event.event_name || '').trim();
  const startDate = String(event.start_date || event.startDate || '').trim();

  if (!name) return false;
  if (!startDate) return false;
  return true;
}

export function getBlockedEventReason({ category = '', startDate = '' } = {}) {
  const safeCategory = String(category || '').trim().toLowerCase();
  const safeStartDate = String(startDate || '').trim();
  if (!safeCategory || !safeStartDate) return '';

  if (safeCategory === 'ipl_match') {
    const seasonYear = safeStartDate.slice(0, 4);
    const minStartDate = IPL_MATCH_MIN_START_BY_YEAR[seasonYear];
    if (minStartDate && safeStartDate < minStartDate) {
      return `ipl_match rows before ${minStartDate} are blocked for ${seasonYear}`;
    }
  }

  return '';
}

export function isEventAllowed(input = {}) {
  return !getBlockedEventReason(input);
}
