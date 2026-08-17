/**
 * Guest direct-pay helpers (no PSP) + copy-WhatsApp message packs for ops.
 * Live Meta send stays deliberate; this is the manual substitute.
 */

import {
  TEMPLATES,
  renderTemplate,
  formatINR,
  isWithinBookingWindow,
} from "@hotelradar/direct-shared";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { getOpportunityByToken, toPublicOpportunity } from "./opportunity.js";
import { submitPaymentUtr, attestHotelPayment } from "./settlement.js";

function guestLink(publicToken: string, path: "offer" | "request" | "hotel-attest") {
  const base = config.appUrl.replace(/\/$/, "");
  if (path === "hotel-attest") return `${base}/hotel/attest/${publicToken}`;
  return `${base}/${path}/${publicToken}`;
}

async function loadPayContext(opportunityId: string) {
  const result = await pool.query(
    `SELECT o.external_opportunity_id, o.public_token, o.status, o.booking_status,
            o.payment_utr, o.guest_attested_at, o.hotel_attested_at, o.hotel_booking_ref,
            o.hotel_id, tr.name AS guest_name, tr.mobile, tr.check_in, tr.check_out,
            tr.rooms, tr.adults, h.display_name AS hotel_name, h.upi_vpa, h.payment_note,
            h.notify_whatsapp,
            oc.hotel_name AS offer_hotel_name, oc.total_amount_paise, oc.room_type,
            oc.valid_until, bc.display_code
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     LEFT JOIN LATERAL (
       SELECT hotel_name, total_amount_paise, room_type, valid_until
       FROM offers_cache
       WHERE opportunity_id = o.id AND status IN ('accepted','sent','ready')
       ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'sent' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 1
     ) oc ON TRUE
     LEFT JOIN booking_codes bc ON bc.opportunity_id = o.id
     WHERE o.id = $1`,
    [opportunityId]
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

export async function getGuestPaymentBundle(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  if (!row.otp_verified_at) {
    throw Object.assign(new Error("Verify mobile first"), { status: 403 });
  }
  const ctx = await loadPayContext(String(row.id));
  if (!ctx) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

  const amountPaise = Number(ctx.total_amount_paise ?? 0);
  const hotelName = String(ctx.hotel_name || ctx.offer_hotel_name || "Hotel");
  const upi = ctx.upi_vpa ? String(ctx.upi_vpa) : null;
  const canSubmitUtr = ["converted", "offer_accepted", "hotel_confirmed"].includes(
    String(ctx.status)
  ) || String(ctx.booking_status) === "payment_pending" || String(ctx.booking_status) === "payment_received";

  return {
    opportunity: toPublicOpportunity({
      ...row,
      display_code: ctx.display_code,
    }),
    payment: {
      hotel_name: hotelName,
      amount_paise: amountPaise || null,
      amount_display: amountPaise ? formatINR(BigInt(amountPaise)) : null,
      upi_vpa: upi,
      payment_note: ctx.payment_note ? String(ctx.payment_note) : null,
      booking_ref: ctx.hotel_booking_ref ? String(ctx.hotel_booking_ref) : String(ctx.external_opportunity_id),
      payment_utr: ctx.payment_utr ? String(ctx.payment_utr) : null,
      guest_attested: Boolean(ctx.guest_attested_at),
      hotel_attested: Boolean(ctx.hotel_attested_at),
      can_submit_utr: canSubmitUtr && !ctx.payment_utr,
      check_in_code: ctx.display_code ? String(ctx.display_code) : null,
      instructions: upi
        ? `Pay ${amountPaise ? formatINR(BigInt(amountPaise)) : "the offer total"} to ${hotelName} via UPI ${upi}. Then enter the UTR below.`
        : `Pay ${hotelName} directly (ask the desk for UPI / bank details), then enter the UTR below. HotelRADAR never collects the stay payment.`,
    },
  };
}

export async function submitGuestPaymentUtr(publicToken: string, rawUtr: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  if (!row.otp_verified_at) {
    throw Object.assign(new Error("Verify mobile first"), { status: 403 });
  }
  const status = String(row.status);
  const booking = String(row.booking_status ?? "");
  if (
    !["converted", "hotel_confirmed"].includes(status) &&
    !["payment_pending", "payment_received"].includes(booking)
  ) {
    throw Object.assign(new Error("Accept the offer before submitting a UTR"), { status: 409 });
  }
  return submitPaymentUtr(String(row.external_opportunity_id), rawUtr, "guest");
}

export async function attestHotelByGuestToken(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  if (!row.payment_utr) {
    throw Object.assign(new Error("Guest UTR not recorded yet"), { status: 409 });
  }
  return attestHotelPayment(String(row.external_opportunity_id), "hotel_link");
}

export async function buildCopyMessages(externalId: string) {
  const opp = await pool.query(
    `SELECT o.id, o.external_opportunity_id, o.public_token, o.status, o.hotel_booking_ref,
            o.payment_utr, tr.name AS guest_name, tr.mobile, tr.check_in, tr.adults, tr.rooms,
            h.display_name AS hotel_name, h.upi_vpa, h.notify_whatsapp,
            oc.hotel_name AS offer_hotel_name, oc.total_amount_paise, oc.room_type, oc.valid_until,
            bc.display_code
     FROM opportunities o
     JOIN traveller_requests tr ON tr.opportunity_id = o.id
     LEFT JOIN hotels h ON h.id = o.hotel_id
     LEFT JOIN LATERAL (
       SELECT hotel_name, total_amount_paise, room_type, valid_until
       FROM offers_cache
       WHERE opportunity_id = o.id
       ORDER BY created_at DESC LIMIT 1
     ) oc ON TRUE
     LEFT JOIN booking_codes bc ON bc.opportunity_id = o.id
     WHERE o.external_opportunity_id = $1 OR o.id::text = $1`,
    [externalId]
  );
  if (!opp.rowCount) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  const row = opp.rows[0] as Record<string, unknown>;
  const hotelName = String(row.hotel_name || row.offer_hotel_name || "Hotel");
  const guestName = String(row.guest_name || "Guest");
  const amount = row.total_amount_paise
    ? formatINR(BigInt(Number(row.total_amount_paise)))
    : "—";
  const holdsUntil = row.valid_until
    ? new Date(String(row.valid_until)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "soon";
  const offerUrl = guestLink(String(row.public_token), "offer");
  const hotelAttestUrl = guestLink(String(row.public_token), "hotel-attest");
  const bookingRef = String(row.hotel_booking_ref || row.external_opportunity_id);
  const upi = String(row.upi_vpa || "ask-desk-for-UPI");
  const checkIn = String(row.check_in).slice(0, 10);
  const code = row.display_code ? String(row.display_code) : "—";
  const guests = `${row.adults ?? 2} adults · ${row.rooms ?? 1} room(s)`;
  const room = String(row.room_type || "room");
  const dates = checkIn;

  const valuesByKey: Record<string, string[]> = {
    offer_ready: [guestName, hotelName, amount, holdsUntil, offerUrl],
    payment_instructions: [hotelName, amount, upi, bookingRef],
    booking_confirmed_with_code: [hotelName, checkIn, code, bookingRef],
    hotel_offer_request: [dates, guests, room, `${config.appUrl.replace(/\/$/, "")}/admin/opportunities/${row.external_opportunity_id}`],
    hotel_payment_check: [guestName, amount, bookingRef],
    day1_checkin: [guestName, hotelName],
    post_stay_review: [guestName, hotelName],
  };

  const phone = row.notify_whatsapp ? String(row.notify_whatsapp).replace(/\D/g, "") : "";
  const guestPhone = row.mobile ? String(row.mobile).replace(/\D/g, "") : "";

  return {
    messages: TEMPLATES.map((spec) => {
      const values = valuesByKey[spec.key] ?? [];
      let body = "";
      try {
        body = values.length === spec.variables.length ? renderTemplate(spec, values) : "";
      } catch {
        body = "";
      }
      if (spec.key === "hotel_payment_check" && body) {
        body = `${body}\n\nTap to confirm payment received:\n${hotelAttestUrl}`;
      }
      const toHotel = ["hotel_offer_request", "hotel_payment_check"].includes(spec.key);
      const digits = toHotel ? phone : guestPhone;
      return {
        key: spec.key,
        purpose: spec.purpose,
        body,
        ready: Boolean(body),
        wa_me: digits && body
          ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
          : null,
      };
    }),
    outside_booking_window: !isWithinBookingWindow(new Date(String(row.check_in))),
  };
}

export async function markEscalationStepDone(externalId: string, action: string) {
  const opp = await pool.query(
    `SELECT id, escalation_done FROM opportunities
     WHERE external_opportunity_id = $1 OR id::text = $1`,
    [externalId]
  );
  if (!opp.rowCount) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  const done = Array.isArray(opp.rows[0].escalation_done)
    ? opp.rows[0].escalation_done.map(String)
    : [];
  if (!done.includes(action)) done.push(action);
  await pool.query(
    `UPDATE opportunities SET escalation_done = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(done), opp.rows[0].id]
  );
  return { escalation_done: done };
}
