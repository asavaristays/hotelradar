/**
 * Rate engine.
 *
 * Turns an approved rate sheet into an instant offer. This is what removes the
 * ten-minute wait and what makes the night shift survivable — the sheet does
 * not sleep.
 *
 * The matching logic is pure and testable. The Prisma wrapper is thin.
 */

import { grossFromTariff } from "./money.js";

export type Season = "monsoon" | "shoulder" | "peak" | "xmas_ny";

export type RateRow = {
  id: string;
  roomType: string;
  season: Season;
  /** Bitmask Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64 */
  dowMask: number;
  floorTariffPaise: bigint;
  minNights: number;
  maxNights: number;
  maxOccupancy: number;
  advanceHoursMin: number;
  inclusions: string[];
  blackoutDates: Date[];
};

export type QuoteRequest = {
  checkIn: Date;
  checkOut: Date;
  nights: number;
  adults: number;
  children: number;
  leadTimeHours: number;
  roomType?: string;
};

export type NoMatchReason =
  | "no_rows"
  | "room_type"
  | "season"
  | "day_of_week"
  | "min_nights"
  | "max_nights"
  | "occupancy"
  | "advance_notice"
  | "blackout";

export type MatchResult =
  | { matched: true; row: RateRow }
  | { matched: false; reason: NoMatchReason };

/* ------------------------------------------------------------------ */
/* Season — Goa's calendar, not a generic one                          */
/* ------------------------------------------------------------------ */

export function seasonFor(date: Date): Season {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();

  if (m === 12 && d >= 20) return "xmas_ny";
  if (m === 1 && d <= 5) return "xmas_ny";
  if (m === 12 || m === 1 || m === 2) return "peak";
  if (m >= 6 && m <= 9) return "monsoon";
  return "shoulder";
}

/** Mon=1 … Sun=64, matching the dowMask convention. */
export function dowBit(date: Date): number {
  const js = date.getUTCDay(); // 0 = Sunday
  const mondayIndex = (js + 6) % 7; // 0 = Monday
  return 1 << mondayIndex;
}

/** Every night of the stay must be permitted, not just the first. */
export function stayNights(checkIn: Date, nights: number): Date[] {
  return Array.from({ length: nights }, (_, i) => {
    const d = new Date(checkIn);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * Pure. Returns the cheapest eligible row, or the reason nothing matched —
 * the reason is what the ops dashboard needs to fix coverage.
 */
export function matchRateRow(rows: RateRow[], req: QuoteRequest): MatchResult {
  if (rows.length === 0) return { matched: false, reason: "no_rows" };

  const nights = stayNights(req.checkIn, req.nights);
  const season = seasonFor(req.checkIn);
  const guests = req.adults + req.children;

  // Track how far each row got, so the failure reason is the most specific one.
  const order: NoMatchReason[] = [
    "room_type",
    "season",
    "day_of_week",
    "min_nights",
    "max_nights",
    "occupancy",
    "advance_notice",
    "blackout",
  ];
  let furthest = 0;
  const eligible: RateRow[] = [];

  for (const row of rows) {
    let stage = 0;
    const fail = (r: NoMatchReason) => {
      const idx = order.indexOf(r);
      if (idx >= furthest) furthest = idx;
      return false;
    };

    const passes = (() => {
      if (req.roomType && row.roomType !== req.roomType) return fail("room_type");
      stage++;
      if (row.season !== season) return fail("season");
      if (!nights.every((n) => (row.dowMask & dowBit(n)) !== 0))
        return fail("day_of_week");
      if (req.nights < row.minNights) return fail("min_nights");
      if (req.nights > row.maxNights) return fail("max_nights");
      if (guests > row.maxOccupancy) return fail("occupancy");
      if (req.leadTimeHours < row.advanceHoursMin) return fail("advance_notice");
      if (
        row.blackoutDates.some((bd) => nights.some((n) => sameDay(bd, n)))
      )
        return fail("blackout");
      return true;
    })();

    void stage;
    if (passes) eligible.push(row);
  }

  if (eligible.length === 0) return { matched: false, reason: order[furthest] };

  const best = eligible.reduce((a, b) =>
    b.floorTariffPaise < a.floorTariffPaise ? b : a,
  );
  return { matched: true, row: best };
}

/* ------------------------------------------------------------------ */
/* Quoting                                                             */
/* ------------------------------------------------------------------ */

export type Quote = {
  rateSheetRowId: string;
  roomType: string;
  tariffPerNightPaise: bigint;
  nights: number;
  baseTariffPaise: bigint;
  grossPaise: bigint;
  inclusions: string[];
  holdsUntil: Date;
};

/** Offers hold for a stated clock time. Never a client-side countdown. */
export const OFFER_HOLD_MINUTES = 45;

export function buildQuote(
  row: RateRow,
  req: QuoteRequest,
  roomGstRateBps: number,
  now: Date = new Date(),
): Quote {
  const base = row.floorTariffPaise * BigInt(req.nights);
  return {
    rateSheetRowId: row.id,
    roomType: row.roomType,
    tariffPerNightPaise: row.floorTariffPaise,
    nights: req.nights,
    baseTariffPaise: base,
    grossPaise: grossFromTariff(row.floorTariffPaise, req.nights, roomGstRateBps),
    inclusions: row.inclusions,
    holdsUntil: new Date(now.getTime() + OFFER_HOLD_MINUTES * 60_000),
  };
}

/**
 * Guard against a sheet quoting below what the hotel agreed. Belt and braces:
 * the floor is already in the row, but a bad migration or a manual edit could
 * break it, and the first time a hotel is undercut is the last time they trust
 * the engine.
 */
export function isQuoteWithinFloor(
  quotedPerNightPaise: bigint,
  floorPerNightPaise: bigint,
): boolean {
  return quotedPerNightPaise >= floorPerNightPaise;
}

/** A sheet past its expiry must never quote. */
export function isSheetUsable(
  sheet: { status: string; expiresAt: Date; effectiveFrom: Date; effectiveTo: Date },
  checkIn: Date,
  now: Date = new Date(),
): boolean {
  if (sheet.status !== "active") return false;
  if (sheet.expiresAt <= now) return false;
  if (checkIn < sheet.effectiveFrom) return false;
  if (checkIn > sheet.effectiveTo) return false;
  return true;
}
