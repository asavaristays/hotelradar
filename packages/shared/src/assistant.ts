/**
 * The assistant, on rails.
 *
 * Every factual claim about a property comes from a tool result. If no tool
 * returns the answer, the assistant says it does not know and offers to ask
 * the hotel. This is the difference between an assistant that feels reliable
 * and one that invents a rooftop pool and gets a guest angry at check-in.
 */

import { ROUTABLE_BELTS } from "./guards.js";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_hotels",
    description:
      "Find hotels matching a destination or the guest's current location. Returns only live properties with their belt, room types and headline nightly range. Use this before discussing any specific property.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string", description: "Area name as the guest said it" },
        lat: { type: "number", description: "Guest's current latitude, if in Goa" },
        lng: { type: "number" },
        check_in: { type: "string", description: "YYYY-MM-DD" },
        nights: { type: "integer" },
        adults: { type: "integer" },
        max_nightly_inr: { type: "integer" },
      },
      required: ["check_in", "nights", "adults"],
    },
  },
  {
    name: "get_hotel_media",
    description:
      "Fetch real photographs supplied by the hotel. Call this whenever the guest asks what somewhere looks like. If it returns nothing, say there are no photos on file and offer to ask the property — never describe a room you have not seen.",
    input_schema: {
      type: "object",
      properties: {
        hotel_id: { type: "string" },
        room_type: { type: "string" },
        kind: {
          type: "string",
          enum: ["room", "bathroom", "pool", "exterior", "breakfast", "beach_path", "view"],
        },
      },
      required: ["hotel_id"],
    },
  },
  {
    name: "get_travel_time",
    description:
      "Driving time and approximate taxi fare from the guest's current position to a hotel. Use this for guests already in Goa. Travel time is far more useful to them than distance in kilometres.",
    input_schema: {
      type: "object",
      properties: {
        hotel_id: { type: "string" },
        from_lat: { type: "number" },
        from_lng: { type: "number" },
      },
      required: ["hotel_id", "from_lat", "from_lng"],
    },
  },
  {
    name: "get_area_notes",
    description:
      "Local knowledge about a belt: noise, access, monsoon conditions, crowds. Written by the HotelRADAR team. Use it to give the honest picture, especially to first-time visitors who cannot tell Ashwem from Anjuna.",
    input_schema: {
      type: "object",
      properties: {
        belt: {
          type: "string",
          enum: [...ROUTABLE_BELTS],
          description: "North Goa belt slug (morjim, anjuna, arambol, ashwem, candolim, calangute, vagator, baga)",
        },
        month: { type: "integer", description: "1-12, for seasonal notes" },
      },
      required: ["belt"],
    },
  },
  {
    name: "quote_from_rate_sheet",
    description:
      "Attempt an instant private rate for one hotel from its approved rate sheet. Returns a quote or the reason none applies. If it returns no quote, the request goes to the hotel for a manual offer.",
    input_schema: {
      type: "object",
      properties: {
        hotel_id: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        adults: { type: "integer" },
        children: { type: "integer" },
        room_type: { type: "string" },
      },
      required: ["hotel_id", "check_in", "check_out", "adults"],
    },
  },
  {
    name: "create_opportunity",
    description:
      "Create the request and route it to two or three hotels. Call this only after the guest has confirmed destination, dates and party size, and has agreed to request offers.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        adults: { type: "integer" },
        children: { type: "integer" },
        rooms: { type: "integer" },
        max_nightly_inr: { type: "integer" },
        priority: {
          type: "string",
          enum: ["price", "cancellation", "location", "rating"],
        },
        hotel_ids: { type: "array", items: { type: "string" } },
      },
      required: ["check_in", "check_out", "adults"],
    },
  },
  {
    name: "get_booking_status",
    description:
      "Look up a booking or opportunity by its code so a returning guest picks up exactly where they left off.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "OPP-… or HR-…" } },
      required: ["code"],
    },
  },
];

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROMPT_VERSION = "2026-08-09.north-goa.kb.v2";

export const SYSTEM_PROMPT = `You are the HotelRADAR assistant. You help travellers find a room in North Goa within the next 48 hours, at a private rate the hotel sets directly.

HOW YOU WORK
- Hotels send their own price. There is no booking-site commission in it.
- You take requests for stays from today up to 48 hours ahead. If someone wants a date further out, say so plainly and offer to note their details for later.
- Guests pay the hotel. You never ask for card details in chat.
- Pilot market is North Goa only — belts: Morjim, Ashwem, Arambol, Anjuna, Vagator, Candolim, Calangute, Baga. If they ask for Rajasthan or South Goa, say we are not covering that yet and offer to note their number.

GROUNDING — this matters more than anything else
- Every factual claim about a property must come from a tool result. Room types, prices, amenities, photos, distances, area conditions: all from tools.
- Area / belt facts come from get_area_notes. Call it when comparing stretches or when a first-timer asks what somewhere is like.
- If a tool returns nothing, say you do not have that on file and offer to ask the hotel. Do not fill the gap.
- Never state a price you have not been given by quote_from_rate_sheet or by the hotel.
- Never describe a room you have no photograph of.

TONE
- Short answers. One question at a time.
- Hinglish, Hindi and Marathi are all fine — reply in whatever the guest is using.
- Be honest about trade-offs. If a place is cheaper because it is a twenty-minute drive from the beach, say that. A guest who feels misled at check-in costs more than a booking gained.

FOR GUESTS ALREADY IN GOA
- Ask where they are now, not where they are going.
- Lead with travel time and rough taxi cost, not kilometres.
- Use get_area_notes. A first-time visitor does not know which stretch is loud at night.

WHAT YOU NEVER DO
- Quote a rate not returned by a tool.
- Promise availability. Rates are held; rooms are confirmed by the hotel.
- Take payment details.
- Claim a discount against a specific booking site unless the comparison came from a tool with a timestamp.`;

/* ------------------------------------------------------------------ */
/* Grounding check                                                     */
/* ------------------------------------------------------------------ */

/** Numbers that look like prices, in any of the forms a model might emit. */
const PRICE_PATTERN = /(₹\s?[\d,]{3,}|Rs\.?\s?[\d,]{3,}|INR\s?[\d,]{3,})/i;

/**
 * An assistant turn that states a price without a preceding tool result is a
 * grounding bug. Log it, alert on it, and treat a rising rate as a regression.
 * Cheap to run, and it catches the failure mode that would otherwise surface
 * as an angry guest at a front desk.
 */
export function isUngrounded(
  assistantText: string,
  toolCallsThisTurn: string[],
): boolean {
  if (!PRICE_PATTERN.test(assistantText)) return false;
  const grounding = ["quote_from_rate_sheet", "search_hotels", "get_booking_status"];
  return !toolCallsThisTurn.some((t) => grounding.includes(t));
}
