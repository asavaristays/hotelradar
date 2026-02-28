export function toDateOnly(input = new Date()) {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(dateInput, days) {
  const d = toDateOnly(dateInput);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isWeekend(dateInput) {
  const d = toDateOnly(dateInput);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function dateToKey(dateInput) {
  return toDateOnly(dateInput).toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  const from = toDateOnly(fromDate).getTime();
  const to = toDateOnly(toDate).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}
