/**
 * Booking and opportunity state machines.
 *
 * Transitions are declared, not scattered through route handlers. Anything
 * not listed here cannot happen, which is the point.
 */

export type BookingStatus =
  | "offer_accepted"
  | "payment_pending"
  | "payment_received"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "payment_expired"
  | "cancelled_guest"
  | "cancelled_hotel"
  | "no_show";

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  offer_accepted: ["payment_pending", "cancelled_guest"],
  payment_pending: ["payment_received", "payment_expired", "cancelled_guest"],
  payment_received: ["confirmed", "cancelled_hotel"],
  confirmed: ["checked_in", "cancelled_guest", "cancelled_hotel", "no_show"],
  checked_in: ["completed"],
  completed: [],
  payment_expired: [],
  cancelled_guest: [],
  cancelled_hotel: [],
  no_show: [],
};

export const TERMINAL_BOOKING_STATES: BookingStatus[] = [
  "completed",
  "payment_expired",
  "cancelled_guest",
  "cancelled_hotel",
  "no_show",
];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal booking transition: ${from} → ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Timeouts                                                            */
/* ------------------------------------------------------------------ */

export type TimeoutRule = {
  from: BookingStatus;
  /** Milliseconds from entering `from`, or null when anchored to a date. */
  afterMs: number | null;
  /** Anchored to check-in date instead of state entry. */
  anchor?: "check_in";
  anchorOffsetMs?: number;
  to: BookingStatus | null;
  exceptionType: string;
  severity: "low" | "medium" | "high" | "critical";
};

export const BOOKING_TIMEOUTS: TimeoutRule[] = [
  {
    from: "payment_pending",
    afterMs: 30 * 60_000,
    to: "payment_expired",
    exceptionType: "payment_link_expired",
    severity: "low",
  },
  {
    // The worst state in the system: the guest has paid and does not know
    // whether they have a room. Page ops immediately.
    from: "payment_received",
    afterMs: 5 * 60_000,
    to: null,
    exceptionType: "paid_not_confirmed",
    severity: "critical",
  },
  {
    from: "confirmed",
    afterMs: null,
    anchor: "check_in",
    anchorOffsetMs: 24 * 3600_000,
    to: "no_show",
    exceptionType: "no_show",
    severity: "medium",
  },
];

export function timeoutDueAt(
  rule: TimeoutRule,
  enteredAt: Date,
  checkIn?: Date,
): Date {
  if (rule.anchor === "check_in") {
    if (!checkIn) throw new Error("checkIn required for anchored rule");
    return new Date(checkIn.getTime() + (rule.anchorOffsetMs ?? 0));
  }
  return new Date(enteredAt.getTime() + (rule.afterMs ?? 0));
}

/* ------------------------------------------------------------------ */
/* Opportunity                                                         */
/* ------------------------------------------------------------------ */

export type OppStatus =
  | "created"
  | "verifying"
  | "verified"
  | "routed"
  | "offers_live"
  | "converted"
  | "no_offers"
  | "abandoned"
  | "expired";

export const OPP_TRANSITIONS: Record<OppStatus, OppStatus[]> = {
  created: ["verifying", "abandoned"],
  verifying: ["verified", "abandoned", "expired"],
  verified: ["routed", "abandoned"],
  routed: ["offers_live", "no_offers", "expired"],
  offers_live: ["converted", "no_offers", "expired"],
  converted: [],
  no_offers: ["routed"], // widening to more hotels reuses the same OPP code
  abandoned: [],
  expired: [],
};

export function canTransitionOpp(from: OppStatus, to: OppStatus): boolean {
  return OPP_TRANSITIONS[from].includes(to);
}

/* ------------------------------------------------------------------ */
/* Business rules that are easy to get wrong                           */
/* ------------------------------------------------------------------ */

/** Requests are accepted up to 48 hours ahead, down to same-day. */
export const BOOKING_WINDOW_HOURS = 48;

export function isWithinBookingWindow(
  checkIn: Date,
  now: Date = new Date(),
): boolean {
  const hours = (checkIn.getTime() - now.getTime()) / 3600_000;
  return hours >= -12 && hours <= BOOKING_WINDOW_HOURS;
}

/**
 * Grace on offer expiry. Losing a booking to a race condition is expensive;
 * a server-side buffer costs nothing.
 */
export const OFFER_GRACE_MS = 30_000;

export function isOfferAcceptable(
  holdsUntil: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() <= holdsUntil.getTime() + OFFER_GRACE_MS;
}

/**
 * Commission accrues on CHECK-IN, not on booking. A stay that never happened
 * earned nothing, and accruing early inflates the Commission-due tile.
 */
export function shouldAccrueCommission(status: BookingStatus): boolean {
  return status === "checked_in" || status === "completed";
}
