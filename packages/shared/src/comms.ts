/**
 * WhatsApp templates and travel time.
 *
 * Both are thin, but both have a detail that bites if missed: template
 * approval takes days, and travel-time API calls cost money on every repeat
 * of the same pair.
 */

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

export type TemplateSpec = {
  key: string;
  category: "UTILITY" | "MARKETING";
  variables: string[];
  body: string;
  /** Why it exists. Meta rejects templates that read as marketing. */
  purpose: string;
};

/**
 * Submit all of these for approval in week one. Approval takes days and a
 * rejection costs another cycle, so do not leave it until launch week.
 *
 * Outside a 24-hour session window you can only send an approved template.
 * That is exactly the situation for an offer landing while the guest is away,
 * which is the whole reason the 48-hour model works.
 */
export const TEMPLATES: TemplateSpec[] = [
  {
    key: "offer_ready",
    category: "UTILITY",
    variables: ["guest_name", "hotel_name", "amount", "holds_until", "link"],
    body: "Hi {{1}}, {{2}} has sent your private rate: {{3}} total. Held until {{4}}. View and confirm: {{5}}",
    purpose: "The offer must reach the guest who closed the tab.",
  },
  {
    key: "payment_instructions",
    category: "UTILITY",
    variables: ["hotel_name", "amount", "upi_id", "booking_ref"],
    body: "To confirm {{1}}: pay {{2}} to {{3}}. Then send us the UTR number here. Ref {{4}}.",
    purpose: "Manual settlement — the guest pays the hotel directly.",
  },
  {
    key: "booking_confirmed_with_code",
    category: "UTILITY",
    variables: ["hotel_name", "check_in", "code", "booking_ref"],
    body: "Confirmed at {{1}} for {{2}}. Show this code at check-in: {{3}}. Ref {{4}}.",
    purpose: "The code is the guest's proof and the hotel's trigger.",
  },
  {
    key: "hotel_offer_request",
    category: "UTILITY",
    variables: ["dates", "guests", "room_type", "respond_link"],
    body: "New request: {{1}}, {{2}}, {{3}}. Verified guest. Send your rate or decline: {{4}}",
    purpose: "Goes to the desk phone, one tap, never a portal login.",
  },
  {
    key: "hotel_payment_check",
    category: "UTILITY",
    variables: ["guest_name", "amount", "booking_ref"],
    body: "Has {{1}} paid {{2}} for booking {{3}}? Reply YES or NO.",
    purpose: "The hotel half of dual attestation.",
  },
  {
    key: "day1_checkin",
    category: "UTILITY",
    variables: ["guest_name", "hotel_name"],
    body: "Hi {{1}}, settled in at {{2}}? If you'd like somewhere different for tomorrow, just reply and we'll find it.",
    purpose:
      "The hop loop. This one message turns a booking into a chain and costs nothing in acquisition.",
  },
  {
    key: "post_stay_review",
    category: "UTILITY",
    variables: ["guest_name", "hotel_name"],
    body: "Hi {{1}}, how was {{2}}? One line is enough — it decides whether we keep sending guests there.",
    purpose: "Your only real quality signal on supply.",
  },
];

export function renderTemplate(spec: TemplateSpec, values: string[]): string {
  if (values.length !== spec.variables.length) {
    throw new Error(
      `Template ${spec.key} expects ${spec.variables.length} values, got ${values.length}`,
    );
  }
  return spec.body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] ?? "");
}

/** Free-form replies are only allowed inside 24 hours of the guest's last message. */
export const SESSION_WINDOW_MS = 24 * 3600_000;

export function canSendFreeform(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < SESSION_WINDOW_MS;
}

/* ------------------------------------------------------------------ */
/* Travel time                                                         */
/* ------------------------------------------------------------------ */

/**
 * Round the origin to roughly a kilometre so nearby guests share a cache
 * entry. Goa's road network does not change; the same origin-hotel pairs
 * recur constantly, and an uncached implementation will quietly become your
 * largest API bill.
 */
export function originKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export const TRAVEL_CACHE_TTL_MS = 30 * 24 * 3600_000; // 30 days

/**
 * Goa taxi pricing is fare-by-distance with a minimum. Approximate is fine —
 * the point is that the guest sees the real cost of a "cheaper" hotel that is
 * forty minutes away.
 */
export const TAXI_BASE_PAISE = 15_000n; // ₹150 minimum
export const TAXI_PER_KM_PAISE = 3_000n; // ₹30/km

export function estimateTaxiPaise(meters: number): bigint {
  const km = BigInt(Math.ceil(meters / 1000));
  const fare = TAXI_BASE_PAISE + km * TAXI_PER_KM_PAISE;
  return fare < TAXI_BASE_PAISE ? TAXI_BASE_PAISE : fare;
}

export function describeTravel(seconds: number, meters: number): string {
  const mins = Math.round(seconds / 60);
  const taxi = estimateTaxiPaise(meters);
  const rupees = Number(taxi) / 100;
  return `${mins} min drive, roughly ₹${rupees.toFixed(0)} by taxi`;
}

export function isCacheFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < TRAVEL_CACHE_TTL_MS;
}
