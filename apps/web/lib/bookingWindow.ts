/** Align guest UI with API `isWithinBookingWindow` (check-in: same-day → +48h). */

export const BOOKING_WINDOW_HOURS = 48;

/** Guest stay length choices for Direct beta (nights). */
export const STAY_NIGHT_OPTIONS = [3, 5] as const;
export type StayNights = (typeof STAY_NIGHT_OPTIONS)[number];

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function bookingWindowBounds(now = new Date()) {
  const min = new Date(now);
  min.setHours(0, 0, 0, 0);
  const max = new Date(now);
  max.setHours(0, 0, 0, 0);
  max.setDate(max.getDate() + 2); // check-in calendar days covering ~48h ahead
  return { min: isoDateLocal(min), max: isoDateLocal(max) };
}

export function checkoutFromNights(checkIn: string, nights: number) {
  const n = Math.max(1, Math.round(nights));
  const out = new Date(`${checkIn}T12:00:00`);
  out.setDate(out.getDate() + n);
  return isoDateLocal(out);
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(`${checkIn}T12:00:00`).getTime();
  const b = new Date(`${checkOut}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 3;
  return Math.round((b - a) / 86_400_000);
}

/** Default stay: check-in today (in window), stay 3 or 5 nights. */
export function defaultDirectDates(nights: StayNights | number = 3, now = new Date()) {
  const { min, max } = bookingWindowBounds(now);
  const checkIn = min;
  const checkOut = checkoutFromNights(checkIn, nights);
  return { check_in: checkIn, check_out: checkOut, checkIn, checkOut, min, max };
}

export function clampCheckInToWindow(checkIn: string, now = new Date()) {
  const { min, max } = bookingWindowBounds(now);
  if (!checkIn) return min;
  if (checkIn < min) return min;
  if (checkIn > max) return max;
  return checkIn;
}
