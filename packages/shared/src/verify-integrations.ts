/**
 * Run with: npx tsx src/lib/verify-integrations.ts
 */

import {
  seasonFor,
  dowBit,
  matchRateRow,
  buildQuote,
  isSheetUsable,
  type RateRow,
} from "./rate-engine.js";
import {
  evaluateAttestation,
  validateUtr,
  planFor,
  ATTESTATION_TIMEOUT_MS,
} from "./settlement.js";
import {
  selectHotels,
  scoreHotel,
  dueEscalations,
  contactRoleForHour,
  type RoutableHotel,
} from "./routing.js";
import { isUngrounded, TOOLS } from "./assistant.js";
import {
  TEMPLATES,
  renderTemplate,
  canSendFreeform,
  estimateTaxiPaise,
  describeTravel,
  originKey,
} from "./comms.js";
import { formatINR } from "./money.js";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
}

console.log("\n— Goa season calendar —");
check("August is monsoon", seasonFor(new Date("2026-08-15")) === "monsoon");
check("November is shoulder", seasonFor(new Date("2026-11-10")) === "shoulder");
check("mid-December is peak", seasonFor(new Date("2026-12-10")) === "peak");
check("Christmas is xmas_ny", seasonFor(new Date("2026-12-25")) === "xmas_ny");
check("2 Jan is still xmas_ny", seasonFor(new Date("2027-01-02")) === "xmas_ny");
check("mid-Jan is peak", seasonFor(new Date("2027-01-20")) === "peak");

console.log("\n— Day-of-week bitmask —");
check("Monday = 1", dowBit(new Date("2026-08-10")) === 1);
check("Saturday = 32", dowBit(new Date("2026-08-15")) === 32);
check("Sunday = 64", dowBit(new Date("2026-08-16")) === 64);

const baseRow: RateRow = {
  id: "row-1",
  roomType: "deluxe",
  season: "shoulder",
  dowMask: 127,
  floorTariffPaise: 450_000n,
  minNights: 1,
  maxNights: 7,
  maxOccupancy: 2,
  advanceHoursMin: 0,
  inclusions: ["breakfast"],
  blackoutDates: [],
};

console.log("\n— Rate matching —");
const req = {
  checkIn: new Date("2026-11-14"),
  checkOut: new Date("2026-11-16"),
  nights: 2,
  adults: 2,
  children: 0,
  leadTimeHours: 30,
};
check("matches a valid request", matchRateRow([baseRow], req).matched);
check("empty sheet reports no_rows", (() => {
  const r = matchRateRow([], req);
  return !r.matched && r.reason === "no_rows";
})());
check("rejects over-occupancy", (() => {
  const r = matchRateRow([baseRow], { ...req, adults: 4 });
  return !r.matched && r.reason === "occupancy";
})());
check("rejects below min nights", (() => {
  const r = matchRateRow([{ ...baseRow, minNights: 3 }], req);
  return !r.matched && r.reason === "min_nights";
})());
check("rejects insufficient notice", (() => {
  const r = matchRateRow([{ ...baseRow, advanceHoursMin: 48 }], {
    ...req,
    leadTimeHours: 6,
  });
  return !r.matched && r.reason === "advance_notice";
})());
check("weekday-only sheet rejects a weekend stay", (() => {
  // Sat 14 Nov 2026 → Mon–Fri mask (1+2+4+8+16 = 31)
  const r = matchRateRow([{ ...baseRow, dowMask: 31 }], {
    ...req,
    checkIn: new Date("2026-11-14"),
  });
  return !r.matched && r.reason === "day_of_week";
})());
check("blackout on the second night blocks it", (() => {
  const r = matchRateRow(
    [{ ...baseRow, blackoutDates: [new Date("2026-11-15")] }],
    req,
  );
  return !r.matched && r.reason === "blackout";
})());
check("picks the cheapest eligible row", (() => {
  const cheap = { ...baseRow, id: "cheap", floorTariffPaise: 380_000n };
  const r = matchRateRow([baseRow, cheap], req);
  return r.matched && r.row.id === "cheap";
})());

console.log("\n— Quote —");
const m = matchRateRow([baseRow], req);
if (m.matched) {
  const q = buildQuote(m.row, req, 1200, new Date("2026-11-12T10:00:00Z"));
  console.log(`  ₹4,500 × 2 nights + 12% GST = ${formatINR(q.grossPaise)}`);
  check("gross = ₹10,080", q.grossPaise === 1_008_000n);
  check("holds 45 min out", q.holdsUntil.toISOString() === "2026-11-12T10:45:00.000Z");
}

console.log("\n— Sheet expiry —");
const sheet = {
  status: "active",
  expiresAt: new Date("2026-12-01"),
  effectiveFrom: new Date("2026-09-01"),
  effectiveTo: new Date("2027-03-31"),
};
check("usable in November", isSheetUsable(sheet, new Date("2026-11-14"), new Date("2026-11-12")));
check("expired sheet never quotes", !isSheetUsable(sheet, new Date("2026-12-20"), new Date("2026-12-15")));
check("draft sheet never quotes", !isSheetUsable({ ...sheet, status: "draft" }, new Date("2026-11-14"), new Date("2026-11-12")));

console.log("\n— Dual attestation —");
const t0 = new Date("2026-11-12T10:00:00Z");
const soon = new Date(t0.getTime() + 60_000);
const late = new Date(t0.getTime() + ATTESTATION_TIMEOUT_MS + 1000);
check("both attested → confirm", evaluateAttestation({ guestAttestedAt: soon, hotelAttestedAt: soon, utr: "123456789012" }, t0, soon).action === "confirm");
check("guest only, early → wait for hotel", (() => {
  const v = evaluateAttestation({ guestAttestedAt: soon, hotelAttestedAt: null, utr: "1" }, t0, soon);
  return v.action === "wait" && v.waitingFor === "hotel";
})());
check("guest only, overdue → exception", (() => {
  const v = evaluateAttestation({ guestAttestedAt: soon, hotelAttestedAt: null, utr: "1" }, t0, late);
  return v.action === "raise_exception" && v.missing === "hotel";
})());
check("neither → wait for guest", evaluateAttestation({ guestAttestedAt: null, hotelAttestedAt: null, utr: null }, t0, soon).action === "wait");

console.log("\n— UTR —");
check("12-digit UPI ref accepted", (() => {
  const v = validateUtr("412345678901");
  return v.ok && v.kind === "upi";
})());
check("16-char bank ref accepted", (() => {
  const v = validateUtr("SBIN0123456789AB");
  return v.ok && v.kind === "bank";
})());
check("strips spaces and hyphens", validateUtr(" 4123-4567-8901 ").ok);
check("rejects short junk", !validateUtr("12345").ok);
check("rejects symbols", !validateUtr("4123$5678901!").ok);

console.log("\n— Settlement modes —");
check("manual invoices weekly", planFor("direct_to_hotel").commissionCollection === "weekly_invoice");
check("manual creates no payout", planFor("direct_to_hotel").createsPayout === false);
check("manual code proves the stay", planFor("direct_to_hotel").codeTriggers === "proof_of_stay");
check("escrow releases funds", planFor("escrow").codeTriggers === "fund_release");

console.log("\n— Routing —");
const hotel = (over: Partial<RoutableHotel>): RoutableHotel => ({
  id: "h", belt: "morjim", stopSell: false, status: "live",
  instantQuoteEnabled: false, medianResponseSeconds: 300, responseRate: 0.8,
  distanceMeters: 4000, hasAvailability: true, ...over,
});
check("fans out to three", selectHotels(
  [hotel({ id: "a" }), hotel({ id: "b" }), hotel({ id: "c" }), hotel({ id: "d" })],
  { preferredBelt: "morjim", atHour: 14 },
).hotels.length === 3);
check("skips stop-sell", (() => {
  const d = selectHotels([hotel({ id: "a", stopSell: true }), hotel({ id: "b" })], { preferredBelt: "morjim", atHour: 14 });
  return d.hotels.every((h) => h.id !== "a");
})());
check("thin belt is reported", selectHotels([hotel({ id: "a" })], { preferredBelt: "morjim", atHour: 14 }).shortfallReason === "belt_thin");
check("all stop-sell is reported", selectHotels([hotel({ stopSell: true })], { preferredBelt: "morjim", atHour: 14 }).shortfallReason === "all_stop_sell");
check("at 2 AM a rate sheet outranks a faster desk", (() => {
  const withSheet = hotel({ id: "sheet", instantQuoteEnabled: true, medianResponseSeconds: 600 });
  const withoutSheet = hotel({ id: "desk", instantQuoteEnabled: false, medianResponseSeconds: 60 });
  const night = { preferredBelt: "morjim", atHour: 2 };
  return scoreHotel(withSheet, night) > scoreHotel(withoutSheet, night);
})());
check("night routes to night_desk", contactRoleForHour(2) === "night_desk");
check("afternoon routes to front_desk", contactRoleForHour(15) === "front_desk");

console.log("\n— Escalation ladder —");
const sentAt = new Date("2026-11-12T10:00:00Z");
check("nothing due at 2 min", dueEscalations(sentAt, [], new Date(sentAt.getTime() + 2 * 60_000)).length === 0);
check("reminder due at 6 min", dueEscalations(sentAt, [], new Date(sentAt.getTime() + 6 * 60_000)).some((s) => s.action === "remind_whatsapp"));
check("does not repeat a done step", !dueEscalations(sentAt, ["remind_whatsapp"], new Date(sentAt.getTime() + 6 * 60_000)).some((s) => s.action === "remind_whatsapp"));
check("widen search by 16 min", dueEscalations(sentAt, [], new Date(sentAt.getTime() + 16 * 60_000)).some((s) => s.action === "widen_search"));

console.log("\n— Assistant grounding —");
check("price with no tool call is flagged", isUngrounded("That room is ₹4,500 a night.", []));
check("price after a quote tool is fine", !isUngrounded("That room is ₹4,500 a night.", ["quote_from_rate_sheet"]));
check("price after only a photo call is flagged", isUngrounded("It's ₹4,500.", ["get_hotel_media"]));
check("non-price chat is never flagged", !isUngrounded("Which area were you thinking of?", []));
check("Rs. form is caught too", isUngrounded("Rs. 4,500 per night", []));
check("all tools have schemas", TOOLS.every((t) => t.name && t.description && t.input_schema));

console.log("\n— WhatsApp —");
const offer = TEMPLATES.find((t) => t.key === "offer_ready")!;
console.log(`  ${renderTemplate(offer, ["Rahul", "Casa Verde", "₹10,080", "9:42 PM", "hr.in/x7"])}`);
check("renders all variables", !renderTemplate(offer, ["a", "b", "c", "d", "e"]).includes("{{"));
check("wrong variable count throws", (() => {
  try { renderTemplate(offer, ["only-one"]); return false; } catch { return true; }
})());
check("freeform allowed inside 24h", canSendFreeform(new Date(Date.now() - 3600_000)));
check("freeform blocked after 24h", !canSendFreeform(new Date(Date.now() - 25 * 3600_000)));
check("no inbound means template only", !canSendFreeform(null));

console.log("\n— Travel —");
console.log(`  8 km → ${describeTravel(14 * 60, 8000)}`);
check("taxi has a floor", estimateTaxiPaise(500) === 18_000n);
check("8 km ≈ ₹390", estimateTaxiPaise(8000) === 39_000n);
check("origin key rounds to ~1km", originKey(15.6297, 73.7342) === "15.63,73.73");
check("nearby guests share a cache key", originKey(15.6301, 73.7338) === originKey(15.6297, 73.7342));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
