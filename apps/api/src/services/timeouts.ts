/**
 * Scan BOOKING_TIMEOUTS, attestation dual-wait, and routing escalation ladder.
 */

import {
  BOOKING_TIMEOUTS,
  timeoutDueAt,
  evaluateAttestation,
  dueEscalations,
  type EscalationStep,
} from "@hotelradar/direct-shared";
import { pool } from "../db/pool.js";
import { log } from "../lib/logger.js";
import { routeOpportunity } from "./routing.js";

export async function scanBookingTimeouts(): Promise<{ raised: number; expired: number }> {
  let raised = 0;
  let expired = 0;

  for (const rule of BOOKING_TIMEOUTS) {
    if (rule.from === "payment_pending") {
      const rows = await pool.query(
        `SELECT o.id, o.external_opportunity_id, o.booking_entered_payment_pending_at, o.status
         FROM opportunities o
         WHERE o.booking_status = 'payment_pending'
           AND o.booking_entered_payment_pending_at IS NOT NULL`
      );
      for (const row of rows.rows) {
        const due = timeoutDueAt(rule, new Date(row.booking_entered_payment_pending_at));
        if (due.getTime() > Date.now()) continue;
        if (rule.to === "payment_expired") {
          await pool.query(
            `UPDATE opportunities
             SET booking_status = 'payment_expired', status = 'offer_expired', updated_at = NOW()
             WHERE id = $1 AND booking_status = 'payment_pending'`,
            [row.id]
          );
          expired += 1;
        }
        const exists = await pool.query(
          `SELECT 1 FROM desk_exceptions
           WHERE opportunity_id = $1 AND exception_type = $2 AND status IN ('open','in_progress')`,
          [row.id, rule.exceptionType]
        );
        if (!exists.rowCount) {
          await pool.query(
            `INSERT INTO desk_exceptions (
               opportunity_id, exception_type, severity, summary, details
             ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
            [
              row.id,
              rule.exceptionType,
              rule.severity === "critical" ? "critical" : rule.severity,
              `Timeout: ${rule.exceptionType} for ${row.external_opportunity_id}`,
              JSON.stringify({ rule: rule.from, due_at: due.toISOString() }),
            ]
          );
          raised += 1;
        }
      }
    }

    if (rule.from === "payment_received") {
      const rows = await pool.query(
        `SELECT o.id, o.external_opportunity_id, o.booking_entered_payment_received_at
         FROM opportunities o
         WHERE o.booking_status = 'payment_received'
           AND o.booking_entered_payment_received_at IS NOT NULL
           AND o.status <> 'hotel_confirmed'`
      );
      for (const row of rows.rows) {
        const due = timeoutDueAt(rule, new Date(row.booking_entered_payment_received_at));
        if (due.getTime() > Date.now()) continue;
        const exists = await pool.query(
          `SELECT 1 FROM desk_exceptions
           WHERE opportunity_id = $1 AND exception_type = $2 AND status IN ('open','in_progress')`,
          [row.id, rule.exceptionType]
        );
        if (!exists.rowCount) {
          await pool.query(
            `INSERT INTO desk_exceptions (
               opportunity_id, exception_type, severity, summary, details
             ) VALUES ($1,$2,'critical',$3,$4::jsonb)`,
            [
              row.id,
              rule.exceptionType,
              `CRITICAL: paid not confirmed — ${row.external_opportunity_id}`,
              JSON.stringify({ due_at: due.toISOString(), page_ops: true }),
            ]
          );
          raised += 1;
          log.warn("paid_not_confirmed", { opp: row.external_opportunity_id });
        }
      }
    }

    if (rule.from === "confirmed" && rule.anchor === "check_in") {
      const rows = await pool.query(
        `SELECT o.id, o.external_opportunity_id, tr.check_in, o.booking_status
         FROM opportunities o
         JOIN traveller_requests tr ON tr.opportunity_id = o.id
         WHERE o.booking_status = 'confirmed'
           AND o.checked_in_at IS NULL`
      );
      for (const row of rows.rows) {
        const due = timeoutDueAt(rule, new Date(), new Date(row.check_in));
        if (due.getTime() > Date.now()) continue;
        if (rule.to === "no_show") {
          await pool.query(
            `UPDATE opportunities
             SET booking_status = 'no_show', updated_at = NOW()
             WHERE id = $1 AND booking_status = 'confirmed'`,
            [row.id]
          );
          expired += 1;
        }
        const exists = await pool.query(
          `SELECT 1 FROM desk_exceptions
           WHERE opportunity_id = $1 AND exception_type = $2 AND status IN ('open','in_progress')`,
          [row.id, rule.exceptionType]
        );
        if (!exists.rowCount) {
          await pool.query(
            `INSERT INTO desk_exceptions (
               opportunity_id, exception_type, severity, summary, details
             ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
            [
              row.id,
              rule.exceptionType,
              rule.severity,
              `No-show window passed — ${row.external_opportunity_id}`,
              JSON.stringify({ check_in: row.check_in, due_at: due.toISOString() }),
            ]
          );
          raised += 1;
        }
      }
    }
  }

  return { raised, expired };
}

/** Dual attestation overdue → desk exception (phone the missing side). */
export async function scanAttestationTimeouts(): Promise<{ raised: number }> {
  let raised = 0;
  const rows = await pool.query(
    `SELECT id, external_opportunity_id, payment_utr, guest_attested_at, hotel_attested_at,
            attestation_entered_at, booking_status
     FROM opportunities
     WHERE attestation_entered_at IS NOT NULL
       AND booking_status IS DISTINCT FROM 'payment_received'
       AND booking_status IS DISTINCT FROM 'confirmed'
       AND booking_status IS DISTINCT FROM 'checked_in'
       AND booking_status IS DISTINCT FROM 'completed'
       AND (guest_attested_at IS NULL OR hotel_attested_at IS NULL)`
  );

  for (const row of rows.rows) {
    const verdict = evaluateAttestation(
      {
        guestAttestedAt: row.guest_attested_at ? new Date(row.guest_attested_at) : null,
        hotelAttestedAt: row.hotel_attested_at ? new Date(row.hotel_attested_at) : null,
        utr: row.payment_utr,
      },
      new Date(row.attestation_entered_at)
    );
    if (verdict.action !== "raise_exception") continue;

    const exists = await pool.query(
      `SELECT 1 FROM desk_exceptions
       WHERE opportunity_id = $1 AND exception_type = 'attestation_incomplete'
         AND status IN ('open','in_progress')`,
      [row.id]
    );
    if (exists.rowCount) continue;

    await pool.query(
      `INSERT INTO desk_exceptions (
         opportunity_id, exception_type, severity, summary, details
       ) VALUES ($1,'attestation_incomplete','high',$2,$3::jsonb)`,
      [
        row.id,
        `Attestation incomplete — missing ${verdict.missing} (${row.external_opportunity_id})`,
        JSON.stringify(verdict),
      ]
    );
    raised += 1;
  }

  return { raised };
}

/**
 * Routing silence ladder: remind → call desk → widen → call owner.
 * Records desk exceptions; marks escalation_done so steps are not repeated.
 */
export async function scanRoutingEscalations(): Promise<{ raised: number; steps: number }> {
  let raised = 0;
  let steps = 0;

  const rows = await pool.query(
    `SELECT o.id, o.external_opportunity_id, o.escalation_done, o.status,
            MIN(oh.sent_at) AS sent_at
     FROM opportunities o
     JOIN opportunity_hotels oh ON oh.opportunity_id = o.id
     WHERE o.status IN ('hotel_notified', 'more_details_needed')
       AND oh.outcome IS NULL
     GROUP BY o.id`
  );

  for (const row of rows.rows) {
    if (!row.sent_at) continue;
    const done: EscalationStep["action"][] = Array.isArray(row.escalation_done)
      ? row.escalation_done.map(String)
      : [];
    const due = dueEscalations(new Date(row.sent_at), done);
    if (!due.length) continue;

    const nextDone = [...done];
    for (const step of due) {
      steps += 1;
      nextDone.push(step.action);
      const exceptionType = `escalation_${step.action}`;
      const exists = await pool.query(
        `SELECT 1 FROM desk_exceptions
         WHERE opportunity_id = $1 AND exception_type = $2 AND status IN ('open','in_progress')`,
        [row.id, exceptionType]
      );
      if (!exists.rowCount) {
        await pool.query(
          `INSERT INTO desk_exceptions (
             opportunity_id, exception_type, severity, summary, details
           ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [
            row.id,
            exceptionType,
            step.action === "call_owner" || step.action === "widen_search" ? "high" : "medium",
            `Routing escalation: ${step.action} → ${step.target} (${row.external_opportunity_id})`,
            JSON.stringify(step),
          ]
        );
        raised += 1;
      }

      if (step.action === "widen_search") {
        try {
          await routeOpportunity(String(row.external_opportunity_id), "escalation_worker", {
            limit: 5,
          });
          log.info("escalation widen_search routed", {
            opp: row.external_opportunity_id,
          });
        } catch (error) {
          log.warn("escalation widen_search failed", {
            opp: row.external_opportunity_id,
            error: String(error),
          });
        }
      }
    }

    await pool.query(
      `UPDATE opportunities
       SET escalation_done = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(nextDone), row.id]
    );
  }

  return { raised, steps };
}

export async function scanAllDomainClocks() {
  const timeouts = await scanBookingTimeouts();
  const attestation = await scanAttestationTimeouts();
  const escalations = await scanRoutingEscalations();
  return { timeouts, attestation, escalations };
}
