import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import {
  DESTINATIONS,
  dispositionFor,
  generateOppCode,
  isEnumerableOppCode,
  isWithinBookingWindow,
  type CreateOpportunityInput,
  type Destination,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";
import { maskMobile } from "../lib/crypto.js";

function publicToken(): string {
  return randomBytes(24).toString("base64url");
}

async function allocateOppCode(client: PoolClient): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateOppCode();
    if (isEnumerableOppCode(code)) continue;
    const exists = await client.query(
      `SELECT 1 FROM opportunities WHERE external_opportunity_id = $1`,
      [code]
    );
    if (!exists.rowCount) return code;
  }
  throw Object.assign(new Error("Could not allocate OPP code"), { status: 500 });
}

export async function createOpportunity(input: CreateOpportunityInput) {
  if (!input.consent) {
    throw Object.assign(new Error("Consent is required"), { status: 422 });
  }
  if (input.check_out <= input.check_in) {
    throw Object.assign(new Error("Check-out must be after check-in"), {
      status: 422,
    });
  }
  if (!(DESTINATIONS as readonly string[]).includes(input.destination)) {
    throw Object.assign(new Error("Choose Goa or Rajasthan"), { status: 422 });
  }
  if (!isWithinBookingWindow(new Date(input.check_in))) {
    throw Object.assign(
      new Error("Check-in must be within the 48-hour Direct window (same-day to +48h)"),
      { status: 422, code: "OUTSIDE_BOOKING_WINDOW" }
    );
  }

  const disposition = dispositionFor(input.destination);

  return withTransaction(async (client) => {
    const externalOpportunityId = await allocateOppCode(client);
    const token = publicToken();
    const status = "verifying";

    const opp = await client.query(
      `INSERT INTO opportunities (
         external_opportunity_id, public_token, status, referral_code, attribution_status,
         domain_opp_status, settlement_mode
       ) VALUES ($1, $2, $3, $4, $5, 'created', 'direct_to_hotel')
       RETURNING *`,
      [
        externalOpportunityId,
        token,
        status,
        input.referral_code ?? null,
        input.referral_code ? "pending" : "none",
      ]
    );

    const opportunity = opp.rows[0];

    const guest = await client.query(
      `INSERT INTO guests (phone_e164, name, email)
       VALUES ($1,$2,$3)
       ON CONFLICT (phone_e164) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, guests.name),
           email = COALESCE(EXCLUDED.email, guests.email)
       RETURNING id`,
      [input.mobile.replace(/\s+/g, ""), input.name, input.email ?? null]
    );

    await client.query(
      `INSERT INTO traveller_requests (
         opportunity_id, guest_id, name, mobile, email, consent_version,
         destination, requested_area, requested_property, check_in, check_out,
         rooms, adults, children, budget_paise, public_rate_paise,
         preferences, special_request
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18
       )`,
      [
        opportunity.id,
        guest.rows[0].id,
        input.name,
        input.mobile,
        input.email ?? null,
        input.consent_version,
        input.destination,
        input.requested_area,
        input.requested_property ?? null,
        input.check_in,
        input.check_out,
        input.rooms ?? 1,
        input.adults ?? 2,
        input.children ?? 0,
        input.budget_paise ?? null,
        input.public_rate_paise ?? null,
        JSON.stringify(input.preferences ?? []),
        input.special_request ?? null,
      ]
    );

    const idempotencyKey = `${externalOpportunityId}:opportunity.created:1`;
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, actor_id, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        opportunity.id,
        "opportunity.created",
        "traveller",
        input.mobile,
        "direct",
        null,
        status,
        idempotencyKey,
        JSON.stringify({
          destination: input.destination,
          requested_area: input.requested_area,
          check_in: input.check_in,
          check_out: input.check_out,
          referral_code: input.referral_code ?? null,
          pilot_route: disposition.route,
          count_in_coverage: disposition.countInCoverage,
          guest_message: disposition.guestMessage,
        }),
      ]
    );

    if (!disposition.route) {
      await client.query(
        `UPDATE opportunities
         SET status = 'no_offers',
             domain_opp_status = 'no_offers',
             updated_at = NOW()
         WHERE id = $1`,
        [opportunity.id]
      );
    }

    if (input.referral_code) {
      await client.query(
        `INSERT INTO opportunity_events (
           opportunity_id, event_type, actor_type, source_system,
           previous_status, new_status, idempotency_key, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          opportunity.id,
          "referral.recorded",
          "system",
          "direct",
          status,
          status,
          `${externalOpportunityId}:referral.recorded:1`,
          JSON.stringify({ referral_code: input.referral_code, state: "pending" }),
        ]
      );
    }

    return {
      id: opportunity.id,
      external_opportunity_id: externalOpportunityId,
      public_token: token,
      status: disposition.route ? status : "no_offers",
      pilot: {
        route: disposition.route,
        count_in_coverage: disposition.countInCoverage,
        guest_message: disposition.guestMessage,
      },
    };
  });
}

export async function getOpportunityByToken(token: string) {
  const result = await pool.query(
    `SELECT o.*,
            tr.name, tr.mobile, tr.email, tr.destination, tr.requested_area, tr.requested_property,
            tr.check_in, tr.check_out, tr.rooms, tr.adults, tr.children,
            tr.public_rate_paise, tr.preferences, tr.otp_verified_at, tr.consent_version,
            bc.display_code
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN booking_codes bc ON bc.opportunity_id = o.id
     WHERE o.public_token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function getOpportunityByExternalId(externalId: string) {
  const result = await pool.query(
    `SELECT o.*,
            tr.name, tr.mobile, tr.email, tr.destination, tr.requested_area, tr.requested_property,
            tr.check_in, tr.check_out, tr.rooms, tr.adults, tr.children,
            tr.public_rate_paise, tr.preferences, tr.otp_verified_at, tr.consent_version,
            bc.display_code
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN booking_codes bc ON bc.opportunity_id = o.id
     WHERE o.external_opportunity_id = $1`,
    [externalId]
  );
  return result.rows[0] ?? null;
}

export async function listEvents(opportunityId: string) {
  const result = await pool.query(
    `SELECT id, event_type, occurred_at, actor_type, actor_id, source_system,
            previous_status, new_status, idempotency_key, payload
     FROM opportunity_events
     WHERE opportunity_id = $1
     ORDER BY occurred_at ASC, created_at ASC`,
    [opportunityId]
  );
  return result.rows;
}

export async function listOpenExceptions() {
  const result = await pool.query(
    `SELECT e.id, e.opportunity_id, e.exception_type, e.severity, e.status, e.owner_id,
            e.summary, e.details, e.created_at, e.resolved_at,
            o.external_opportunity_id, o.public_token, o.status AS opportunity_status,
            tr.destination, tr.requested_area, tr.check_in, tr.check_out, tr.name
     FROM desk_exceptions e
     LEFT JOIN opportunities o ON o.id = e.opportunity_id
     LEFT JOIN traveller_requests tr ON tr.opportunity_id = o.id
     WHERE e.status IN ('open', 'in_progress')
       AND e.exception_type NOT IN ('offer_accepted_handoff', 'verified_awaiting_route')
     ORDER BY e.created_at DESC
     LIMIT 100`
  );
  return result.rows;
}

export async function listDeskQueue(destination?: Destination) {
  const params: unknown[] = [];
  let destClause = "";
  if (destination) {
    params.push(destination);
    destClause = `AND tr.destination = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT o.external_opportunity_id, o.public_token, o.status, o.priority,
            o.updated_at, o.created_at,
            tr.name, tr.mobile, tr.destination, tr.requested_area, tr.check_in, tr.check_out,
            tr.otp_verified_at
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     WHERE o.status NOT IN ('settled', 'cancelled')
       ${destClause}
     ORDER BY o.updated_at DESC
     LIMIT 100`,
    params
  );
  return result.rows.map((row) => ({
    ...toPublicOpportunity(row),
    traveller_name: row.name,
    mobile_masked: maskMobile(String(row.mobile)),
    otp_verified: Boolean(row.otp_verified_at),
    priority: row.priority,
  }));
}

export async function cancelOpportunity(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }
  const blocked = ["hotel_confirmed", "stay_completed", "commission_due", "settled"];
  if (blocked.includes(row.status)) {
    throw Object.assign(new Error("Cannot cancel after hotel confirmation"), {
      status: 409,
    });
  }
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE opportunities SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [row.id]
    );
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'exception.raised','traveller','direct',$2,'cancelled',$3,$4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.id,
        row.status,
        `${row.external_opportunity_id}:cancelled:${Date.now()}`,
        JSON.stringify({ reason: "traveller_cancel" }),
      ]
    );
    return { public_token: publicToken, status: "cancelled" };
  });
}

export function toPublicOpportunity(row: Record<string, unknown>) {
  return {
    external_opportunity_id: row.external_opportunity_id,
    public_token: row.public_token,
    status: row.status,
    booking_status: row.booking_status ?? undefined,
    traveller_name: row.name ?? undefined,
    mobile_masked: row.mobile ? maskMobile(String(row.mobile)) : undefined,
    otp_verified: Boolean(row.otp_verified_at),
    destination: row.destination,
    requested_area: row.requested_area,
    requested_property: row.requested_property,
    check_in: row.check_in,
    check_out: row.check_out,
    rooms: row.rooms,
    adults: row.adults,
    children: row.children,
    public_rate_paise: row.public_rate_paise,
    preferences: row.preferences,
    attribution_status: row.attribution_status,
    asavari_property_id: row.asavari_property_id,
    asavari_booking_ref: row.asavari_booking_ref,
    hotel_booking_ref: row.hotel_booking_ref ?? null,
    payment_utr: row.payment_utr ?? null,
    guest_attested_at: row.guest_attested_at ?? null,
    hotel_attested_at: row.hotel_attested_at ?? null,
    check_in_code: row.display_code ?? row.check_in_code ?? null,
    payment_receipt_number: row.payment_receipt_number ?? null,
    payment_receipt_issued_at: row.payment_receipt_issued_at ?? null,
    payment_receipt: row.payment_receipt_json ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
