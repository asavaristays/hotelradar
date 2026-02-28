export function isWeekend(date) {
  const day = new Date(date).getUTCDay();
  return day === 0 || day === 6;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}
