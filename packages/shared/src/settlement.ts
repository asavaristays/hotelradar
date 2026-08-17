/**
 * Settlement.
 *
 * Two modes, one code path.
 *
 *   direct_to_hotel (pilot)  guest pays the hotel; you record and invoice.
 *                            You never touch the money, so no aggregator
 *                            licensing question arises.
 *
 *   escrow (later)           guest pays your link; the check-in code releases
 *                            funds to the hotel and deducts commission.
 *
 * Switching is a per-booking flag, not a migration.
 */

export type SettlementMode = "direct_to_hotel" | "escrow";

export type AttestationState = {
  guestAttestedAt: Date | null;
  hotelAttestedAt: Date | null;
  utr: string | null;
};

export type AttestationVerdict =
  | { action: "confirm" }
  | { action: "wait"; waitingFor: "guest" | "hotel" }
  | { action: "raise_exception"; type: "attestation_incomplete"; missing: "guest" | "hotel" };

/**
 * If only one side has attested after this long, stop waiting and phone them.
 * Twenty minutes is long enough for a front desk to finish with a walk-in and
 * short enough that the guest is still in the chat.
 */
export const ATTESTATION_TIMEOUT_MS = 20 * 60_000;

/**
 * Both sides attest → confirm. One side only → wait, then escalate.
 *
 * Deliberately NOT requiring the hotel before the guest is told anything:
 * the guest has paid, and leaving them staring at a spinner while a desk
 * phone rings is the worst experience the system can produce.
 */
export function evaluateAttestation(
  state: AttestationState,
  enteredPendingAt: Date,
  now: Date = new Date(),
): AttestationVerdict {
  const { guestAttestedAt, hotelAttestedAt } = state;

  if (guestAttestedAt && hotelAttestedAt) return { action: "confirm" };

  const elapsed = now.getTime() - enteredPendingAt.getTime();
  const overdue = elapsed >= ATTESTATION_TIMEOUT_MS;

  if (guestAttestedAt && !hotelAttestedAt) {
    return overdue
      ? { action: "raise_exception", type: "attestation_incomplete", missing: "hotel" }
      : { action: "wait", waitingFor: "hotel" };
  }

  if (!guestAttestedAt && hotelAttestedAt) {
    return overdue
      ? { action: "raise_exception", type: "attestation_incomplete", missing: "guest" }
      : { action: "wait", waitingFor: "guest" };
  }

  return { action: "wait", waitingFor: "guest" };
}

/* ------------------------------------------------------------------ */
/* UTR validation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Store the reference string, never a screenshot. A string reconciles against
 * a bank statement; an image does not.
 *
 * UPI references are 12 digits. NEFT/IMPS/RTGS references are 16–22
 * alphanumeric. Accept both shapes, reject obvious junk, and let ops override
 * — a guest who paid in cash has no UTR and must still be able to proceed.
 */
export function normalizeUtr(input: string): string {
  return input.trim().toUpperCase().replace(/[\s\-]/g, "");
}

export type UtrVerdict =
  | { ok: true; utr: string; kind: "upi" | "bank" }
  | { ok: false; reason: "too_short" | "too_long" | "invalid_chars" };

export function validateUtr(input: string): UtrVerdict {
  const utr = normalizeUtr(input);
  if (!/^[A-Z0-9]+$/.test(utr)) return { ok: false, reason: "invalid_chars" };
  if (utr.length < 12) return { ok: false, reason: "too_short" };
  if (utr.length > 22) return { ok: false, reason: "too_long" };
  return { ok: true, utr, kind: utr.length === 12 ? "upi" : "bank" };
}

/* ------------------------------------------------------------------ */
/* What each mode does at each point                                   */
/* ------------------------------------------------------------------ */

export type SettlementPlan = {
  /** Does a Payout row get created when the code is redeemed? */
  createsPayout: boolean;
  /** Is commission deducted at source, or invoiced weekly? */
  commissionCollection: "at_source" | "weekly_invoice";
  /** Who the guest actually pays. */
  payee: "hotel" | "platform";
  /** What the check-in code triggers. */
  codeTriggers: "proof_of_stay" | "fund_release";
};

export function planFor(mode: SettlementMode): SettlementPlan {
  return mode === "escrow"
    ? {
        createsPayout: true,
        commissionCollection: "at_source",
        payee: "platform",
        codeTriggers: "fund_release",
      }
    : {
        createsPayout: false,
        commissionCollection: "weekly_invoice",
        payee: "hotel",
        codeTriggers: "proof_of_stay",
      };
}

/**
 * In manual mode the full breakup is still computed and stored — you need the
 * commission and GST figures for Monday's invoice. What is skipped is the
 * money movement, not the arithmetic.
 */
export function shouldComputeBreakup(_mode: SettlementMode): boolean {
  return true;
}
