/**
 * Routing.
 *
 * Sends one opportunity to two or three hotels at once. This is what makes
 * silence survivable: a single hotel that does not answer ends the journey,
 * three hotels almost never all go quiet.
 */

export type RoutableHotel = {
  id: string;
  belt: string;
  stopSell: boolean;
  status: string;
  instantQuoteEnabled: boolean;
  /** Rolling median from OpportunityHotel.responseSeconds, last 30 days. */
  medianResponseSeconds: number | null;
  /** Share of requests answered in the last 30 days, 0–1. */
  responseRate: number | null;
  distanceMeters: number | null;
  hasAvailability: boolean | null; // null = unknown
};

export type RoutingRequest = {
  preferredBelt: string | null;
  atHour: number; // IST hour 0–23
  fanOut?: number;
};

export const DEFAULT_FAN_OUT = 3;

/** Below this, a hotel is not worth including — it drags coverage down. */
export const MIN_RESPONSE_RATE = 0.35;

export type RoutingDecision = {
  hotels: RoutableHotel[];
  /** Explains an under-filled fan-out to the ops dashboard. */
  shortfallReason: "none" | "belt_thin" | "all_stop_sell" | "no_live_hotels";
};

/**
 * Score is deliberately simple and explainable. A hotel owner asking why they
 * did not get a request deserves an answer you can give on the phone.
 */
export function scoreHotel(h: RoutableHotel, req: RoutingRequest): number {
  let score = 0;

  if (h.instantQuoteEnabled) score += 40; // a sheet answers in seconds
  if (h.hasAvailability === true) score += 25;
  if (h.hasAvailability === null) score += 5; // unknown beats known-full

  if (h.responseRate !== null) score += h.responseRate * 20;

  if (h.medianResponseSeconds !== null) {
    if (h.medianResponseSeconds <= 120) score += 15;
    else if (h.medianResponseSeconds <= 300) score += 10;
    else if (h.medianResponseSeconds <= 600) score += 5;
  }

  if (req.preferredBelt && h.belt === req.preferredBelt) score += 20;

  if (h.distanceMeters !== null) {
    // Hopper path: 15 minutes away matters far more than a nicer room.
    if (h.distanceMeters <= 5000) score += 15;
    else if (h.distanceMeters <= 15000) score += 8;
  }

  // At night, a hotel without a rate sheet needs a human awake. Weight the
  // sheet harder rather than routing to a desk that will not pick up.
  const isNight = req.atHour >= 22 || req.atHour < 7;
  if (isNight && h.instantQuoteEnabled) score += 25;
  if (isNight && !h.instantQuoteEnabled) score -= 15;

  return score;
}

export function selectHotels(
  candidates: RoutableHotel[],
  req: RoutingRequest,
): RoutingDecision {
  const live = candidates.filter((h) => h.status === "live");
  if (live.length === 0) {
    return { hotels: [], shortfallReason: "no_live_hotels" };
  }

  const open = live.filter((h) => !h.stopSell && h.hasAvailability !== false);
  if (open.length === 0) {
    return { hotels: [], shortfallReason: "all_stop_sell" };
  }

  const viable = open.filter(
    (h) => h.responseRate === null || h.responseRate >= MIN_RESPONSE_RATE,
  );
  const pool = viable.length > 0 ? viable : open;

  const fanOut = req.fanOut ?? DEFAULT_FAN_OUT;
  const ranked = [...pool].sort((a, b) => scoreHotel(b, req) - scoreHotel(a, req));
  const chosen = ranked.slice(0, fanOut);

  return {
    hotels: chosen,
    shortfallReason: chosen.length < fanOut ? "belt_thin" : "none",
  };
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

export type EscalationStep = {
  afterMs: number;
  action: "remind_whatsapp" | "call_desk" | "call_owner" | "widen_search";
  target: "hotel" | "ops";
};

/**
 * In a pilot, a phone call is a feature. Escalate on a clock rather than
 * hoping.
 */
export const ESCALATION_LADDER: EscalationStep[] = [
  { afterMs: 5 * 60_000, action: "remind_whatsapp", target: "hotel" },
  { afterMs: 4 * 60_000 + 5 * 60_000, action: "call_desk", target: "ops" },
  { afterMs: 15 * 60_000, action: "widen_search", target: "ops" },
  { afterMs: 30 * 60_000, action: "call_owner", target: "ops" },
];

export function dueEscalations(
  sentAt: Date,
  alreadyDone: EscalationStep["action"][],
  now: Date = new Date(),
): EscalationStep[] {
  const elapsed = now.getTime() - sentAt.getTime();
  return ESCALATION_LADDER.filter(
    (s) => elapsed >= s.afterMs && !alreadyDone.includes(s.action),
  );
}

/** Which contact to message, given the hour. The owner is asleep at 1 AM. */
export function contactRoleForHour(hour: number): "front_desk" | "night_desk" {
  return hour >= 22 || hour < 7 ? "night_desk" : "front_desk";
}
