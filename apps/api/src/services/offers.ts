import { pool, withTransaction } from "../db/pool.js";
import { getOpportunityByToken } from "./opportunity.js";
import { isOfferAcceptable } from "@hotelradar/direct-shared";
import { getGuestPaymentBundle } from "./guestPay.js";

export async function getCurrentOffer(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }
  if (!row.otp_verified_at) {
    throw Object.assign(new Error("Verify mobile before viewing offers"), {
      status: 403,
    });
  }

  const offer = await pool.query(
    `SELECT * FROM offers_cache
     WHERE opportunity_id = $1 AND status IN ('ready','sent','accepted')
     ORDER BY created_at DESC LIMIT 1`,
    [row.id]
  );

  const pay = await getGuestPaymentBundle(publicToken);

  return {
    opportunity: {
      external_opportunity_id: row.external_opportunity_id,
      public_token: row.public_token,
      status: row.status,
      booking_status: row.booking_status,
      destination: row.destination,
      requested_area: row.requested_area,
      check_in: row.check_in,
      check_out: row.check_out,
      payment_utr: row.payment_utr ?? null,
      guest_attested_at: row.guest_attested_at ?? null,
      hotel_attested_at: row.hotel_attested_at ?? null,
      check_in_code: row.display_code ?? null,
      hotel_booking_ref: row.hotel_booking_ref ?? null,
    },
    offer: offer.rows[0]
      ? {
          offer_id: offer.rows[0].offer_id,
          offer_version: offer.rows[0].offer_version,
          hotel_name: offer.rows[0].hotel_name,
          room_type: offer.rows[0].room_type,
          occupancy: offer.rows[0].occupancy,
          total_amount_paise: Number(offer.rows[0].total_amount_paise),
          currency: offer.rows[0].currency,
          tax_fee_treatment: offer.rows[0].tax_fee_treatment,
          inclusions: offer.rows[0].inclusions,
          cancellation_terms: offer.rows[0].cancellation_terms,
          valid_until: offer.rows[0].valid_until,
          status: offer.rows[0].status,
        }
      : null,
    payment: pay.payment,
  };
}

/** Testing helper: attach a fixture Goa offer after verification. */
export async function attachDemoOffer(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }
  if (!row.otp_verified_at) {
    throw Object.assign(new Error("Verify mobile first"), { status: 403 });
  }

  return withTransaction(async (client) => {
    const offerId = `OFR-${row.external_opportunity_id}-v1`;
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO offers_cache (
         opportunity_id, offer_id, offer_version, hotel_name, room_type, occupancy,
         total_amount_paise, currency, tax_fee_treatment, inclusions,
         cancellation_terms, valid_until, status, property_version
       ) VALUES ($1,$2,1,$3,$4,$5,$6,'INR',$7,$8,$9,$10,'ready',$11)
       ON CONFLICT (opportunity_id, offer_id, offer_version) DO UPDATE
       SET status = 'ready', updated_at = NOW()`,
      [
        row.id,
        offerId,
        "Demo Goa Beach Resort",
        "Deluxe Room",
        "2 adults",
        3600000,
        "Taxes included",
        "Breakfast · Wi-Fi · Late checkout subject to availability",
        "Free cancellation until 72 hours before check-in",
        validUntil.toISOString(),
        "demo-v1",
      ]
    );
    await client.query(
      `UPDATE opportunities
       SET status = 'offer_sent', updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'offer.issued','system','direct',$2,'offer_sent',$3,$4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.id,
        row.status,
        `${row.external_opportunity_id}:offer.issued:demo-v1`,
        JSON.stringify({ offer_id: offerId, demo: true }),
      ]
    );
    return { offer_id: offerId, status: "offer_sent" };
  });
}

export async function acceptOffer(publicToken: string) {
  const current = await getCurrentOffer(publicToken);
  if (!current.offer) {
    throw Object.assign(new Error("No offer available to accept"), { status: 404 });
  }
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }

  const hold =
    current.offer.valid_until != null ? new Date(String(current.offer.valid_until)) : null;
  if (hold && !isOfferAcceptable(hold)) {
    throw Object.assign(new Error("Offer hold expired"), {
      status: 422,
      code: "OFFER_EXPIRED",
    });
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE offers_cache SET status = 'accepted', updated_at = NOW()
       WHERE opportunity_id = $1 AND offer_id = $2 AND offer_version = $3`,
      [row.id, current.offer!.offer_id, current.offer!.offer_version]
    );
    await client.query(
      `UPDATE opportunities
       SET status = 'converted',
           booking_status = 'payment_pending',
           booking_entered_payment_pending_at = COALESCE(booking_entered_payment_pending_at, NOW()),
           domain_opp_status = 'converted',
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'offer.accepted','traveller','direct',$2,'converted',$3,$4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.id,
        row.status,
        `${row.external_opportunity_id}:offer.accepted:${current.offer!.offer_id}`,
        JSON.stringify({
          offer_id: current.offer!.offer_id,
          next: "Pay the hotel directly, then submit the UTR on your offer page",
          booking: "payment_pending",
        }),
      ]
    );

    return {
      public_token: row.public_token,
      status: "converted",
      offer_id: current.offer!.offer_id,
      message:
        "Offer accepted — pay the hotel directly, then submit your UTR on this page. HotelRADAR never collects the stay payment.",
      handoff:
        "Pay the hotel directly, then submit your UTR on this page. HotelRADAR never collects the stay payment.",
    };
  });
}
