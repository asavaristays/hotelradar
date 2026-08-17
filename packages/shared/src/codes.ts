/**
 * Code generation for HotelRADAR.
 *
 * Three code types, three different jobs. Do not reuse formats.
 *
 *   OPP code       OPP-26H-4K7M2   guest session, unguessable
 *   Check-in code  4K7M2H-9        releases money, checksummed
 *   Invoice number HR/26-27/000418 gapless, GST-compliant
 */

import { randomInt } from "node:crypto";

/**
 * Crockford base32 without I, L, O, U.
 * A guest reading a code down a phone line will never confuse 0 with O
 * or 1 with I, because O and I are not in the alphabet.
 */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const N = ALPHABET.length; // 32

/** Crockford's canonical substitutions, applied before any lookup. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** CSPRNG-backed random string. Never use Math.random for these. */
function randomChars(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(N)];
  return out;
}

/* ------------------------------------------------------------------ */
/* Luhn mod N — check character over the base32 alphabet               */
/* ------------------------------------------------------------------ */
/**
 * Catches every single-character error and every adjacent transposition.
 * This matters because the check-in code triggers a payout: a typo must
 * fail loudly rather than silently match a different booking.
 */
export function checkCharacter(body: string): string {
  let factor = 2;
  let sum = 0;

  for (let i = body.length - 1; i >= 0; i--) {
    const codePoint = ALPHABET.indexOf(body[i]);
    if (codePoint < 0) throw new Error(`Character not in alphabet: ${body[i]}`);

    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }

  return ALPHABET[(N - (sum % N)) % N];
}

export function isChecksumValid(bodyWithCheck: string): boolean {
  if (bodyWithCheck.length < 2) return false;
  const body = bodyWithCheck.slice(0, -1);
  const check = bodyWithCheck.slice(-1);
  try {
    return checkCharacter(body) === check;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* OPP code                                                            */
/* ------------------------------------------------------------------ */

/** Month letter A–L. Compact and sortable-ish without leaking a sequence. */
function monthLetter(d: Date): string {
  return String.fromCharCode(65 + d.getUTCMonth());
}

/**
 * OPP-26H-4K7M2
 *
 * Random, not sequential: guessable OPP codes would let anyone enumerate
 * other people's bookings.
 */
export function generateOppCode(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  return `OPP-${yy}${monthLetter(now)}-${randomChars(5)}`;
}

/* ------------------------------------------------------------------ */
/* Check-in code                                                       */
/* ------------------------------------------------------------------ */

export type CheckInCode = {
  /** Stored form, no separator: 4K7M2H9 */
  stored: string;
  /** Shown to the guest: 4K7M2H-9 */
  display: string;
};

/**
 * Six body characters plus one check character.
 * Issued at booking_confirmed — never before, and never sent to the hotel
 * in advance. The guest hands it over at the desk. That is the point.
 */
export function generateCheckInCode(): CheckInCode {
  const body = randomChars(6);
  const check = checkCharacter(body);
  return { stored: body + check, display: `${body}-${check}` };
}

/**
 * Six body characters gives 32^6 ≈ 1.07 billion combinations. That is plenty
 * against brute force, but NOT enough to assume uniqueness by chance: at
 * 50,000 codes the birthday bound predicts roughly one collision.
 *
 * So uniqueness comes from the database, not from entropy. Pass a callback
 * that checks BookingCode, and keep the UNIQUE constraint on the column as
 * the real guarantee — this retry only avoids the error, it does not replace
 * the constraint.
 *
 * Only unredeemed, unexpired codes actually need to be distinct, so the live
 * namespace stays small and retries are vanishingly rare in practice.
 */
export async function generateUniqueCheckInCode(
  exists: (stored: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<CheckInCode> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateCheckInCode();
    if (!(await exists(candidate.stored))) return candidate;
  }
  throw new Error(
    `Could not generate a unique check-in code in ${maxAttempts} attempts`,
  );
}

export type CodeParseResult =
  | { ok: true; stored: string }
  | { ok: false; reason: "malformed" | "checksum" };

/**
 * Parse whatever the front desk typed. Accepts lowercase, spaces, hyphens,
 * and Crockford's O/I/L confusions.
 */
export function parseCheckInCode(input: string): CodeParseResult {
  const normalized = normalizeCode(input);
  if (normalized.length !== 7) return { ok: false, reason: "malformed" };
  if (!/^[0-9A-Z]+$/.test(normalized)) return { ok: false, reason: "malformed" };
  if (!isChecksumValid(normalized)) return { ok: false, reason: "checksum" };
  return { ok: true, stored: normalized };
}

/* ------------------------------------------------------------------ */
/* Booking reference                                                   */
/* ------------------------------------------------------------------ */

/** HR-482910 — guest-facing, spoken aloud, no checksum needed. */
export function generateBookingRef(): string {
  return `HR-${randomInt(100000, 1000000)}`;
}

/* ------------------------------------------------------------------ */
/* Financial year and invoice numbers                                  */
/* ------------------------------------------------------------------ */

/** Indian FY runs April–March. 9 Aug 2026 → "26-27". */
export function financialYear(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

/**
 * HR/26-27/000418
 *
 * The sequence number MUST come from InvoiceSequence under a row lock,
 * inside the same transaction that inserts the invoice. Generating it in
 * application code leaves gaps when a transaction rolls back, and GST
 * invoice series must be gapless within a financial year.
 *
 * See nextInvoiceNumber() in invoicing.ts for the correct usage.
 */
export function formatInvoiceNumber(
  series: string,
  fy: string,
  sequence: bigint | number,
): string {
  return `${series}/${fy}/${String(sequence).padStart(6, "0")}`;
}
