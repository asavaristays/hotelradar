/**
 * Run with:  npx tsx src/lib/verify.ts
 * These are the assertions worth keeping in CI.
 */

import {
  generateCheckInCode,
  generateUniqueCheckInCode,
  parseCheckInCode,
  generateOppCode,
  financialYear,
  formatInvoiceNumber,
  checkCharacter,
  ALPHABET,
} from "./codes.js";
import {
  computeBreakup,
  assertBreakupValid,
  grossFromTariff,
  formatINR,
  payoutAdviceLines,
} from "./money.js";
import { canTransition, isWithinBookingWindow } from "./booking-state.js";

let failures = 0;
function check(label: string, condition: boolean) {
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${label}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

console.log("\n— Check-in code —");
const code = generateCheckInCode();
console.log(`  sample: ${code.display}`);
check("round trips", parseCheckInCode(code.display).ok);
check("case insensitive", parseCheckInCode(code.display.toLowerCase()).ok);
check("tolerates spaces", parseCheckInCode(` ${code.display} `).ok);

// Every single-character substitution must be rejected.
let substitutionsCaught = 0;
let substitutionsTried = 0;
for (let pos = 0; pos < 7; pos++) {
  for (const ch of ALPHABET) {
    if (ch === code.stored[pos]) continue;
    const mutated = code.stored.slice(0, pos) + ch + code.stored.slice(pos + 1);
    substitutionsTried++;
    if (!parseCheckInCode(mutated).ok) substitutionsCaught++;
  }
}
check(
  `catches all ${substitutionsTried} single-char errors`,
  substitutionsCaught === substitutionsTried,
);

// Adjacent transpositions.
let transTried = 0;
let transCaught = 0;
for (let i = 0; i < 6; i++) {
  if (code.stored[i] === code.stored[i + 1]) continue;
  const arr = code.stored.split("");
  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  transTried++;
  if (!parseCheckInCode(arr.join("")).ok) transCaught++;
}
check(`catches all ${transTried} adjacent transpositions`, transCaught === transTried);

console.log("\n— Uniqueness —");
// 32^6 ≈ 1.07bn. At 50k codes the birthday bound predicts ~1 collision, so
// entropy alone is NOT the guarantee — the DB unique constraint is.
const seen = new Set<string>();
for (let i = 0; i < 50000; i++) seen.add(generateCheckInCode().stored);
const collisions = 50000 - seen.size;
console.log(`  50k codes → ${collisions} collision(s), as expected`);
check("collisions stay in single digits", collisions < 10);

// The retry helper is what actually protects us.
const taken = new Set(["AAAAAAA"]);
const unique = await generateUniqueCheckInCode(async (s: string) => taken.has(s));
check("retry helper returns an unused code", !taken.has(unique.stored));

let forcedAttempts = 0;
try {
  await generateUniqueCheckInCode(async () => {
    forcedAttempts++;
    return true; // everything is taken
  }, 3);
  check("gives up loudly when namespace is exhausted", false);
} catch {
  check("gives up loudly when namespace is exhausted", forcedAttempts === 3);
}

console.log("\n— OPP code & invoice numbering —");
console.log(`  sample: ${generateOppCode(new Date("2026-08-09"))}`);
check("FY Aug 2026 is 26-27", financialYear(new Date("2026-08-09")) === "26-27");
check("FY Feb 2027 is 26-27", financialYear(new Date("2027-02-14")) === "26-27");
check("FY Apr 2027 is 27-28", financialYear(new Date("2027-04-01")) === "27-28");
check(
  "invoice format",
  formatInvoiceNumber("HR", "26-27", 418) === "HR/26-27/000418",
);

console.log("\n— ₹10,000 booking, 18% room GST, 12% commission —");
const b = computeBreakup({
  grossCollectedPaise: 1_000_000n,
  roomGstRateBps: 1800,
  commissionRateBps: 1200,
  gatewayBorneBy: "hotel",
});
assertBreakupValid(b);
for (const line of payoutAdviceLines(b)) {
  console.log(
    `  ${line.negative ? "-" : " "} ${line.label.padEnd(32)} ${formatINR(line.paise)}`,
  );
}
check("base + GST = gross", b.baseTariffPaise + b.roomGstPaise === 1_000_000n);
check("base ≈ ₹8,475", b.baseTariffPaise === 847_458n);
check("commission ≈ ₹1,017", b.commissionPaise === 101_695n);
check("commission GST ≈ ₹183", b.commissionGstPaise === 18_305n);
check("CGST + SGST = commission GST", b.cgstPaise + b.sgstPaise === b.commissionGstPaise);
check("gateway = ₹200", b.gatewayFeePaise === 20_000n);
check("payout = ₹8,600", b.netPayoutPaise === 860_000n);
check("agent turnover is zero", b.platformTurnoverPaise === 0n);
check("agent mode", b.commercialMode === "agent");

console.log("\n— Principal mode (gross = platform turnover) —");
const bp = computeBreakup({
  grossCollectedPaise: 1_000_000n,
  roomGstRateBps: 1800,
  commissionRateBps: 1200,
  gatewayBorneBy: "hotel",
  commercialMode: "principal",
});
assertBreakupValid(bp);
check("principal turnover = gross", bp.platformTurnoverPaise === 1_000_000n);
check("principal has no intermediary GST", bp.commissionGstPaise === 0n);
check(
  "principal hotel net = base − margin − gateway",
  bp.netPayoutPaise === bp.baseTariffPaise - bp.commissionPaise - bp.gatewayFeePaise,
);

console.log("\n— TCS 0.5% on base (agent) —");
const bt = computeBreakup({
  grossCollectedPaise: 1_000_000n,
  roomGstRateBps: 1800,
  commissionRateBps: 1200,
  gatewayBorneBy: "hotel",
  tcsBps: 50,
});
assertBreakupValid(bt);
check("TCS ≈ ₹423.73", bt.tcsPaise === 4_237n);
check("TCS reduces payout", bt.netPayoutPaise === 860_000n - bt.tcsPaise);

console.log("\n— 5% GST band (rooms under ₹7,500) —");
const b5 = computeBreakup({
  grossCollectedPaise: 500_000n,
  roomGstRateBps: 500,
  commissionRateBps: 1200,
});
assertBreakupValid(b5);
console.log(`  base ${formatINR(b5.baseTariffPaise)} · payout ${formatINR(b5.netPayoutPaise)}`);
check("5% band base ≈ ₹4,761.90", b5.baseTariffPaise === 476_190n);
check("invariant holds", b5.baseTariffPaise + b5.roomGstPaise === 500_000n);

console.log("\n— Rounding: 10k random amounts must never break the invariant —");
let broken = 0;
for (let i = 0; i < 10000; i++) {
  const gross = BigInt(Math.floor(Math.random() * 5_000_000) + 100_000);
  const rate = [500, 1200, 1800][i % 3];
  const r = computeBreakup({
    grossCollectedPaise: gross,
    roomGstRateBps: rate,
    commissionRateBps: 1200,
  });
  try {
    assertBreakupValid(r);
  } catch {
    broken++;
  }
}
check("no invariant breaks", broken === 0);

console.log("\n— Pricing up from a rate sheet —");
const gross = grossFromTariff(450_000n, 2, 1800);
console.log(`  ₹4,500/night × 2 nights + 18% = ${formatINR(gross)}`);
check("gross = ₹10,620", gross === 1_062_000n);

console.log("\n— State machine —");
check("payment_received → confirmed", canTransition("payment_received", "confirmed"));
check("no skipping to checked_in", !canTransition("payment_pending", "checked_in"));
check("completed is terminal", !canTransition("completed", "checked_in"));

console.log("\n— 48-hour window —");
const now = new Date("2026-08-09T12:00:00Z");
check("same-day allowed", isWithinBookingWindow(new Date("2026-08-09T20:00:00Z"), now));
check("47h ahead allowed", isWithinBookingWindow(new Date("2026-08-11T11:00:00Z"), now));
check("72h ahead rejected", !isWithinBookingWindow(new Date("2026-08-12T12:00:00Z"), now));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
