/**
 * Reconciling the shipped statuses with the agreed state machine.
 *
 * The admin currently shows `verification_pending` and `traveller_accepted`,
 * which are not in the OppStatus enum. They are close to canonical states but
 * not identical, and the gap will widen every week it is left alone.
 *
 * Map, migrate, then delete this file.
 */

import type { OppStatus } from "./booking-state.js";

/** What the running system emits today → what it should be. */
export const LEGACY_OPP_STATUS: Record<string, OppStatus> = {
  verification_pending: "verifying",
  verified: "verified",
  awaiting_route: "verified",
  routed: "routed",
  awaiting_hotel: "routed",
  offer_sent: "offers_live",
  offers_live: "offers_live",
  traveller_accepted: "converted",
  converted: "converted",
  no_offers: "no_offers",
  abandoned: "abandoned",
  expired: "expired",
};

export function canonicalOppStatus(legacy: string): OppStatus | null {
  return LEGACY_OPP_STATUS[legacy] ?? null;
}

/**
 * `traveller_accepted` is the one that matters. It currently means "guest
 * accepted an offer", which in the agreed model is the moment a Booking is
 * created and the Opportunity becomes `converted`. If the admin is using it
 * as a resting state, opportunities are sitting in a status with no booking
 * behind them and the Commission screen will never see them.
 */
export const MIGRATION_SQL = `
-- 1. Add the canonical enum values if the column is text today.
--    If it is already an enum, ALTER TYPE ... ADD VALUE for each missing one.

-- 2. Rewrite in place.
UPDATE "Opportunity" SET status = 'verifying'   WHERE status = 'verification_pending';
UPDATE "Opportunity" SET status = 'verified'    WHERE status = 'awaiting_route';
UPDATE "Opportunity" SET status = 'routed'      WHERE status = 'awaiting_hotel';
UPDATE "Opportunity" SET status = 'offers_live' WHERE status = 'offer_sent';
UPDATE "Opportunity" SET status = 'converted'   WHERE status = 'traveller_accepted';

-- 3. Anything left unmapped is a bug. This must return zero rows.
SELECT DISTINCT status FROM "Opportunity"
WHERE status NOT IN ('created','verifying','verified','routed','offers_live',
                     'converted','no_offers','abandoned','expired');

-- 4. Every 'converted' opportunity must have a booking behind it.
--    Non-zero here means guests accepted offers that never became bookings.
SELECT o.id, o."oppCode"
FROM "Opportunity" o
LEFT JOIN "OpportunityHotel" oh ON oh."opportunityId" = o.id
LEFT JOIN "Offer" f  ON f."opportunityHotelId" = oh.id
LEFT JOIN "Booking" b ON b."offerId" = f.id
WHERE o.status = 'converted' AND b.id IS NULL;
`;
