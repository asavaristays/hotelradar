/**
 * Settlement attestation (direct_to_hotel pilot) + UTR capture.
 */

import {
  evaluateAttestation,
  validateUtr,
  planFor,
  type SettlementMode,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";

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
      `${args.externalId}:${args.eventType}:${Date.now()}`,
      JSON.stringify(args.payload ?? {}),
    ]
  );
}

async function applyAttestationOutcome(
  client: { query: typeof pool.query },
  row: Record<string, unknown>,
  externalId: string,
  actorId: string,
  state: {
    guestAttestedAt: Date | null;
    hotelAttestedAt: Date | null;
    utr: string | null;
  },
  enteredPendingAt: Date
) {
  const verdict = evaluateAttestation(state, enteredPendingAt);
  if (verdict.action === "confirm") {
    const amount = Number(row.offer_amount ?? row.gross_collected_paise ?? 0);
    const idem = `${externalId}:payment:attested:${state.utr || "none"}`;
    await client.query(
      `INSERT INTO payments (
         opportunity_id, provider, amount_paise, method, status, captured_at,
         idempotency_key, utr, guest_attested_at, hotel_attested_at
       ) VALUES ($1,'manual',$2,'other','captured',NOW(),$3,$4,$5,$6)
       ON CONFLICT (idempotency_key) DO UPDATE
       SET utr = COALESCE(EXCLUDED.utr, payments.utr),
           guest_attested_at = COALESCE(EXCLUDED.guest_attested_at, payments.guest_attested_at),
           hotel_attested_at = COALESCE(EXCLUDED.hotel_attested_at, payments.hotel_attested_at)`,
      [
        row.id,
        amount || 0,
        idem,
        state.utr,
        state.guestAttestedAt?.toISOString() ?? null,
        state.hotelAttestedAt?.toISOString() ?? null,
      ]
    );
    await client.query(
      `UPDATE opportunities
       SET mobile_shared_at = COALESCE(mobile_shared_at, NOW()),
           booking_status = 'payment_received',
           booking_entered_payment_received_at = COALESCE(booking_entered_payment_received_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await recordEvent(client, {
      opportunityId: String(row.id),
      externalId,
      eventType: "payment.attested",
      actorId,
      previous: String(row.status),
      next: String(row.status),
      payload: { verdict: "confirm", utr: state.utr, amount_paise: amount },
    });
  } else if (verdict.action === "raise_exception") {
    await client.query(
      `INSERT INTO desk_exceptions (
         opportunity_id, exception_type, severity, summary, details
       ) VALUES ($1,'attestation_incomplete','high',$2,$3::jsonb)`,
      [
        row.id,
        `Attestation incomplete — missing ${verdict.missing}`,
        JSON.stringify({ missing: verdict.missing, utr: state.utr }),
      ]
    );
    await recordEvent(client, {
      opportunityId: String(row.id),
      externalId,
      eventType: "attestation.timeout",
      actorId,
      previous: String(row.status),
      next: String(row.status),
      payload: verdict,
    });
  }
  return verdict;
}

async function loadOpp(client: { query: typeof pool.query }, externalId: string) {
  const opp = await client.query(
    `SELECT o.*, oc.total_amount_paise AS offer_amount
     FROM opportunities o
     LEFT JOIN LATERAL (
       SELECT total_amount_paise FROM offers_cache
       WHERE opportunity_id = o.id AND status IN ('accepted','sent','ready')
       ORDER BY created_at DESC LIMIT 1
     ) oc ON TRUE
     WHERE o.external_opportunity_id = $1
     FOR UPDATE OF o`,
    [externalId]
  );
  return opp.rows[0] as Record<string, unknown> | undefined;
}

export async function submitPaymentUtr(
  externalId: string,
  rawUtr: string,
  actorId: string,
  opts?: { allowOverride?: boolean }
) {
  const checked = validateUtr(rawUtr);
  if (!checked.ok && !opts?.allowOverride) {
    throw Object.assign(
      new Error(`Invalid UTR: ${checked.reason}`),
      { status: 422, reason: checked.reason }
    );
  }
  const utr = checked.ok ? checked.utr : rawUtr.trim().toUpperCase();

  return withTransaction(async (client) => {
    const row = await loadOpp(client, externalId);
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    const guestAt = new Date();
    const entered =
      row.attestation_entered_at != null
        ? new Date(String(row.attestation_entered_at))
        : guestAt;

    await client.query(
      `UPDATE opportunities
       SET payment_utr = $1,
           guest_attested_at = COALESCE(guest_attested_at, $2),
           attestation_entered_at = COALESCE(attestation_entered_at, $2),
           updated_at = NOW()
       WHERE id = $3`,
      [utr, guestAt.toISOString(), row.id]
    );

    const state = {
      guestAttestedAt: guestAt,
      hotelAttestedAt: row.hotel_attested_at ? new Date(String(row.hotel_attested_at)) : null,
      utr,
    };
    const verdict = await applyAttestationOutcome(
      client,
      row,
      externalId,
      actorId,
      state,
      entered
    );

    return {
      payment_utr: utr,
      guest_attested_at: guestAt.toISOString(),
      hotel_attested_at: state.hotelAttestedAt?.toISOString() ?? null,
      verdict,
      settlement_mode: (row.settlement_mode as SettlementMode) || "direct_to_hotel",
      plan: planFor(((row.settlement_mode as SettlementMode) || "direct_to_hotel")),
    };
  });
}

export async function attestHotelPayment(externalId: string, actorId: string) {
  return withTransaction(async (client) => {
    const row = await loadOpp(client, externalId);
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    const hotelAt = new Date();
    const entered =
      row.attestation_entered_at != null
        ? new Date(String(row.attestation_entered_at))
        : hotelAt;

    await client.query(
      `UPDATE opportunities
       SET hotel_attested_at = COALESCE(hotel_attested_at, $1),
           attestation_entered_at = COALESCE(attestation_entered_at, $1),
           updated_at = NOW()
       WHERE id = $2`,
      [hotelAt.toISOString(), row.id]
    );

    const state = {
      guestAttestedAt: row.guest_attested_at ? new Date(String(row.guest_attested_at)) : null,
      hotelAttestedAt: hotelAt,
      utr: row.payment_utr ? String(row.payment_utr) : null,
    };
    const verdict = await applyAttestationOutcome(
      client,
      row,
      externalId,
      actorId,
      state,
      entered
    );

    return {
      payment_utr: state.utr,
      guest_attested_at: state.guestAttestedAt?.toISOString() ?? null,
      hotel_attested_at: hotelAt.toISOString(),
      verdict,
      settlement_mode: (row.settlement_mode as SettlementMode) || "direct_to_hotel",
      plan: planFor(((row.settlement_mode as SettlementMode) || "direct_to_hotel")),
    };
  });
}

export async function setSettlementMode(
  externalId: string,
  mode: SettlementMode,
  actorId: string
) {
  return withTransaction(async (client) => {
    const row = await loadOpp(client, externalId);
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    await client.query(
      `UPDATE opportunities SET settlement_mode = $1, updated_at = NOW() WHERE id = $2`,
      [mode, row.id]
    );
    await recordEvent(client, {
      opportunityId: String(row.id),
      externalId,
      eventType: "settlement.mode",
      actorId,
      previous: String(row.status),
      next: String(row.status),
      payload: { settlement_mode: mode, plan: planFor(mode) },
    });
    return { settlement_mode: mode, plan: planFor(mode) };
  });
}
