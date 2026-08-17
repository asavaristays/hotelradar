/**
 * Guards.
 *
 * Each of these encodes a decision already agreed. They exist because the
 * shipped admin currently contradicts four of them, and a rule that lives
 * only in a conversation gets re-broken next sprint.
 */

import type { SettlementMode } from "./settlement.js";
import { planFor } from "./settlement.js";

/* ------------------------------------------------------------------ */
/* 1. No Payout rows in direct_to_hotel mode                           */
/* ------------------------------------------------------------------ */
/**
 * The Payouts screen says "Manual NEFT settle until Razorpay Route is wired".
 * In direct_to_hotel mode there is nothing to settle: the guest paid the
 * hotel. Creating Payout rows implies you are holding guest funds and
 * remitting them, which is precisely the activity you decided NOT to do
 * until an aggregator is in place.
 *
 * Money owed flows the other way in this mode — the hotel owes you commission,
 * and that is an Invoice, not a Payout.
 */
export class SettlementViolation extends Error {}

export function assertPayoutAllowed(mode: SettlementMode): void {
  if (!planFor(mode).createsPayout) {
    throw new SettlementViolation(
      "Payout rows are not created in direct_to_hotel mode. " +
        "The guest paid the hotel; commission is collected by invoice. " +
        "Enable escrow mode before writing Payout records.",
    );
  }
}

export function payoutsScreenCopy(mode: SettlementMode): string {
  return mode === "escrow"
    ? "Created on check-in code redemption. Released from escrow to the hotel's linked account."
    : "No payouts in direct-to-hotel mode — the guest pays the hotel. Commission is collected via weekly invoice.";
}

/* ------------------------------------------------------------------ */
/* 2. Exceptions are problems, not an activity log                     */
/* ------------------------------------------------------------------ */
/**
 * The Exceptions screen shows `offer_accepted_handoff` and
 * `verified_awaiting_route`. Both are normal progress. Listing them as
 * exceptions means the dashboard reads "2 open exceptions" when nothing is
 * wrong — and a tile that cries wolf gets ignored within a fortnight, which
 * is exactly when a real `paid_not_confirmed` will land in it.
 *
 * These belong in Event. Nothing that happens on the happy path is an
 * exception.
 */
export const VALID_EXCEPTION_TYPES = [
  "paid_not_confirmed",
  "payout_failed",
  "hotel_oversold",
  "code_redemption_failed",
  "no_offers_received",
  "rate_sheet_expired",
  "sla_breach_response",
  "gstin_missing",
  "availability_stale",
  "commission_overdue",
  "refund_after_payout",
  "attestation_incomplete",
  "attestation_mismatch",
  "payment_link_expired",
  "no_show",
] as const;

export type ValidExceptionType = (typeof VALID_EXCEPTION_TYPES)[number];

/** Happy-path types currently mis-filed as exceptions. Move to Event. */
export const MISFILED_AS_EXCEPTION = [
  "offer_accepted_handoff",
  "verified_awaiting_route",
  "opportunity_created",
  "offer_sent",
  "booking_confirmed",
] as const;

export function isValidExceptionType(t: string): t is ValidExceptionType {
  return (VALID_EXCEPTION_TYPES as readonly string[]).includes(t);
}

export function assertExceptionType(t: string): void {
  if (isValidExceptionType(t)) return;
  const misfiled = (MISFILED_AS_EXCEPTION as readonly string[]).includes(t);
  throw new Error(
    misfiled
      ? `"${t}" is normal progress, not an exception. Write it to Event instead.`
      : `Unknown exception type "${t}".`,
  );
}

export const EXCEPTION_CLEANUP_SQL = `
-- Move happy-path rows out of Exception and into Event.
INSERT INTO "Event" ("occurredAt","actorType","entityType","entityId","eventType","payload")
SELECT "createdAt",'system','opportunity',"entityId","type",
       jsonb_build_object('migratedFrom','Exception','title',"title")
FROM "Exception"
WHERE "type" IN ('offer_accepted_handoff','verified_awaiting_route');

DELETE FROM "Exception"
WHERE "type" IN ('offer_accepted_handoff','verified_awaiting_route');
`;

/* ------------------------------------------------------------------ */
/* 3. OPP codes must not be enumerable                                 */
/* ------------------------------------------------------------------ */
/**
 * The admin shows OPP-20260808-0001, -0002, -0003. Sequential.
 *
 * Anyone holding one code can read every other traveller's request by
 * incrementing the last digits — names, dates, destinations, phone numbers if
 * the lookup returns them. This is the one item on the list I would fix before
 * any real guest data exists, because after that it is a disclosure, not a bug.
 *
 * Codes must come from a CSPRNG: OPP-26H-4K7M2.
 */
const SEQUENTIAL_OPP = /^OPP-\d{8}-\d{4}$/;

export function isEnumerableOppCode(code: string): boolean {
  return SEQUENTIAL_OPP.test(code);
}

export const OPP_CODE_MIGRATION = `
-- Regenerate every existing OPP code with generateOppCode() before the pilot.
-- Keep the old value so support can still find a request by what a guest quotes.
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "legacyOppCode" TEXT;
UPDATE "Opportunity" SET "legacyOppCode" = "oppCode" WHERE "legacyOppCode" IS NULL;
-- Then run the app-side backfill; SQL cannot produce a CSPRNG base32 code.
`;

/* ------------------------------------------------------------------ */
/* 4. Pilot scope is Goa                                               */
/* ------------------------------------------------------------------ */
/**
 * An opportunity for Rajasthan is in the list. With no hotels there, it can
 * only ever become `no_offers` — and it will quietly drag your coverage
 * percentage down, which is the metric the whole pilot is judged on.
 */
export const PILOT_DESTINATIONS = ["Goa"] as const;

export function isInPilotScope(destination: string): boolean {
  return (PILOT_DESTINATIONS as readonly string[]).includes(destination.trim());
}

/** Out-of-scope requests are captured, not routed, and excluded from coverage. */
export function dispositionFor(destination: string): {
  route: boolean;
  countInCoverage: boolean;
  guestMessage: string | null;
} {
  if (isInPilotScope(destination)) {
    return { route: true, countInCoverage: true, guestMessage: null };
  }
  return {
    route: false,
    countInCoverage: false,
    guestMessage:
      "We only cover North Goa right now. Leave your number and we'll message you when we open somewhere new.",
  };
}

/* ------------------------------------------------------------------ */
/* 5. Belt must be set for routing to work                             */
/* ------------------------------------------------------------------ */
/**
 * The New hotel form defaults belt to "other". A hotel in "other" never gets
 * the +20 belt score and never gets the night-time sheet bonus, so it will be
 * routed last for its entire life without anyone noticing.
 */
export const ROUTABLE_BELTS = [
  "morjim",
  "anjuna",
  "arambol",
  "candolim",
  "vagator",
  "calangute",
  "ashwem",
  "baga",
] as const;

export function canGoLive(hotel: {
  belt: string;
  gstin: string | null;
  lat: number | null;
  lng: number | null;
  hasNightContact: boolean;
  hasActiveRateSheet: boolean;
}): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!(ROUTABLE_BELTS as readonly string[]).includes(hotel.belt))
    blockers.push("Belt must be a routable belt, not 'other'");
  if (!hotel.gstin) blockers.push("GSTIN required — commission cannot be invoiced without it");
  if (hotel.lat === null || hotel.lng === null)
    blockers.push("Coordinates required for travel-time sorting");
  if (!hotel.hasNightContact)
    blockers.push("Night desk contact required — the owner's mobile is not enough");
  if (!hotel.hasActiveRateSheet)
    blockers.push("Active rate sheet required for instant quoting");
  return { ok: blockers.length === 0, blockers };
}
