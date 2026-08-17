import {
  DESTINATIONS,
  computeBreakup,
  formatINR,
  generateBookingRef,
  generateUniqueCheckInCode,
  payoutAdviceLines,
  evaluateAttestation,
  planFor,
  dueEscalations,
  assertTransition,
  canGoLive,
  formatTileValue,
  generateOppCode,
  isEnumerableOppCode,
  payoutsScreenCopy,
  financialYear,
  type Breakup,
  type Destination,
  type SettlementMode,
  type BookingStatus,
  type CommercialMode,
  type GatewayBorneBy,
  isWithinBookingWindow,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";
import { maskMobile } from "../lib/crypto.js";
import { config } from "../config.js";
import { listOpenExceptions } from "./opportunity.js";

function breakupToJson(b: Breakup) {
  return {
    gross_collected_paise: b.grossCollectedPaise.toString(),
    base_tariff_paise: b.baseTariffPaise.toString(),
    room_gst_paise: b.roomGstPaise.toString(),
    commission_paise: b.commissionPaise.toString(),
    commission_gst_paise: b.commissionGstPaise.toString(),
    cgst_paise: b.cgstPaise.toString(),
    sgst_paise: b.sgstPaise.toString(),
    igst_paise: b.igstPaise.toString(),
    gateway_fee_paise: b.gatewayFeePaise.toString(),
    gateway_borne_by: b.gatewayBorneBy,
    tcs_paise: b.tcsPaise.toString(),
    tcs_rate_bps: b.tcsRateBps,
    commercial_mode: b.commercialMode,
    platform_turnover_paise: b.platformTurnoverPaise.toString(),
    net_payout_paise: b.netPayoutPaise.toString(),
    platform_net_paise: b.platformNetPaise.toString(),
    advice: payoutAdviceLines(b).map((l) => ({
      label: l.label,
      amount: formatINR(l.paise),
      negative: !!l.negative,
    })),
  };
}

function hotelMoneyOpts(row: Record<string, unknown>) {
  return {
    roomGstRateBps: Number(row.gst_rate_bps ?? row.room_gst_rate_bps ?? 1800),
    commissionRateBps: Number(row.commission_pct_bps ?? row.commission_rate_bps ?? 1200),
    gatewayBorneBy: (row.gateway_borne_by as GatewayBorneBy) || "hotel",
    tcsBps: Number(row.tcs_bps ?? row.tcs_rate_bps ?? 0),
    commercialMode: ((row.commercial_mode as CommercialMode) || "agent") as CommercialMode,
  };
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || `hotel-${Date.now().toString(36)}`;
}

async function recordEvent(
  client: { query: typeof pool.query },
  args: {
    opportunityId: string;
    externalId: string;
    eventType: string;
    actorId: string;
    previous: string;
    next: string;
    payload?: Record<string, unknown>;
  }
) {
  await client.query(
    `INSERT INTO opportunity_events (
       opportunity_id, event_type, actor_type, actor_id, source_system,
       previous_status, new_status, idempotency_key, payload
     ) VALUES ($1,$2,'admin',$3,'direct',$4,$5,$6,$7::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      args.opportunityId,
      args.eventType,
      args.actorId,
      args.previous,
      args.next,
      `${args.externalId}:${args.eventType}:${args.next}:${Date.now()}`,
      JSON.stringify(args.payload ?? {}),
    ]
  );
}

export async function adminOverview() {
  const counts = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('settled','cancelled','abandoned','expired'))::int AS open_opps,
       COUNT(*) FILTER (WHERE status IN ('routed','hotel_notified','verified','qualified'))::int AS awaiting_hotel,
       COUNT(*) FILTER (WHERE status IN ('offer_sent','offers_live'))::int AS accept_window,
       COUNT(*) FILTER (WHERE status = 'commission_due')::int AS commission_due,
       COUNT(*) FILTER (WHERE status IN ('converted','traveller_accepted'))::int AS awaiting_confirm,
       COUNT(*) FILTER (
         WHERE attestation_entered_at IS NOT NULL
           AND (guest_attested_at IS NULL OR hotel_attested_at IS NULL)
           AND booking_status IS DISTINCT FROM 'confirmed'
           AND booking_status IS DISTINCT FROM 'checked_in'
       )::int AS attestation_pending,
       COUNT(*) FILTER (WHERE booking_status = 'payment_received')::int AS paid_not_confirmed
     FROM opportunities`
  );
  const hotels = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'live')::int AS live,
       COUNT(*) FILTER (
         WHERE status = 'live' AND EXISTS (
           SELECT 1 FROM rate_sheets s
           WHERE s.hotel_id = hotels.id AND s.status = 'active' AND s.expires_at > NOW()
         )
       )::int AS live_with_sheet,
       COUNT(*) FILTER (WHERE instant_quote_enabled AND status = 'live')::int AS instant_quote
     FROM hotels`
  );
  const exceptions = await pool.query(
    `SELECT COUNT(*)::int AS n FROM desk_exceptions
     WHERE status IN ('open','in_progress')
       AND exception_type NOT IN ('offer_accepted_handoff','verified_awaiting_route')`
  );
  const templates = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
     FROM whatsapp_templates`
  );

  const coverage = await pool.query(
    `SELECT round(100.0 * count(*) FILTER (WHERE has_offer) / nullif(count(*),0), 1) AS pct
     FROM (
       SELECT o.id, bool_or(oh.outcome = 'offer_made') AS has_offer
       FROM opportunities o
       JOIN opportunity_hotels oh ON oh.opportunity_id = o.id
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       WHERE o.created_at >= NOW() - interval '7 days'
         AND tr.destination = 'Goa'
         AND o.status IN ('routed','hotel_notified','offer_received','offer_sent','offers_live',
                          'converted','traveller_accepted','hotel_confirmed','no_offers',
                          'commission_due','settled')
       GROUP BY o.id
     ) t`
  );
  const median = await pool.query(
    `SELECT percentile_cont(0.5) WITHIN GROUP (
       ORDER BY EXTRACT(EPOCH FROM (oh.responded_at - oh.sent_at))
     ) AS seconds
     FROM opportunity_hotels oh
     WHERE oh.responded_at IS NOT NULL
       AND oh.sent_at >= NOW() - interval '7 days'`
  );
  const silent = await pool.query(
    `SELECT count(*)::int AS n FROM hotels h
     WHERE h.status = 'live' AND NOT EXISTS (
       SELECT 1 FROM opportunity_hotels oh
       WHERE oh.hotel_id = h.id
         AND oh.responded_at IS NOT NULL
         AND oh.sent_at >= NOW() - interval '7 days'
     )`
  );
  const commissionDue = await pool.query(
    `SELECT coalesce(sum(total_paise),0)::bigint AS paise
     FROM commission_entries
     WHERE status IN ('due','accrued','invoiced')`
  );

  const coveragePct = coverage.rows[0]?.pct != null ? Number(coverage.rows[0].pct) : null;
  const medianSec = median.rows[0]?.seconds != null ? Number(median.rows[0].seconds) : null;

  return {
    opportunities: counts.rows[0],
    hotels: hotels.rows[0],
    open_exceptions: exceptions.rows[0]?.n ?? 0,
    templates: templates.rows[0] ?? { total: 0, approved: 0 },
    tiles: {
      offer_coverage: {
        label: "Offer coverage, 7d",
        value: formatTileValue("offer_coverage", coveragePct),
        raw: coveragePct,
        hint: "Routed Goa requests that got at least one offer",
        target: "≥78%",
      },
      median_response: {
        label: "Median hotel response, 7d",
        value: formatTileValue("median_response", medianSec),
        raw: medianSec,
        hint: "Time from request sent to offer or decline",
        target: "<4 min",
      },
      silent_hotels: {
        label: "Silent hotels, 7d",
        value: formatTileValue("silent_hotels", silent.rows[0]?.n ?? 0),
        raw: Number(silent.rows[0]?.n ?? 0),
        hint: "Live hotels that answered nothing this week",
        target: "0",
      },
      commission_due: {
        label: "Commission due",
        value: formatTileValue("commission_due", Number(commissionDue.rows[0]?.paise ?? 0)),
        raw: Number(commissionDue.rows[0]?.paise ?? 0),
        hint: "Accrued / invoiced, not yet paid",
      },
      live_with_sheet: {
        label: "Live hotels with a rate sheet",
        value: `${hotels.rows[0]?.live_with_sheet ?? 0} / ${hotels.rows[0]?.live ?? 0}`,
        raw: hotels.rows[0]?.live_with_sheet ?? 0,
        hint: "Instant quoting only works where a sheet is active",
        target: "all of them",
      },
    },
    settlement: {
      mode: "direct_to_hotel" as const,
      payouts_copy: payoutsScreenCopy("direct_to_hotel"),
    },
    system: {
      otp_provider: config.otp.provider,
      asavari_sync: config.asavari.syncEnabled,
      openai: {
        configured: Boolean(config.openai.apiKey),
        model: config.openai.model,
      },
      settlement_default: "direct_to_hotel",
      booking_window_hours: 48,
    },
  };
}

export async function listAttestationQueue() {
  const result = await pool.query(
    `SELECT
       o.external_opportunity_id,
       o.hotel_booking_ref,
       o.booking_status,
       o.gross_collected_paise,
       o.payment_utr AS utr,
       o.guest_attested_at,
       o.hotel_attested_at,
       o.attestation_entered_at,
       h.display_name AS hotel,
       tr.name AS guest,
       tr.mobile AS guest_phone,
       CASE
         WHEN o.guest_attested_at IS NOT NULL AND o.hotel_attested_at IS NULL THEN 'waiting_hotel'
         WHEN o.guest_attested_at IS NULL AND o.hotel_attested_at IS NOT NULL THEN 'waiting_guest'
         ELSE 'waiting_both'
       END AS waiting_on,
       EXTRACT(EPOCH FROM NOW() - COALESCE(o.attestation_entered_at, o.updated_at))::int AS age_seconds,
       (
         SELECT c.phone_e164 FROM hotel_contacts c
         WHERE c.hotel_id = h.id
           AND c.archived_at IS NULL
           AND c.role IN ('front_desk','night_desk','manager')
         ORDER BY CASE c.role WHEN 'front_desk' THEN 0 WHEN 'night_desk' THEN 1 ELSE 2 END,
                  c.is_primary DESC
         LIMIT 1
       ) AS desk_phone
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     WHERE o.booking_status IN ('payment_pending','payment_received')
        OR (
          o.attestation_entered_at IS NOT NULL
          AND (o.guest_attested_at IS NULL OR o.hotel_attested_at IS NULL)
          AND o.booking_status IS DISTINCT FROM 'confirmed'
          AND o.booking_status IS DISTINCT FROM 'checked_in'
        )
     ORDER BY age_seconds DESC NULLS LAST
     LIMIT 100`
  );
  return result.rows.map((r) => ({
    ...r,
    gross_collected_paise: r.gross_collected_paise != null ? Number(r.gross_collected_paise) : null,
    guest_phone_masked: maskMobile(String(r.guest_phone ?? "")),
  }));
}

/** Regenerate enumerable OPP-YYYYMMDD-NNNN codes. Keeps old value in legacy_opp_code. */
export async function backfillEnumerableOppCodes(limit = 500) {
  const rows = await pool.query(
    `SELECT id, external_opportunity_id
     FROM opportunities
     WHERE legacy_opp_code IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  let regenerated = 0;
  let skipped = 0;
  for (const row of rows.rows) {
    const current = String(row.external_opportunity_id);
    if (!isEnumerableOppCode(current)) {
      skipped += 1;
      continue;
    }
    let next: string | null = null;
    for (let i = 0; i < 8; i++) {
      const candidate = generateOppCode();
      if (isEnumerableOppCode(candidate)) continue;
      const hit = await pool.query(
        `SELECT 1 FROM opportunities WHERE external_opportunity_id = $1`,
        [candidate]
      );
      if (!hit.rowCount) {
        next = candidate;
        break;
      }
    }
    if (!next) continue;
    await pool.query(
      `UPDATE opportunities
       SET legacy_opp_code = $1,
           external_opportunity_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [current, next, row.id]
    );
    regenerated += 1;
  }
  return { scanned: rows.rowCount ?? 0, regenerated, skipped_non_enumerable: skipped };
}

export async function listAdminOpportunities(filter: {
  status?: string;
  destination?: Destination;
  q?: string;
}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`o.status = $${params.length}`);
  }
  if (filter.destination) {
    params.push(filter.destination);
    where.push(`tr.destination = $${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(
      `(o.external_opportunity_id ILIKE $${params.length} OR tr.name ILIKE $${params.length} OR tr.requested_property ILIKE $${params.length})`
    );
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT o.external_opportunity_id, o.public_token, o.status, o.priority, o.booking_status,
            o.created_at, o.updated_at, o.hotel_booking_ref, o.mobile_shared_at,
            o.offer_request_deadline_at, o.accept_deadline_at,
            tr.name, tr.mobile, tr.destination, tr.requested_area, tr.requested_property,
            tr.check_in, tr.check_out, tr.otp_verified_at,
            h.id AS hotel_id, h.display_name AS hotel_name,
            (
              SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY oh.response_seconds)
              FROM opportunity_hotels oh
              WHERE oh.opportunity_id = o.id AND oh.response_seconds IS NOT NULL
            ) AS median_response_seconds,
            (
              SELECT count(*) FROM opportunity_hotels oh WHERE oh.opportunity_id = o.id
            ) AS hotels_routed,
            (
              SELECT count(*) FROM opportunity_hotels oh
              WHERE oh.opportunity_id = o.id AND oh.responded_at IS NOT NULL
            ) AS hotels_responded
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     ${clause}
     ORDER BY o.updated_at DESC
     LIMIT 150`,
    params
  );
  return result.rows.map((row) => ({
    external_opportunity_id: row.external_opportunity_id,
    public_token: row.public_token,
    status: row.status,
    booking_status: row.booking_status,
    priority: row.priority,
    destination: row.destination,
    traveller_name: row.name,
    mobile_masked: maskMobile(String(row.mobile)),
    requested_property: row.requested_property,
    requested_area: row.requested_area,
    check_in: row.check_in,
    check_out: row.check_out,
    otp_verified: Boolean(row.otp_verified_at),
    hotel_id: row.hotel_id,
    hotel_name: row.hotel_name,
    hotel_booking_ref: row.hotel_booking_ref,
    mobile_shared: Boolean(row.mobile_shared_at),
    outside_booking_window: !isWithinBookingWindow(new Date(String(row.check_in))),
    median_response_seconds:
      row.median_response_seconds != null ? Number(row.median_response_seconds) : null,
    hotels_routed: Number(row.hotels_routed ?? 0),
    hotels_responded: Number(row.hotels_responded ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function getAdminOpportunity(externalId: string) {
  const result = await pool.query(
    `SELECT o.*, tr.name, tr.mobile, tr.email, tr.destination, tr.requested_area,
            tr.requested_property, tr.check_in, tr.check_out, tr.rooms, tr.adults, tr.children,
            tr.public_rate_paise, tr.budget_paise, tr.preferences, tr.special_request,
            tr.otp_verified_at, tr.consent_version,
            h.display_name AS hotel_name, h.status AS hotel_status, h.commission_pct_bps,
            h.gst_rate_bps, h.gateway_borne_by, h.legal_name, h.gstin, h.tcs_bps, h.commercial_mode,
            h.upi_vpa AS hotel_upi_vpa, h.payment_note AS hotel_payment_note, h.notify_whatsapp
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     WHERE o.external_opportunity_id = $1`,
    [externalId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const events = await pool.query(
    `SELECT event_type, occurred_at, actor_type, actor_id, previous_status, new_status, payload
     FROM opportunity_events WHERE opportunity_id = $1
     ORDER BY occurred_at ASC`,
    [row.id]
  );
  const offer = await pool.query(
    `SELECT offer_id, offer_version, hotel_name, room_type, occupancy, total_amount_paise,
            currency, inclusions, cancellation_terms, valid_until, status, source,
            rate_sheet_id, rate_sheet_row_id, tariff_per_night_paise, nights, holds_until
     FROM offers_cache WHERE opportunity_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [row.id]
  );
  const code = await pool.query(
    `SELECT display_code, code, issued_at, expires_at, redeemed_at, failed_attempts
     FROM booking_codes WHERE opportunity_id = $1`,
    [row.id]
  );
  const routed = await pool.query(
    `SELECT oh.*, h.display_name AS hotel_name, h.instant_quote_enabled, h.gstin,
            h.gst_rate_bps, h.status AS hotel_status
     FROM opportunity_hotels oh
     JOIN hotels h ON h.id = oh.hotel_id
     WHERE oh.opportunity_id = $1
     ORDER BY oh.sent_at ASC`,
    [row.id]
  );
  const payments = await pool.query(
    `SELECT id, provider, amount_paise, status, captured_at, created_at, utr,
            guest_attested_at, hotel_attested_at
     FROM payments WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [row.id]
  );
  const payouts = await pool.query(
    `SELECT id, trigger, amount_paise, status, settled_at, created_at
     FROM payouts WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [row.id]
  );
  const commission = await pool.query(
    `SELECT id, status, commission_paise, total_paise, accrued_at, invoice_id
     FROM commission_entries WHERE opportunity_id = $1 LIMIT 1`,
    [row.id]
  );
  const money =
    row.gross_collected_paise != null
      ? {
          gross_collected_paise: Number(row.gross_collected_paise),
          base_tariff_paise: Number(row.base_tariff_paise),
          room_gst_rate_bps: row.room_gst_rate_bps,
          room_gst_paise: Number(row.room_gst_paise),
          commission_rate_bps: row.commission_rate_bps,
          commission_paise: Number(row.commission_paise),
          commission_gst_paise: Number(row.commission_gst_paise),
          gateway_fee_paise: Number(row.gateway_fee_paise),
          gateway_borne_by: row.gateway_borne_by,
          tcs_paise: Number(row.tcs_paise ?? 0),
          tcs_rate_bps: Number(row.tcs_rate_bps ?? 0),
          commercial_mode: row.commercial_mode || "agent",
          platform_turnover_paise: Number(row.platform_turnover_paise ?? 0),
          net_payout_paise: Number(row.net_payout_paise),
          snapshotted_at: row.money_snapshotted_at,
          advice: payoutAdviceLines(
            computeBreakup({
              grossCollectedPaise: BigInt(row.gross_collected_paise),
              roomGstRateBps: Number(row.room_gst_rate_bps ?? 1800),
              commissionRateBps: Number(row.commission_rate_bps ?? 1200),
              gatewayBorneBy: (row.gateway_borne_by as GatewayBorneBy) || "hotel",
              tcsBps: Number(row.tcs_rate_bps ?? 0),
              commercialMode: (row.commercial_mode as CommercialMode) || "agent",
            })
          ).map((l) => ({
            label: l.label,
            amount: formatINR(l.paise),
            negative: !!l.negative,
          })),
        }
      : null;
  const mode = (String(row.settlement_mode || "direct_to_hotel") as SettlementMode);
  const plan = planFor(mode);
  const guestAt = row.guest_attested_at ? new Date(row.guest_attested_at) : null;
  const hotelAt = row.hotel_attested_at ? new Date(row.hotel_attested_at) : null;
  const enteredAt = row.attestation_entered_at
    ? new Date(row.attestation_entered_at)
    : guestAt || hotelAt;
  const attestation_verdict = enteredAt
    ? evaluateAttestation(
        { guestAttestedAt: guestAt, hotelAttestedAt: hotelAt, utr: row.payment_utr ?? null },
        enteredAt
      )
    : null;

  const escalationDone = Array.isArray(row.escalation_done)
    ? row.escalation_done.map(String)
    : [];
  const earliestSent = routed.rows[0]?.sent_at
    ? new Date(routed.rows[0].sent_at)
    : null;
  const escalations_due = earliestSent
    ? dueEscalations(earliestSent, escalationDone as Array<"remind_whatsapp" | "call_desk" | "call_owner" | "widen_search">)
    : [];

  return {
    opportunity: {
      id: row.id,
      external_opportunity_id: row.external_opportunity_id,
      public_token: row.public_token,
      status: row.status,
      booking_status: row.booking_status,
      domain_opp_status: row.domain_opp_status,
      destination: row.destination,
      traveller_name: row.name,
      mobile: row.mobile,
      mobile_masked: maskMobile(String(row.mobile)),
      email: row.email,
      requested_area: row.requested_area,
      requested_property: row.requested_property,
      check_in: row.check_in,
      check_out: row.check_out,
      rooms: row.rooms,
      adults: row.adults,
      children: row.children,
      public_rate_paise: row.public_rate_paise,
      budget_paise: row.budget_paise,
      special_request: row.special_request,
      otp_verified: Boolean(row.otp_verified_at),
      hotel_id: row.hotel_id,
      hotel_name: row.hotel_name,
      hotel_status: row.hotel_status,
      hotel_gstin: row.gstin,
      hotel_legal_name: row.legal_name,
      hotel_upi_vpa: row.hotel_upi_vpa ?? null,
      hotel_payment_note: row.hotel_payment_note ?? null,
      hotel_notify_whatsapp: row.notify_whatsapp ?? null,
      commission_pct_bps: row.commission_pct_bps,
      hotel_booking_ref: row.hotel_booking_ref,
      asavari_booking_ref: row.asavari_booking_ref,
      mobile_shared_at: row.mobile_shared_at,
      offer_request_deadline_at: row.offer_request_deadline_at,
      accept_deadline_at: row.accept_deadline_at,
      checked_in_at: row.checked_in_at,
      settlement_mode: mode,
      payment_utr: row.payment_utr,
      guest_attested_at: row.guest_attested_at,
      hotel_attested_at: row.hotel_attested_at,
      attestation_entered_at: row.attestation_entered_at,
      payment_receipt_number: row.payment_receipt_number,
      payment_receipt_issued_at: row.payment_receipt_issued_at,
      payment_receipt: row.payment_receipt_json ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    settlement: {
      mode,
      plan,
      attestation_verdict,
      escalations_due,
      escalation_done: escalationDone,
    },
    money,
    booking_code: code.rows[0]
      ? {
          display: code.rows[0].display_code,
          issued_at: code.rows[0].issued_at,
          expires_at: code.rows[0].expires_at,
          redeemed_at: code.rows[0].redeemed_at,
          failed_attempts: code.rows[0].failed_attempts,
        }
      : null,
    offer: offer.rows[0]
      ? {
          ...offer.rows[0],
          total_amount_paise: Number(offer.rows[0].total_amount_paise),
        }
      : null,
    routed_hotels: routed.rows,
    payments: payments.rows.map((p) => ({
      ...p,
      amount_paise: Number(p.amount_paise),
    })),
    payouts: payouts.rows.map((p) => ({
      ...p,
      amount_paise: Number(p.amount_paise),
    })),
    commission: commission.rows[0]
      ? {
          ...commission.rows[0],
          commission_paise: Number(commission.rows[0].commission_paise),
          total_paise: Number(commission.rows[0].total_paise ?? 0),
        }
      : null,
    events: events.rows,
  };
}

export async function assignHotel(externalId: string, hotelId: string, actorId: string) {
  const hotel = await pool.query(`SELECT * FROM hotels WHERE id = $1`, [hotelId]);
  if (!hotel.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, tr.requested_property FROM opportunities o
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    const status = "hotel_notified";
    const deadline = new Date(Date.now() + 10 * 60 * 1000);
    await client.query(
      `UPDATE opportunities
       SET hotel_id = $1, status = $2, offer_request_deadline_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [hotelId, status, deadline.toISOString(), row.id]
    );
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "route.sent",
      actorId,
      previous: row.status,
      next: status,
      payload: { hotel_id: hotelId, hotel_name: hotel.rows[0].display_name },
    });
    return { status, hotel_id: hotelId, offer_request_deadline_at: deadline.toISOString() };
  });
}

export async function recordPrivateOffer(
  externalId: string,
  input: {
    hotel_name?: string;
    room_type: string;
    occupancy: string;
    total_amount_paise: number;
    inclusions?: string;
    cancellation_terms?: string;
  },
  actorId: string
) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, h.display_name AS hotel_name
       FROM opportunities o
       LEFT JOIN hotels h ON h.id = o.hotel_id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    const versionRes = await client.query(
      `SELECT COALESCE(MAX(offer_version), 0)::int AS v FROM offers_cache WHERE opportunity_id = $1`,
      [row.id]
    );
    const version = Number(versionRes.rows[0]?.v ?? 0) + 1;
    const offerId = `OFR-${externalId}-v${version}`;
    const hotelName = input.hotel_name || row.hotel_name || "Hotel";
    const validUntil = new Date(Date.now() + 10 * 60 * 1000);
    await client.query(
      `UPDATE offers_cache SET status = 'superseded', updated_at = NOW()
       WHERE opportunity_id = $1 AND status IN ('ready','sent')`,
      [row.id]
    );
    await client.query(
      `INSERT INTO offers_cache (
         opportunity_id, offer_id, offer_version, hotel_name, room_type, occupancy,
         total_amount_paise, currency, tax_fee_treatment, inclusions,
         cancellation_terms, valid_until, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'INR','Taxes included',$8,$9,$10,'sent')`,
      [
        row.id,
        offerId,
        version,
        hotelName,
        input.room_type,
        input.occupancy,
        input.total_amount_paise,
        input.inclusions ?? "",
        input.cancellation_terms ?? "",
        validUntil.toISOString(),
      ]
    );
    await client.query(
      `UPDATE opportunities
       SET status = 'offer_sent', accept_deadline_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [validUntil.toISOString(), row.id]
    );
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "offer.issued",
      actorId,
      previous: row.status,
      next: "offer_sent",
      payload: { offer_id: offerId, total_amount_paise: input.total_amount_paise },
    });
    return { offer_id: offerId, status: "offer_sent", accept_deadline_at: validUntil.toISOString() };
  });
}

export async function markPaid(externalId: string, actorId: string) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, oc.total_amount_paise
       FROM opportunities o
       LEFT JOIN LATERAL (
         SELECT total_amount_paise FROM offers_cache
         WHERE opportunity_id = o.id AND status IN ('accepted','sent','ready')
         ORDER BY created_at DESC LIMIT 1
       ) oc ON TRUE
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    const amount = Number(row.total_amount_paise ?? row.gross_collected_paise ?? 0);
    const idem = `${externalId}:payment:manual:${amount}`;
    const now = new Date().toISOString();

    await client.query(
      `INSERT INTO payments (
         opportunity_id, provider, amount_paise, method, status, captured_at,
         idempotency_key, guest_attested_at, hotel_attested_at
       ) VALUES ($1,'manual',$2,'other','captured',NOW(),$3,$4,$4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [row.id, amount || 0, idem, now]
    );

    // Ops override: both sides attested so dual-attestation path is satisfied
    await client.query(
      `UPDATE opportunities
       SET mobile_shared_at = COALESCE(mobile_shared_at, NOW()),
           booking_status = 'payment_received',
           booking_entered_payment_received_at = COALESCE(booking_entered_payment_received_at, NOW()),
           guest_attested_at = COALESCE(guest_attested_at, $1::timestamptz),
           hotel_attested_at = COALESCE(hotel_attested_at, $1::timestamptz),
           attestation_entered_at = COALESCE(attestation_entered_at, $1::timestamptz),
           updated_at = NOW()
       WHERE id = $2`,
      [now, row.id]
    );
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "payment.settled",
      actorId,
      previous: row.status,
      next: row.status,
      payload: {
        mobile_shared: true,
        amount_paise: amount,
        provider: "manual",
        attestation: "ops_override",
      },
    });
    return {
      mobile_shared_at: new Date().toISOString(),
      booking_status: "payment_received",
      amount_paise: amount,
    };
  });
}

export async function confirmBooking(externalId: string, hotelBookingRef: string | null, actorId: string) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, tr.check_out, h.commission_pct_bps, h.gst_rate_bps, h.gateway_borne_by,
              h.tcs_bps, h.commercial_mode
       FROM opportunities o
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       LEFT JOIN hotels h ON h.id = o.hotel_id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    const fromBooking = (row.booking_status as BookingStatus | null) || null;
    if (fromBooking === "confirmed" || fromBooking === "checked_in" || fromBooking === "completed") {
      // already past confirm — return existing code if any
    } else if (fromBooking === "payment_received") {
      assertTransition("payment_received", "confirmed");
    } else {
      throw Object.assign(
        new Error(
          "Confirm requires booking_status payment_received (complete UTR + hotel attest, or ops mark paid)"
        ),
        { status: 422 }
      );
    }

    const offer = await client.query(
      `SELECT total_amount_paise FROM offers_cache
       WHERE opportunity_id = $1 AND status IN ('accepted','sent','ready')
       ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    );
    const gross = BigInt(offer.rows[0]?.total_amount_paise ?? 0);
    if (gross <= 0n) {
      throw Object.assign(new Error("Record a private offer with amount before confirming"), {
        status: 422,
      });
    }

    const moneyOpts = hotelMoneyOpts(row);
    const breakup = computeBreakup({
      grossCollectedPaise: gross,
      ...moneyOpts,
    });

    const ref = hotelBookingRef?.trim() || generateBookingRef();
    const checkOut = new Date(row.check_out);
    const expiresAt = new Date(checkOut.getTime() + 24 * 3600_000);
    const checkIn = await generateUniqueCheckInCode(async (stored) => {
      const hit = await client.query(`SELECT 1 FROM booking_codes WHERE code = $1`, [stored]);
      return Boolean(hit.rowCount);
    });

    const codeRow = await client.query(
      `INSERT INTO booking_codes (opportunity_id, code, display_code, expires_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (opportunity_id) DO UPDATE
       SET code = EXCLUDED.code, display_code = EXCLUDED.display_code,
           expires_at = EXCLUDED.expires_at, issued_at = NOW(), redeemed_at = NULL
       RETURNING id, display_code`,
      [row.id, checkIn.stored, checkIn.display, expiresAt.toISOString()]
    );

    const receiptPayload = {
      kind: "platform_payment_receipt",
      note: "HotelRADAR coordination receipt — hotel issues the tax invoice for the room tariff",
      opportunity_id: externalId,
      hotel_booking_ref: ref,
      gross_collected: formatINR(breakup.grossCollectedPaise),
      base_tariff: formatINR(breakup.baseTariffPaise),
      room_gst: formatINR(breakup.roomGstPaise),
      utr: row.payment_utr ?? null,
      issued_at: new Date().toISOString(),
    };
    const receiptNumber =
      row.payment_receipt_number ||
      `HRD-RCP/${financialYear()}/${String(externalId).replace(/^OPP-/, "").replace(/-/g, "").slice(-8).toUpperCase()}`;

    await client.query(
      `UPDATE opportunities
       SET status = 'hotel_confirmed',
           booking_status = 'confirmed',
           hotel_booking_ref = $1,
           check_in_code_id = $2,
           gross_collected_paise = $3,
           base_tariff_paise = $4,
           room_gst_rate_bps = $5,
           room_gst_paise = $6,
           commission_rate_bps = $7,
           commission_paise = $8,
           commission_gst_paise = $9,
           gateway_fee_paise = $10,
           gateway_borne_by = $11,
           tcs_paise = $12,
           net_payout_paise = $13,
           commercial_mode = $14,
           tcs_rate_bps = $15,
           platform_turnover_paise = $16,
           money_snapshotted_at = NOW(),
           mobile_shared_at = COALESCE(mobile_shared_at, NOW()),
           payment_receipt_number = COALESCE(payment_receipt_number, $17),
           payment_receipt_issued_at = COALESCE(payment_receipt_issued_at, NOW()),
           payment_receipt_json = COALESCE(payment_receipt_json, $18::jsonb),
           updated_at = NOW()
       WHERE id = $19`,
      [
        ref,
        codeRow.rows[0].id,
        Number(breakup.grossCollectedPaise),
        Number(breakup.baseTariffPaise),
        moneyOpts.roomGstRateBps,
        Number(breakup.roomGstPaise),
        moneyOpts.commissionRateBps,
        Number(breakup.commissionPaise),
        Number(breakup.commissionGstPaise),
        Number(breakup.gatewayFeePaise),
        breakup.gatewayBorneBy,
        Number(breakup.tcsPaise),
        Number(breakup.netPayoutPaise),
        breakup.commercialMode,
        breakup.tcsRateBps,
        Number(breakup.platformTurnoverPaise),
        receiptNumber,
        JSON.stringify(receiptPayload),
        row.id,
      ]
    );

    await client.query(
      `UPDATE guests g
       SET lifetime_bookings = COALESCE(g.lifetime_bookings, 0) + 1,
           last_booking_at = NOW()
       FROM traveller_requests tr
       WHERE tr.opportunity_id = $1 AND tr.guest_id = g.id`,
      [row.id]
    );

    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "booking.created",
      actorId,
      previous: row.status,
      next: "hotel_confirmed",
      payload: {
        hotel_booking_ref: ref,
        money: breakupToJson(breakup),
        payment_receipt_number: receiptNumber,
      },
    });
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "code.issued",
      actorId,
      previous: "hotel_confirmed",
      next: "hotel_confirmed",
      payload: { display: checkIn.display },
    });

    return {
      status: "hotel_confirmed",
      hotel_booking_ref: ref,
      booking_code: checkIn.display,
      money: breakupToJson(breakup),
      payment_receipt: {
        number: receiptNumber,
        ...receiptPayload,
      },
    };
  });
}

export async function stayCompleted(externalId: string, actorId: string) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, h.commission_pct_bps, h.gst_rate_bps, h.gateway_borne_by, h.tcs_bps, h.commercial_mode
       FROM opportunities o
       LEFT JOIN hotels h ON h.id = o.hotel_id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    let breakup: Breakup;
    if (row.gross_collected_paise != null) {
      breakup = computeBreakup({
        grossCollectedPaise: BigInt(row.gross_collected_paise),
        roomGstRateBps: Number(row.room_gst_rate_bps ?? row.gst_rate_bps ?? 1800),
        commissionRateBps: Number(row.commission_rate_bps ?? row.commission_pct_bps ?? 1200),
        gatewayBorneBy: (row.gateway_borne_by as GatewayBorneBy) || "hotel",
        tcsBps: Number(row.tcs_rate_bps ?? row.tcs_bps ?? 0),
        commercialMode: (row.commercial_mode as CommercialMode) || "agent",
      });
    } else {
      const offer = await client.query(
        `SELECT total_amount_paise FROM offers_cache
         WHERE opportunity_id = $1 AND status IN ('accepted','sent','ready')
         ORDER BY created_at DESC LIMIT 1`,
        [row.id]
      );
      const stayTotal = BigInt(offer.rows[0]?.total_amount_paise ?? 0);
      if (stayTotal <= 0n) {
        throw Object.assign(new Error("No offer amount to accrue commission"), { status: 422 });
      }
      breakup = computeBreakup({
        grossCollectedPaise: stayTotal,
        ...hotelMoneyOpts(row),
      });
    }

    const period = new Date().toISOString().slice(0, 7);
    const commission = Number(breakup.commissionPaise);
    const total = Number(breakup.commissionPaise + breakup.commissionGstPaise);

    await client.query(
      `UPDATE opportunities
       SET status = 'commission_due',
           booking_status = 'checked_in',
           checked_in_at = COALESCE(checked_in_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );

    await client.query(
      `UPDATE booking_codes
       SET redeemed_at = COALESCE(redeemed_at, NOW()), redemption_channel = 'ops_manual'
       WHERE opportunity_id = $1 AND redeemed_at IS NULL`,
      [row.id]
    );

    await client.query(
      `INSERT INTO commission_entries (
         opportunity_id, hotel_id, stay_total_paise, commission_paise, status, period_key,
         entry_type, taxable_value_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
         accrued_at, base_tariff_paise, room_gst_paise, net_payout_paise, breakup_json
       ) VALUES ($1,$2,$3,$4,'due',$5,'commission',$6,$7,$8,$9,$10,NOW(),$11,$12,$13,$14::jsonb)
       ON CONFLICT (opportunity_id) DO UPDATE
       SET stay_total_paise = EXCLUDED.stay_total_paise,
           commission_paise = EXCLUDED.commission_paise,
           taxable_value_paise = EXCLUDED.taxable_value_paise,
           cgst_paise = EXCLUDED.cgst_paise,
           sgst_paise = EXCLUDED.sgst_paise,
           igst_paise = EXCLUDED.igst_paise,
           total_paise = EXCLUDED.total_paise,
           base_tariff_paise = EXCLUDED.base_tariff_paise,
           room_gst_paise = EXCLUDED.room_gst_paise,
           net_payout_paise = EXCLUDED.net_payout_paise,
           breakup_json = EXCLUDED.breakup_json,
           status = 'due',
           accrued_at = NOW(),
           period_key = EXCLUDED.period_key`,
      [
        row.id,
        row.hotel_id,
        Number(breakup.grossCollectedPaise),
        commission,
        period,
        Number(breakup.commissionPaise),
        Number(breakup.cgstPaise),
        Number(breakup.sgstPaise),
        Number(breakup.igstPaise),
        total,
        Number(breakup.baseTariffPaise),
        Number(breakup.roomGstPaise),
        Number(breakup.netPayoutPaise),
        JSON.stringify(breakupToJson(breakup)),
      ]
    );

    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "stay.completed",
      actorId,
      previous: row.status,
      next: "commission_due",
      payload: breakupToJson(breakup),
    });
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "commission.booked",
      actorId,
      previous: "commission_due",
      next: "commission_due",
      payload: {
        commission_paise: commission,
        commission_gst_paise: Number(breakup.commissionGstPaise),
      },
    });

    return {
      status: "commission_due",
      stay_total_paise: Number(breakup.grossCollectedPaise),
      commission_paise: commission,
      money: breakupToJson(breakup),
    };
  });
}

export async function transitionOpportunity(
  externalId: string,
  next: "hotel_declined" | "more_details_needed" | "offer_expired" | "cancelled" | "issue_review",
  actorId: string,
  note?: string
) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT * FROM opportunities WHERE external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    await client.query(
      `UPDATE opportunities SET status = $1, updated_at = NOW() WHERE id = $2`,
      [next, row.id]
    );
    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: next === "cancelled" ? "stay.cancelled" : "exception.raised",
      actorId,
      previous: row.status,
      next,
      payload: { note: note ?? null },
    });
    return { status: next };
  });
}

export async function listHotels(destination?: Destination) {
  const params: unknown[] = [];
  let clause = "";
  if (destination) {
    params.push(destination);
    clause = `WHERE destination = $1`;
  }
  const result = await pool.query(
    `SELECT * FROM hotels ${clause} ORDER BY destination, display_name`,
    params
  );
  return result.rows;
}

export async function getHotel(id: string) {
  const result = await pool.query(`SELECT * FROM hotels WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createHotel(input: {
  display_name: string;
  destination: Destination;
  location?: string;
  belt?: string | null;
  lat?: number | null;
  lng?: number | null;
  legal_name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  gst_rate_bps?: number;
  gateway_borne_by?: "hotel" | "platform" | "split";
  tcs_bps?: number;
  commercial_mode?: CommercialMode;
  notify_whatsapp?: string | null;
  notify_email?: string | null;
  commission_pct_bps?: number;
  notes?: string | null;
  asavari_property_id?: string | null;
  instant_quote_enabled?: boolean;
  upi_vpa?: string | null;
  payment_note?: string | null;
  payout?: {
    account_holder?: string;
    ifsc_last4?: string;
    account_last4?: string;
    provider?: string;
  } | null;
}) {
  if (!(DESTINATIONS as readonly string[]).includes(input.destination)) {
    throw Object.assign(new Error("Destination must be Goa or Rajasthan"), { status: 422 });
  }
  let slug = slugify(input.display_name);
  const exists = await pool.query(`SELECT 1 FROM hotels WHERE slug = $1`, [slug]);
  if (exists.rowCount) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const name = input.display_name.trim();
  const legal = (input.legal_name || name).trim();
  let code = slug.replace(/-/g, "").toUpperCase().slice(0, 24) || `H${Date.now().toString(36).toUpperCase()}`;
  const codeHit = await pool.query(`SELECT 1 FROM hotels WHERE code = $1`, [code]);
  if (codeHit.rowCount) code = `${code}${Date.now().toString(36).slice(-3).toUpperCase()}`;

  const gstRate = [500, 1200, 1800].includes(Number(input.gst_rate_bps))
    ? Number(input.gst_rate_bps)
    : 1800;
  const gateway = (["hotel", "platform", "split"] as const).includes(
    input.gateway_borne_by as "hotel"
  )
    ? input.gateway_borne_by!
    : "hotel";
  const commercialMode: CommercialMode =
    input.commercial_mode === "principal" ? "principal" : "agent";
  const tcsBps = Math.max(0, Math.min(1000, Number(input.tcs_bps ?? 0) || 0));

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO hotels (
         slug, code, destination, status, display_name, legal_name, location, belt, lat, lng,
         notify_whatsapp, notify_email, commission_pct_bps, gstin, pan, gst_rate_bps,
         gateway_borne_by, tcs_bps, commercial_mode, instant_quote_enabled, notes, asavari_property_id,
         upi_vpa, payment_note
       ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        slug,
        code,
        input.destination,
        name,
        legal,
        input.location?.trim() ?? "",
        (input.belt || "other").trim().toLowerCase() || "other",
        input.lat ?? null,
        input.lng ?? null,
        input.notify_whatsapp ?? null,
        input.notify_email ?? null,
        input.commission_pct_bps ?? 1200,
        input.gstin?.trim() || null,
        input.pan?.trim() || null,
        gstRate,
        gateway,
        tcsBps,
        commercialMode,
        !!input.instant_quote_enabled,
        input.notes ?? null,
        input.asavari_property_id ?? null,
        input.upi_vpa?.trim() || null,
        input.payment_note?.trim() || null,
      ]
    );
    const hotel = result.rows[0];

    const holder = input.payout?.account_holder?.trim() || legal;
    const hasBank =
      input.payout &&
      (input.payout.account_last4?.trim() ||
        input.payout.ifsc_last4?.trim() ||
        input.payout.account_holder?.trim());
    if (hasBank) {
      await client.query(
        `INSERT INTO hotel_payout_accounts (
           hotel_id, provider, account_holder, ifsc_last4, account_last4, kyc_status, activated_at
         ) VALUES ($1,$2,$3,$4,$5,'active',NOW())`,
        [
          hotel.id,
          input.payout?.provider || "manual_neft",
          holder,
          input.payout?.ifsc_last4?.trim() || null,
          input.payout?.account_last4?.trim() || null,
        ]
      );
    }

    return hotel;
  });
}

export async function updateHotel(
  id: string,
  patch: Record<string, unknown>
) {
  const allowed = [
    "display_name",
    "legal_name",
    "destination",
    "location",
    "belt",
    "lat",
    "lng",
    "notify_whatsapp",
    "notify_email",
    "commission_pct_bps",
    "gst_rate_bps",
    "gstin",
    "pan",
    "gateway_borne_by",
    "tcs_bps",
    "commercial_mode",
    "instant_quote_enabled",
    "stop_sell",
    "notes",
    "asavari_property_id",
    "settlement_cycle",
    "upi_vpa",
    "payment_note",
    "hotel_category",
    "amenities",
    "sea_facing",
    "guest_blurb",
    "photo_note",
    "location_note",
    "extras",
    "ota_reference_inr",
    "ota_as_of",
    "direct_online_inr",
    "rooms_count",
    "tier",
    "show_in_guest_catalog",
    "contact_name",
    "contact_role",
    "night_desk_phone",
    "on_ota",
  ];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      let value = patch[key];
      if (key === "commercial_mode") {
        value = value === "principal" ? "principal" : "agent";
      }
      if (key === "tcs_bps") {
        value = Math.max(0, Math.min(1000, Number(value) || 0));
      }
      if (key === "hotel_category") {
        const v = String(value || "")
          .trim()
          .toLowerCase();
        value = (
          ["villa", "resort", "boutique", "hotel", "homestay", "guesthouse"] as const
        ).includes(v as "villa")
          ? v
          : null;
      }
      if (key === "tier") {
        const v = String(value || "")
          .trim()
          .toLowerCase();
        value = (["core", "premium", "breadth"] as const).includes(v as "core") ? v : null;
      }
      if (key === "amenities") {
        if (Array.isArray(value)) {
          value = value.map(String);
        } else if (typeof value === "string") {
          value = value
            .split(/[|,;/]+/)
            .map((a) => a.trim().toLowerCase())
            .filter(Boolean);
        } else {
          value = [];
        }
      }
      if (key === "sea_facing" || key === "show_in_guest_catalog" || key === "on_ota") {
        value = Boolean(value);
      }
      if (
        key === "ota_reference_inr" ||
        key === "direct_online_inr" ||
        key === "rooms_count"
      ) {
        value = value == null || value === "" ? null : Math.round(Number(value));
      }
      vals.push(value);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  if (!sets.length) return getHotel(id);
  vals.push(id);
  const result = await pool.query(
    `UPDATE hotels SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!result.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  return result.rows[0];
}

export async function setHotelLive(id: string, live: boolean) {
  if (live) {
    const hotel = await getHotel(id);
    if (!hotel) throw Object.assign(new Error("Hotel not found"), { status: 404 });
    const contacts = await pool.query(
      `SELECT role FROM hotel_contacts
       WHERE hotel_id = $1 AND archived_at IS NULL`,
      [id]
    );
    const sheets = await pool.query(
      `SELECT status, expires_at FROM rate_sheets WHERE hotel_id = $1`,
      [id]
    );
    const hasNightContact = contacts.rows.some((c) => String(c.role) === "night_desk");
    const hasActiveRateSheet = sheets.rows.some(
      (s) =>
        String(s.status) === "active" &&
        (!s.expires_at || new Date(String(s.expires_at)).getTime() > Date.now())
    );
    const check = canGoLive({
      belt: String(hotel.belt || "other"),
      gstin: hotel.gstin ? String(hotel.gstin) : null,
      lat: hotel.lat != null ? Number(hotel.lat) : null,
      lng: hotel.lng != null ? Number(hotel.lng) : null,
      hasNightContact,
      hasActiveRateSheet,
    });
    if (!check.ok) {
      throw Object.assign(new Error(`Cannot go live: ${check.blockers.join("; ")}`), {
        status: 422,
        code: "GO_LIVE_BLOCKED",
        blockers: check.blockers,
      });
    }
  }
  const status = live ? "live" : "paused";
  const result = await pool.query(
    `UPDATE hotels
     SET status = $1,
         live_at = CASE WHEN $2 THEN COALESCE(live_at, NOW()) ELSE live_at END,
         paused_at = CASE WHEN $2 THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, live, id]
  );
  if (!result.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  return result.rows[0];
}

export async function listCommission(status?: string) {
  const params: unknown[] = [];
  let clause = "";
  if (status) {
    params.push(status);
    clause = `WHERE c.status = $1`;
  }
  const result = await pool.query(
    `SELECT c.*, o.external_opportunity_id, h.display_name AS hotel_name
     FROM commission_entries c
     JOIN opportunities o ON o.id = c.opportunity_id
     LEFT JOIN hotels h ON h.id = c.hotel_id
     ${clause}
     ORDER BY c.created_at DESC
     LIMIT 200`,
    params
  );
  return result.rows.map((r) => ({
    ...r,
    stay_total_paise: Number(r.stay_total_paise),
    commission_paise: Number(r.commission_paise),
  }));
}

export async function settleCommission(id: string, actorId: string) {
  return withTransaction(async (client) => {
    const row = await client.query(
      `SELECT c.*, o.external_opportunity_id, o.id AS opp_uuid, o.status AS opp_status
       FROM commission_entries c
       JOIN opportunities o ON o.id = c.opportunity_id
       WHERE c.id = $1`,
      [id]
    );
    const c = row.rows[0];
    if (!c) throw Object.assign(new Error("Commission entry not found"), { status: 404 });
    await client.query(
      `UPDATE commission_entries SET status = 'settled', settled_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query(
      `UPDATE opportunities SET status = 'settled', updated_at = NOW() WHERE id = $1`,
      [c.opp_uuid]
    );
    await recordEvent(client, {
      opportunityId: c.opp_uuid,
      externalId: c.external_opportunity_id,
      eventType: "payment.settled",
      actorId,
      previous: c.opp_status,
      next: "settled",
      payload: { commission_id: id },
    });
    return { id, status: "settled" };
  });
}

export async function listGuests(q?: string) {
  const params: unknown[] = [];
  let clause = "";
  if (q?.trim()) {
    params.push(`%${q.trim()}%`);
    clause = `WHERE g.name ILIKE $1 OR g.phone_e164 ILIKE $1 OR g.email ILIKE $1`;
  }
  const result = await pool.query(
    `SELECT g.id, g.phone_e164, g.name, g.email, g.home_city,
            g.first_seen_at, g.last_booking_at, g.lifetime_bookings,
            COUNT(tr.id)::int AS request_count,
            COUNT(tr.id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM opportunities o
                WHERE o.id = tr.opportunity_id
                  AND o.booking_status IN ('confirmed','checked_in','completed')
              )
            )::int AS completed_stays,
            MAX(tr.check_out) AS last_check_out
     FROM guests g
     LEFT JOIN traveller_requests tr ON tr.guest_id = g.id
     ${clause}
     GROUP BY g.id
     ORDER BY COALESCE(g.last_booking_at, g.first_seen_at) DESC NULLS LAST
     LIMIT 200`,
    params
  );
  return result.rows.map((r) => ({
    ...r,
    phone_masked: maskMobile(String(r.phone_e164 ?? "")),
    is_repeat: Number(r.lifetime_bookings ?? 0) > 1 || Number(r.completed_stays ?? 0) > 1,
  }));
}

export async function getHotelGoLiveChecklist(id: string) {
  const hotel = await getHotel(id);
  if (!hotel) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  const contacts = await pool.query(
    `SELECT role FROM hotel_contacts WHERE hotel_id = $1 AND archived_at IS NULL`,
    [id]
  );
  const sheets = await pool.query(
    `SELECT status, expires_at FROM rate_sheets WHERE hotel_id = $1`,
    [id]
  );
  const hasNightContact = contacts.rows.some((c) => String(c.role) === "night_desk");
  const hasActiveRateSheet = sheets.rows.some(
    (s) =>
      String(s.status) === "active" &&
      (!s.expires_at || new Date(String(s.expires_at)).getTime() > Date.now())
  );
  const check = canGoLive({
    belt: String(hotel.belt || "other"),
    gstin: hotel.gstin ? String(hotel.gstin) : null,
    lat: hotel.lat != null ? Number(hotel.lat) : null,
    lng: hotel.lng != null ? Number(hotel.lng) : null,
    hasNightContact,
    hasActiveRateSheet,
  });
  return {
    ...check,
    status: hotel.status,
    checklist: {
      belt: (["morjim","anjuna","arambol","candolim","vagator","calangute","ashwem","baga"] as const).includes(
        String(hotel.belt || "") as "morjim"
      ),
      gstin: Boolean(hotel.gstin),
      coordinates: hotel.lat != null && hotel.lng != null,
      night_desk: hasNightContact,
      active_rate_sheet: hasActiveRateSheet,
    },
  };
}

export { listOpenExceptions };
