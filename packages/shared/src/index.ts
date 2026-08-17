export { HOTELRADAR_BRAND, type HotelRadarBrand } from "./brand.js";

export {
  ALPHABET,
  normalizeCode,
  checkCharacter,
  isChecksumValid,
  generateOppCode,
  generateCheckInCode,
  generateUniqueCheckInCode,
  parseCheckInCode,
  generateBookingRef,
  financialYear,
  formatInvoiceNumber,
  type CheckInCode,
  type CodeParseResult,
} from "./codes.js";

export {
  GST_ON_COMMISSION_BPS,
  DEFAULT_GATEWAY_BPS,
  TCS_BPS_OPTIONS,
  splitGstInclusive,
  computeBreakup,
  grossFromTariff,
  assertBreakupValid,
  formatINR,
  payoutAdviceLines,
  type GatewayBorneBy,
  type CommercialMode,
  type BreakupInput,
  type Breakup,
} from "./money.js";

export {
  BOOKING_TRANSITIONS,
  TERMINAL_BOOKING_STATES,
  canTransition,
  assertTransition,
  BOOKING_TIMEOUTS,
  timeoutDueAt,
  OPP_TRANSITIONS,
  canTransitionOpp,
  BOOKING_WINDOW_HOURS,
  isWithinBookingWindow,
  OFFER_GRACE_MS,
  isOfferAcceptable,
  shouldAccrueCommission,
  type BookingStatus,
  type OppStatus as DomainOppStatus,
  type TimeoutRule,
} from "./booking-state.js";

export {
  LEGACY_OPP_STATUS,
  canonicalOppStatus,
  MIGRATION_SQL as OPP_STATUS_MIGRATION_SQL,
} from "./status-map.js";

export {
  SettlementViolation,
  assertPayoutAllowed,
  payoutsScreenCopy,
  VALID_EXCEPTION_TYPES,
  MISFILED_AS_EXCEPTION,
  isValidExceptionType,
  assertExceptionType,
  isEnumerableOppCode,
  PILOT_DESTINATIONS,
  isInPilotScope,
  dispositionFor,
  ROUTABLE_BELTS,
  canGoLive,
  type ValidExceptionType,
} from "./guards.js";

export {
  TILES,
  ATTESTATION_QUEUE_SQL,
  HOTEL_SCORECARD_SQL,
  formatTileValue,
  type TileSpec,
} from "./metrics.js";

export {
  seasonFor,
  dowBit,
  stayNights,
  matchRateRow,
  buildQuote,
  isQuoteWithinFloor,
  isSheetUsable,
  OFFER_HOLD_MINUTES,
  type Season,
  type RateRow,
  type QuoteRequest,
  type NoMatchReason,
  type MatchResult,
  type Quote,
} from "./rate-engine.js";

export {
  evaluateAttestation,
  normalizeUtr,
  validateUtr,
  planFor,
  shouldComputeBreakup,
  ATTESTATION_TIMEOUT_MS,
  type SettlementMode,
  type AttestationState,
  type AttestationVerdict,
  type UtrVerdict,
  type SettlementPlan,
} from "./settlement.js";

export {
  scoreHotel,
  selectHotels,
  dueEscalations,
  contactRoleForHour,
  DEFAULT_FAN_OUT,
  MIN_RESPONSE_RATE,
  ESCALATION_LADDER,
  type RoutableHotel,
  type RoutingRequest,
  type RoutingDecision,
  type EscalationStep,
} from "./routing.js";

export {
  TOOLS,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
  isUngrounded,
  type ToolDefinition,
} from "./assistant.js";

export {
  TEMPLATES,
  renderTemplate,
  canSendFreeform,
  SESSION_WINDOW_MS,
  originKey,
  TRAVEL_CACHE_TTL_MS,
  TAXI_BASE_PAISE,
  TAXI_PER_KM_PAISE,
  estimateTaxiPaise,
  describeTravel,
  isCacheFresh,
  type TemplateSpec,
} from "./comms.js";

/** Legacy Direct opportunity statuses (ops spine). Prefer domain OppStatus via status-map. */
export const OPPORTUNITY_STATUSES = [
  "draft",
  "verification_pending",
  "verifying",
  "verified",
  "qualified",
  "routed",
  "hotel_notified",
  "offer_received",
  "offer_sent",
  "offers_live",
  "traveller_accepted",
  "converted",
  "hotel_confirmed",
  "stay_completed",
  "commission_due",
  "settled",
  "no_offers",
  "abandoned",
  "expired",
  "more_details_needed",
  "hotel_declined",
  "offer_expired",
  "cancelled",
  "issue_review",
  "connector_failed",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const EVENT_TYPES = [
  "opportunity.created",
  "consent.verified",
  "referral.recorded",
  "opportunity.qualified",
  "route.sent",
  "hotel.responded",
  "offer.issued",
  "offer.expired",
  "offer.accepted",
  "booking.created",
  "payment.settled",
  "stay.completed",
  "stay.cancelled",
  "commission.booked",
  "exception.raised",
  "code.issued",
  "code.redeemed",
  "invoice.issued",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const DESTINATIONS = ["Goa", "Rajasthan"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export type CreateOpportunityInput = {
  name: string;
  mobile: string;
  email?: string | null;
  consent_version: string;
  consent: boolean;
  destination: Destination;
  requested_area: string;
  requested_property?: string | null;
  check_in: string;
  check_out: string;
  rooms?: number;
  adults?: number;
  children?: number;
  budget_paise?: number | null;
  public_rate_paise?: number | null;
  preferences?: string[];
  special_request?: string | null;
  referral_code?: string | null;
};

/** @deprecated Prefer generateOppCode() — sequential IDs are enumerable. */
export function formatOpportunityId(date = new Date(), sequence: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `OPP-${y}${m}${d}-${String(sequence).padStart(4, "0")}`;
}

/** @deprecated Prefer generateBookingRef() for guest-facing refs. */
export function formatHotelBookingId(date = new Date(), sequence: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `HRB-${y}${m}${d}-${String(sequence).padStart(4, "0")}`;
}
