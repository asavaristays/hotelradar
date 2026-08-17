import { canonicalOppStatus } from "./status-map.js";
import {
  assertPayoutAllowed, SettlementViolation, payoutsScreenCopy,
  isValidExceptionType, assertExceptionType, isEnumerableOppCode,
  isInPilotScope, dispositionFor, canGoLive,
} from "./guards.js";
import { formatTileValue, TILES } from "./metrics.js";
import { generateOppCode } from "./codes.js";

let f = 0;
const check = (l: string, ok: boolean) => { if (!ok) f++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${l}`); };

console.log("\n— Status reconciliation —");
check("verification_pending → verifying", canonicalOppStatus("verification_pending") === "verifying");
check("traveller_accepted → converted", canonicalOppStatus("traveller_accepted") === "converted");
check("awaiting_hotel → routed", canonicalOppStatus("awaiting_hotel") === "routed");
check("unknown status returns null", canonicalOppStatus("bogus_state") === null);

console.log("\n— Payout guard —");
check("manual mode blocks Payout rows", (() => {
  try { assertPayoutAllowed("direct_to_hotel"); return false; }
  catch (e) { return e instanceof SettlementViolation; }
})());
check("escrow mode allows Payout rows", (() => {
  try { assertPayoutAllowed("escrow"); return true; } catch { return false; }
})());
check("screen copy is honest in manual mode", payoutsScreenCopy("direct_to_hotel").includes("No payouts"));

console.log("\n— Exception taxonomy —");
check("paid_not_confirmed is valid", isValidExceptionType("paid_not_confirmed"));
check("attestation_incomplete is valid", isValidExceptionType("attestation_incomplete"));
check("offer_accepted_handoff rejected", !isValidExceptionType("offer_accepted_handoff"));
check("verified_awaiting_route rejected", !isValidExceptionType("verified_awaiting_route"));
check("misfiled type explains itself", (() => {
  try { assertExceptionType("offer_accepted_handoff"); return false; }
  catch (e) { return (e as Error).message.includes("Event"); }
})());

console.log("\n— OPP code enumerability —");
check("shipped format is flagged", isEnumerableOppCode("OPP-20260808-0003"));
check("all three samples flagged", ["OPP-20260808-0001","OPP-20260808-0002","OPP-20260808-0003"].every(isEnumerableOppCode));
check("CSPRNG format passes", !isEnumerableOppCode(generateOppCode()));

console.log("\n— Pilot scope —");
check("Goa is in scope", isInPilotScope("Goa"));
check("Rajasthan is out of scope", !isInPilotScope("Rajasthan"));
check("out of scope is not routed", dispositionFor("Rajasthan").route === false);
check("out of scope excluded from coverage", dispositionFor("Rajasthan").countInCoverage === false);
check("out of scope still answers the guest", dispositionFor("Rajasthan").guestMessage !== null);

console.log("\n— Go-live checklist —");
const complete = { belt: "morjim", gstin: "30AABCU9603R1ZM", lat: 15.6, lng: 73.7, hasNightContact: true, hasActiveRateSheet: true };
check("complete hotel can go live", canGoLive(complete).ok);
check("belt 'other' blocks go-live", canGoLive({ ...complete, belt: "other" }).blockers.some(b => b.includes("Belt")));
check("missing GSTIN blocks go-live", canGoLive({ ...complete, gstin: null }).blockers.some(b => b.includes("GSTIN")));
check("missing night contact blocks", canGoLive({ ...complete, hasNightContact: false }).blockers.some(b => b.includes("Night desk")));
check("missing rate sheet blocks", canGoLive({ ...complete, hasActiveRateSheet: false }).blockers.some(b => b.includes("rate sheet")));

console.log("\n— Tiles —");
check("coverage tile exists", TILES.some(t => t.key === "offer_coverage"));
check("median response tile exists", TILES.some(t => t.key === "median_response"));
check("silent hotels tile exists", TILES.some(t => t.key === "silent_hotels"));
check("median formats as minutes", formatTileValue("median_response", 240) === "4m");
check("short median formats as seconds", formatTileValue("median_response", 45) === "45s");
check("coverage formats as percent", formatTileValue("offer_coverage", 78.4) === "78.4%");
console.log(`  commission tile: ${formatTileValue("commission_due", 101695)}`);

console.log(f === 0 ? "\nAll checks passed.\n" : `\n${f} FAILED\n`);
process.exit(f === 0 ? 0 : 1);
