/**
 * Dashboard metrics.
 *
 * The tiles currently shown are all counts of things sitting still. The two
 * numbers that actually decide whether the pilot is working — offer coverage
 * and median hotel response — are not on the screen. Everything else is
 * downstream of them.
 */

export type TileSpec = {
  key: string;
  label: string;
  /** Raw SQL so the definition is unambiguous and auditable. */
  sql: string;
  /** Shown under the number. A tile nobody can interpret gets ignored. */
  hint: string;
  target?: string;
};

const LAST_7_DAYS = `"sentAt" >= now() - interval '7 days'`;

export const TILES: TileSpec[] = [
  {
    key: "offer_coverage",
    label: "Offer coverage, 7d",
    hint: "Routed requests that got at least one offer",
    target: "≥78%",
    sql: `
      SELECT round(100.0 * count(*) FILTER (WHERE has_offer) / nullif(count(*),0), 1) AS pct
      FROM (
        SELECT o.id, bool_or(oh.outcome = 'offer_made') AS has_offer
        FROM "Opportunity" o
        JOIN "OpportunityHotel" oh ON oh."opportunityId" = o.id
        WHERE o.status IN ('routed','offers_live','converted','no_offers')
          AND o."createdAt" >= now() - interval '7 days'
        GROUP BY o.id
      ) t`,
  },
  {
    key: "median_response",
    label: "Median hotel response, 7d",
    hint: "Time from request sent to offer or decline",
    target: "<4 min",
    sql: `
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "responseSeconds") AS seconds
      FROM "OpportunityHotel"
      WHERE "responseSeconds" IS NOT NULL AND ${LAST_7_DAYS}`,
  },
  {
    key: "silent_hotels",
    label: "Silent hotels, 7d",
    hint: "Live hotels that answered nothing this week",
    target: "0",
    sql: `
      SELECT count(*) FROM "Hotel" h
      WHERE h.status = 'live' AND NOT EXISTS (
        SELECT 1 FROM "OpportunityHotel" oh
        WHERE oh."hotelId" = h.id AND oh."respondedAt" IS NOT NULL AND ${LAST_7_DAYS}
      )`,
  },
  {
    key: "attestation_open",
    label: "Attestation open",
    hint: "One side has confirmed payment, waiting on the other",
    sql: `
      SELECT count(*) FROM "Payment" p
      JOIN "Booking" b ON b.id = p."bookingId"
      WHERE b.status = 'payment_pending'
        AND (p."guestAttestedAt" IS NULL) <> (p."hotelAttestedAt" IS NULL)`,
  },
  {
    key: "paid_not_confirmed",
    label: "Paid · not confirmed",
    hint: "Guest has paid and does not know if they have a room",
    target: "0 — page ops",
    sql: `
      SELECT count(*) FROM "Booking"
      WHERE status = 'payment_received'
        AND "confirmedAt" IS NULL
        AND "createdAt" < now() - interval '5 minutes'`,
  },
  {
    key: "commission_due",
    label: "Commission due",
    hint: "Accrued and invoiced, not yet paid",
    sql: `
      SELECT coalesce(sum("totalPaise"),0) FROM "CommissionEntry"
      WHERE status IN ('accrued','invoiced')`,
  },
  {
    key: "commission_overdue",
    label: "Overdue commission",
    hint: "Invoiced past due date — pause requests at 14 days",
    sql: `
      SELECT coalesce(sum(i."totalPaise"),0) FROM "Invoice" i
      WHERE i.status IN ('issued','partly_paid') AND i."dueDate" < current_date`,
  },
  {
    key: "live_with_sheet",
    label: "Live hotels with a rate sheet",
    hint: "Instant quoting only works where a sheet is active",
    target: "all of them",
    sql: `
      SELECT count(*) FILTER (WHERE s.id IS NOT NULL) || ' / ' || count(*)
      FROM "Hotel" h
      LEFT JOIN "RateSheet" s
        ON s."hotelId" = h.id AND s.status = 'active' AND s."expiresAt" > now()
      WHERE h.status = 'live'`,
  },
  {
    key: "open_exceptions",
    label: "Open exceptions",
    hint: "Real problems only — progress events live in the log",
    sql: `SELECT count(*) FROM "Exception" WHERE status = 'open'`,
  },
];

/**
 * The attestation work queue. In manual settlement this is the single most
 * important operational screen and it does not exist yet — the dashboard
 * counts these but offers nowhere to work them.
 */
export const ATTESTATION_QUEUE_SQL = `
SELECT
  b."bookingRef",
  h."displayName"                AS hotel,
  g.name                         AS guest,
  g."phoneE164"                  AS guest_phone,
  b."grossCollectedPaise",
  p.utr,
  p."guestAttestedAt",
  p."hotelAttestedAt",
  CASE
    WHEN p."guestAttestedAt" IS NOT NULL AND p."hotelAttestedAt" IS NULL THEN 'waiting_hotel'
    WHEN p."guestAttestedAt" IS NULL AND p."hotelAttestedAt" IS NOT NULL THEN 'waiting_guest'
    ELSE 'waiting_both'
  END                            AS waiting_on,
  extract(epoch FROM now() - b."createdAt")::int AS age_seconds,
  c."phoneE164"                  AS desk_phone
FROM "Booking" b
JOIN "Payment" p ON p."bookingId" = b.id
JOIN "Hotel" h   ON h.id = b."hotelId"
JOIN "Guest" g   ON g.id = b."guestId"
LEFT JOIN "HotelContact" c
  ON c."hotelId" = h.id AND c.role = 'front_desk' AND c."isPrimary"
WHERE b.status IN ('payment_pending','payment_received')
ORDER BY age_seconds DESC;
`;

/** Per-hotel scorecard — the conversation to have at the weekly review. */
export const HOTEL_SCORECARD_SQL = `
SELECT
  h."displayName",
  h.belt,
  count(oh.*)                                             AS requests_30d,
  count(*) FILTER (WHERE oh.outcome = 'offer_made')        AS offers,
  count(*) FILTER (WHERE oh.outcome = 'no_response')       AS silent,
  round(100.0 * count(*) FILTER (WHERE oh.outcome = 'offer_made')
        / nullif(count(oh.*),0), 1)                        AS offer_rate_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY oh."responseSeconds") AS median_seconds,
  count(DISTINCT b.id) FILTER (WHERE b.status IN ('checked_in','completed')) AS stays,
  coalesce(sum(ce."totalPaise") FILTER (WHERE ce.status = 'paid'),0)         AS commission_paid
FROM "Hotel" h
LEFT JOIN "OpportunityHotel" oh
  ON oh."hotelId" = h.id AND oh."sentAt" >= now() - interval '30 days'
LEFT JOIN "Booking" b        ON b."hotelId" = h.id
LEFT JOIN "CommissionEntry" ce ON ce."hotelId" = h.id
WHERE h.status = 'live'
GROUP BY h.id, h."displayName", h.belt
ORDER BY offer_rate_pct DESC NULLS LAST;
`;

export function formatTileValue(key: string, raw: number | string | null): string {
  if (raw === null) return "—";
  if (key === "median_response") {
    const s = Number(raw);
    return s < 60 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`;
  }
  if (key === "offer_coverage") return `${raw}%`;
  if (key.startsWith("commission")) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(raw) / 100);
  }
  return String(raw);
}
