/**
 * Check-in code redemption → payout + commission (idempotent).
 */

import {
  computeBreakup,
  parseCheckInCode,
  payoutAdviceLines,
  formatINR,
  planFor,
  assertPayoutAllowed,
  assertTransition,
  shouldAccrueCommission,
  type Breakup,
  type SettlementMode,
  type BookingStatus,
  type CommercialMode,
  type GatewayBorneBy,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";

function breakupJson(b: Breakup) {
  return {
    commercial_mode: b.commercialMode,
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
    platform_turnover_paise: b.platformTurnoverPaise.toString(),
    net_payout_paise: b.netPayoutPaise.toString(),
    advice: payoutAdviceLines(b).map((l) => ({
      label: l.label,
      amount: formatINR(l.paise),
      negative: !!l.negative,
    })),
  };
}

export async function redeemCheckInCode(
  rawCode: string,
  opts: {
    actorId: string;
    channel?: "whatsapp" | "portal" | "ops_manual";
    ip?: string | null;
  }
) {
  const parsed = parseCheckInCode(rawCode);
  if (!parsed.ok) {
    return {
      ok: false as const,
      error: {
        code: parsed.reason === "checksum" ? "CHECKSUM_FAILED" : "MALFORMED_CODE",
        message:
          parsed.reason === "checksum"
            ? "Check-in code checksum failed"
            : "Check-in code is malformed",
      },
    };
  }

  return withTransaction(async (client) => {
    const codeRow = await client.query(
      `SELECT bc.*, o.external_opportunity_id, o.id AS opp_id, o.status AS opp_status,
              o.hotel_id, o.gross_collected_paise, o.room_gst_rate_bps, o.commission_rate_bps,
              o.gateway_borne_by, o.net_payout_paise, o.booking_status,
              COALESCE(o.settlement_mode, 'direct_to_hotel') AS settlement_mode,
              COALESCE(o.commercial_mode, h.commercial_mode, 'agent') AS commercial_mode,
              COALESCE(o.tcs_rate_bps, h.tcs_bps, 0) AS tcs_bps,
              h.commission_pct_bps, h.gst_rate_bps
       FROM booking_codes bc
       JOIN opportunities o ON o.id = bc.opportunity_id
       LEFT JOIN hotels h ON h.id = o.hotel_id
       WHERE bc.code = $1
       FOR UPDATE OF bc`,
      [parsed.stored]
    );

    if (!codeRow.rowCount) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND", message: "Unknown check-in code" },
      };
    }

    const bc = codeRow.rows[0];

    const mode = (bc.settlement_mode as SettlementMode) || "direct_to_hotel";
    const plan = planFor(mode);

    // Idempotent: already redeemed → return original result, no second payout
    if (bc.redeemed_at) {
      const existingPayout = await client.query(
        `SELECT * FROM payouts WHERE opportunity_id = $1 AND trigger = 'code_redeemed'
         ORDER BY created_at ASC LIMIT 1`,
        [bc.opp_id]
      );
      const existingComm = await client.query(
        `SELECT * FROM commission_entries WHERE opportunity_id = $1 LIMIT 1`,
        [bc.opp_id]
      );
      return {
        ok: true as const,
        idempotent: true,
        opportunity_id: bc.external_opportunity_id,
        redeemed_at: bc.redeemed_at,
        settlement_mode: mode,
        plan,
        payout: existingPayout.rows[0] ?? null,
        commission: existingComm.rows[0] ?? null,
      };
    }

    if (new Date(bc.expires_at).getTime() < Date.now()) {
      await client.query(
        `UPDATE booking_codes SET failed_attempts = failed_attempts + 1 WHERE id = $1`,
        [bc.id]
      );
      return {
        ok: false as const,
        error: { code: "EXPIRED", message: "Check-in code expired" },
      };
    }

    let breakup: Breakup;
    if (bc.gross_collected_paise != null) {
      breakup = computeBreakup({
        grossCollectedPaise: BigInt(bc.gross_collected_paise),
        roomGstRateBps: Number(bc.room_gst_rate_bps ?? bc.gst_rate_bps ?? 1800),
        commissionRateBps: Number(bc.commission_rate_bps ?? bc.commission_pct_bps ?? 1200),
        gatewayBorneBy: (bc.gateway_borne_by as GatewayBorneBy) || "hotel",
        tcsBps: Number(bc.tcs_bps ?? 0),
        commercialMode: (bc.commercial_mode as CommercialMode) || "agent",
      });
    } else {
      const offer = await client.query(
        `SELECT total_amount_paise FROM offers_cache
         WHERE opportunity_id = $1 AND status IN ('accepted','sent','ready')
         ORDER BY created_at DESC LIMIT 1`,
        [bc.opp_id]
      );
      const gross = BigInt(offer.rows[0]?.total_amount_paise ?? 0);
      if (gross <= 0n) {
        return {
          ok: false as const,
          error: { code: "NO_AMOUNT", message: "No offer amount for payout" },
        };
      }
      breakup = computeBreakup({
        grossCollectedPaise: gross,
        roomGstRateBps: Number(bc.gst_rate_bps ?? 1800),
        commissionRateBps: Number(bc.commission_pct_bps ?? 1200),
        gatewayBorneBy: "hotel",
        tcsBps: Number(bc.tcs_bps ?? 0),
        commercialMode: (bc.commercial_mode as CommercialMode) || "agent",
      });
    }

    await client.query(
      `UPDATE booking_codes
       SET redeemed_at = NOW(), redemption_channel = $1
       WHERE id = $2`,
      [opts.channel ?? "ops_manual", bc.id]
    );

    const fromStatus = (bc.booking_status as BookingStatus | null) || "confirmed";
    if (fromStatus !== "checked_in") {
      try {
        assertTransition(fromStatus, "checked_in");
      } catch {
        throw Object.assign(
          new Error(`Cannot redeem from booking status ${fromStatus} — confirm booking first`),
          { status: 422 }
        );
      }
    }

    await client.query(
      `UPDATE opportunities
       SET booking_status = 'checked_in',
           status = 'commission_due',
           checked_in_at = COALESCE(checked_in_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [bc.opp_id]
    );

    let payout: { rows: Array<Record<string, unknown>> } = { rows: [] };
    if (plan.createsPayout) {
      assertPayoutAllowed(mode);
      const account = await client.query(
        `SELECT id FROM hotel_payout_accounts
         WHERE hotel_id = $1 AND kyc_status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [bc.hotel_id]
      );
      payout = await client.query(
        `INSERT INTO payouts (
           opportunity_id, hotel_payout_account_id, trigger, amount_paise, status
         ) VALUES ($1,$2,'code_redeemed',$3,'pending')
         RETURNING *`,
        [bc.opp_id, account.rows[0]?.id ?? null, Number(breakup.netPayoutPaise)]
      );
    }

    const period = new Date().toISOString().slice(0, 7);
    // Accrue only once booking is checked_in (domain rule)
    const postStatus: BookingStatus = "checked_in";
    if (!shouldAccrueCommission(postStatus)) {
      throw Object.assign(new Error("Commission cannot accrue before check-in"), { status: 422 });
    }

    const commission = await client.query(
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
           breakup_json = EXCLUDED.breakup_json,
           status = 'due',
           accrued_at = NOW()
       RETURNING *`,
      [
        bc.opp_id,
        bc.hotel_id,
        Number(breakup.grossCollectedPaise),
        Number(breakup.commissionPaise),
        period,
        Number(breakup.commissionPaise),
        Number(breakup.cgstPaise),
        Number(breakup.sgstPaise),
        Number(breakup.igstPaise),
        Number(breakup.commissionPaise + breakup.commissionGstPaise),
        Number(breakup.baseTariffPaise),
        Number(breakup.roomGstPaise),
        Number(breakup.netPayoutPaise),
        JSON.stringify(breakupJson(breakup)),
      ]
    );

    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, actor_id, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'code.redeemed','admin',$2,'direct',$3,'commission_due',$4,$5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        bc.opp_id,
        opts.actorId,
        bc.opp_status,
        `${bc.external_opportunity_id}:code.redeemed:${bc.id}`,
        JSON.stringify({
          payout_id: payout.rows[0]?.id ?? null,
          settlement_mode: mode,
          plan,
          money: breakupJson(breakup),
          channel: opts.channel ?? "ops_manual",
          ip: opts.ip ?? null,
        }),
      ]
    );

    return {
      ok: true as const,
      idempotent: false,
      opportunity_id: bc.external_opportunity_id,
      redeemed_at: new Date().toISOString(),
      settlement_mode: mode,
      plan,
      payout: payout.rows[0] ?? null,
      commission: commission.rows[0],
      money: breakupJson(breakup),
    };
  });
}

/** Record failed attempt when code doesn't match a booking (ops portal mistype). */
export async function recordFailedRedemption(rawCode: string) {
  const parsed = parseCheckInCode(rawCode);
  if (!parsed.ok) return { failed_attempts: null as number | null, exception: false };

  const updated = await pool.query(
    `UPDATE booking_codes
     SET failed_attempts = failed_attempts + 1
     WHERE code = $1 AND redeemed_at IS NULL
     RETURNING id, opportunity_id, failed_attempts`,
    [parsed.stored]
  );
  if (!updated.rowCount) return { failed_attempts: null, exception: false };

  const attempts = Number(updated.rows[0].failed_attempts);
  if (attempts >= 5) {
    await pool.query(
      `INSERT INTO desk_exceptions (
         opportunity_id, exception_type, severity, summary, details
       ) VALUES ($1,'code_redemption_failed','high',$2,$3::jsonb)`,
      [
        updated.rows[0].opportunity_id,
        "Check-in code failed 5 times",
        JSON.stringify({ booking_code_id: updated.rows[0].id, failed_attempts: attempts }),
      ]
    );
    return { failed_attempts: attempts, exception: true };
  }
  return { failed_attempts: attempts, exception: false };
}
