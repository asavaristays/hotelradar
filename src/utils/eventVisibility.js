const NON_PHYSICAL_EVENT_PATTERNS = [
  /\bonline\b/i,
  /\bvirtual\b/i,
  /\bwebinar\b/i,
  /\bzoom\b/i,
  /\bgoogle meet\b/i,
  /\bteams\b/i,
  /\bhybrid\b/i,
  /\blivestream\b/i,
  /\blive stream\b/i,
];

export function isPhysicalEventRecord(event = {}) {
  const haystack = [
    event.eventName,
    event.event_name,
    event.venue,
    event.category,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  if (!haystack) return true;

  return !NON_PHYSICAL_EVENT_PATTERNS.some((pattern) => pattern.test(haystack));
}
