/**
 * Assistant tool runners + chat transcript (no LLM — ops / future agent).
 */

import {
  TOOLS,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
  isUngrounded,
  formatINR,
  matchRateRow,
  buildQuote,
  isSheetUsable,
  ROUTABLE_BELTS,
  type Season,
  type RateRow,
} from "@hotelradar/direct-shared";
import { pool } from "../db/pool.js";
import { getTravelToHotel } from "./travel.js";
import { listBeltNotes, listHotelMedia } from "./domainExtras.js";

export function listAssistantTools() {
  return {
    tools: TOOLS,
    system_prompt: SYSTEM_PROMPT,
    system_prompt_version: SYSTEM_PROMPT_VERSION,
    system_prompt_editable: false,
  };
}

export async function listChatMessages(opportunityId: string) {
  const opp = await pool.query(
    `SELECT id FROM opportunities WHERE external_opportunity_id = $1 OR id::text = $1`,
    [opportunityId]
  );
  if (!opp.rowCount) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  const result = await pool.query(
    `SELECT * FROM chat_messages WHERE opportunity_id = $1 ORDER BY created_at ASC`,
    [opp.rows[0].id]
  );
  return result.rows;
}

export async function listChatBySession(sessionKey: string) {
  const result = await pool.query(
    `SELECT * FROM chat_messages WHERE session_key = $1 ORDER BY created_at ASC`,
    [sessionKey]
  );
  return result.rows;
}

export async function appendChatMessage(input: {
  externalId?: string;
  opportunityUuid?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: unknown[];
  guestId?: string | null;
  /** Guest transcript archive — skip LLM grounding gate. */
  skipGrounding?: boolean;
}) {
  let oppId = input.opportunityUuid;
  if (!oppId && input.externalId) {
    const opp = await pool.query(
      `SELECT id FROM opportunities WHERE external_opportunity_id = $1`,
      [input.externalId]
    );
    if (!opp.rowCount) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
    oppId = opp.rows[0].id;
  }

  const toolCalls = input.toolCalls ?? [];
  if (
    !input.skipGrounding &&
    input.role === "assistant" &&
    isUngrounded(input.content, toolNamesFromCalls(toolCalls))
  ) {
    throw Object.assign(
      new Error(
        "Ungrounded assistant reply: price/fact claim without a prior tool result. Fix tools or rephrase."
      ),
      { status: 422, code: "UNGROUNDED" }
    );
  }

  const result = await pool.query(
    `INSERT INTO chat_messages (opportunity_id, guest_id, role, content, tool_calls)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING *`,
    [oppId ?? null, input.guestId ?? null, input.role, input.content, JSON.stringify(toolCalls)]
  );
  return result.rows[0];
}

/** Append guest UI transcript after OTP (idempotent by skipping already-stored prefix count). */
export async function syncGuestChatByToken(
  publicToken: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  alreadySynced = 0
) {
  const opp = await pool.query(
    `SELECT id, guest_id, otp_verified_at FROM opportunities WHERE public_token = $1`,
    [publicToken]
  );
  if (!opp.rowCount) throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  const row = opp.rows[0] as {
    id: string;
    guest_id: string | null;
    otp_verified_at: string | null;
  };
  if (!row.otp_verified_at) {
    throw Object.assign(new Error("Verify mobile before saving chat"), { status: 403 });
  }

  const clean = messages
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? "").trim().slice(0, 4000),
    }))
    .filter((m) => m.content.length > 0);

  const start = Math.max(0, Math.min(alreadySynced, clean.length));
  const toInsert = clean.slice(start);
  for (const m of toInsert) {
    await appendChatMessage({
      opportunityUuid: row.id,
      guestId: row.guest_id,
      role: m.role,
      content: m.content,
      toolCalls: [{ name: "guest_ui_transcript" }],
      skipGrounding: true,
    });
  }

  return { synced: clean.length, appended: toInsert.length };
}

function toolNamesFromCalls(calls: unknown[]): string[] {
  return calls
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "name" in c) return String((c as { name: unknown }).name);
      return null;
    })
    .filter((x): x is string => Boolean(x));
}

function toRateRow(r: Record<string, unknown>): RateRow {
  return {
    id: String(r.id),
    roomType: String(r.room_type),
    season: String(r.season) as Season,
    dowMask: Number(r.dow_mask ?? 127),
    floorTariffPaise: BigInt(r.floor_tariff_paise as string | number | bigint),
    minNights: Number(r.min_nights ?? 1),
    maxNights: Number(r.max_nights ?? 30),
    maxOccupancy: Number(r.max_occupancy ?? 2),
    advanceHoursMin: Number(r.advance_hours_min ?? 0),
    inclusions: Array.isArray(r.inclusions) ? r.inclusions.map(String) : [],
    blackoutDates: Array.isArray(r.blackout_dates)
      ? r.blackout_dates.map((d) => new Date(String(d)))
      : [],
  };
}

export async function runAssistantTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ name: string; result: unknown }> {
  switch (name) {
    case "search_hotels": {
      const destination = String(args.destination || "Goa");
      const hotels = await pool.query(
        `SELECT id, display_name, belt, destination, status, instant_quote_enabled, lat, lng,
                gst_rate_bps, commission_pct_bps
         FROM hotels
         WHERE status = 'live'
           AND COALESCE(stop_sell, FALSE) = FALSE
           AND (
             destination ILIKE $1
             OR belt ILIKE $1
             OR location ILIKE '%' || $1 || '%'
             OR display_name ILIKE '%' || $1 || '%'
           )
         ORDER BY display_name
         LIMIT 10`,
        [destination]
      );
      return { name, result: { hotels: hotels.rows } };
    }
    case "get_hotel_media": {
      const hotelId = String(args.hotel_id || "");
      const media = await listHotelMedia(hotelId);
      const filtered = media.filter((m) => {
        if (args.kind && m.kind !== args.kind) return false;
        if (args.room_type && m.room_type && m.room_type !== args.room_type) return false;
        return true;
      });
      return { name, result: { media: filtered } };
    }
    case "get_travel_time": {
      const travel = await getTravelToHotel({
        hotelId: String(args.hotel_id),
        fromLat: Number(args.from_lat),
        fromLng: Number(args.from_lng),
      });
      return {
        name,
        result: {
          ...travel,
          taxi_estimate: formatINR(BigInt(travel.taxi_estimate_paise)),
        },
      };
    }
    case "get_area_notes": {
      const belt = String(args.belt || "")
        .trim()
        .toLowerCase();
      if (!(ROUTABLE_BELTS as readonly string[]).includes(belt)) {
        return {
          name,
          result: {
            notes: [],
            error: "unknown_belt",
            hint: `Use one of: ${ROUTABLE_BELTS.join(", ")}`,
          },
        };
      }
      const notes = await listBeltNotes(belt);
      const month = args.month != null ? Number(args.month) : new Date().getMonth() + 1;
      const filtered = notes.filter((n) => {
        const months: number[] = Array.isArray(n.months_applicable)
          ? n.months_applicable.map(Number)
          : [];
        if (!months.length) return true;
        return months.includes(month);
      });
      return {
        name,
        result: {
          belt,
          month,
          notes: filtered.map((n) => ({
            kind: n.kind,
            note: n.note,
            months_applicable: n.months_applicable,
          })),
          count: filtered.length,
        },
      };
    }
    case "quote_from_rate_sheet": {
      const hotelId = String(args.hotel_id);
      const hotel = await pool.query(`SELECT * FROM hotels WHERE id = $1`, [hotelId]);
      if (!hotel.rowCount) return { name, result: { matched: false, reason: "hotel_not_found" } };
      const sheet = await pool.query(
        `SELECT * FROM rate_sheets WHERE hotel_id = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
        [hotelId]
      );
      if (!sheet.rowCount) return { name, result: { matched: false, reason: "no_sheet" } };
      const checkIn = new Date(String(args.check_in));
      const checkOut = new Date(String(args.check_out));
      if (
        !isSheetUsable(
          {
            status: String(sheet.rows[0].status),
            expiresAt: new Date(sheet.rows[0].expires_at),
            effectiveFrom: new Date(sheet.rows[0].effective_from),
            effectiveTo: new Date(sheet.rows[0].effective_to),
          },
          checkIn
        )
      ) {
        return { name, result: { matched: false, reason: "sheet_unusable" } };
      }
      const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
      );
      const rows = await pool.query(`SELECT * FROM rate_sheet_rows WHERE rate_sheet_id = $1`, [
        sheet.rows[0].id,
      ]);
      const match = matchRateRow(rows.rows.map(toRateRow), {
        checkIn,
        checkOut,
        nights,
        adults: Number(args.adults ?? 2),
        children: Number(args.children ?? 0),
        leadTimeHours: (checkIn.getTime() - Date.now()) / 3600000,
        roomType: args.room_type ? String(args.room_type) : undefined,
      });
      if (!match.matched) return { name, result: { matched: false, reason: match.reason } };
      const quote = buildQuote(
        match.row,
        {
          checkIn,
          checkOut,
          nights,
          adults: Number(args.adults ?? 2),
          children: Number(args.children ?? 0),
          leadTimeHours: (checkIn.getTime() - Date.now()) / 3600000,
        },
        Number(hotel.rows[0].gst_rate_bps ?? 1800)
      );
      return {
        name,
        result: {
          matched: true,
          room_type: quote.roomType,
          nights: quote.nights,
          gross_inr: formatINR(quote.grossPaise),
          tariff_per_night_inr: formatINR(quote.tariffPerNightPaise),
          holds_until: quote.holdsUntil.toISOString(),
          inclusions: quote.inclusions,
        },
      };
    }
    case "create_opportunity": {
      const { createOpportunity } = await import("./opportunity.js");
      const mobile = String(args.mobile || args.phone || "").trim();
      const guestName = String(args.name || "Guest").trim();
      if (!mobile) {
        return {
          name: "create_opportunity",
          result: {
            ok: false,
            reason: "mobile_required",
            message: "Ask the guest for a WhatsApp mobile number before creating the request.",
          },
        };
      }
      try {
        const created = await createOpportunity({
          name: guestName,
          mobile,
          email: args.email ? String(args.email) : null,
          consent: true,
          consent_version: "assistant-v1",
          destination: (String(args.destination || "Goa") === "Rajasthan" ? "Rajasthan" : "Goa"),
          requested_area: String(args.destination || args.area || "Goa"),
          check_in: String(args.check_in),
          check_out: String(args.check_out),
          adults: Number(args.adults ?? 2),
          children: Number(args.children ?? 0),
          rooms: Number(args.rooms ?? 1),
          budget_paise: args.max_nightly_inr
            ? Math.round(Number(args.max_nightly_inr) * 100)
            : null,
        });
        if (
          created.pilot?.route &&
          Array.isArray(args.hotel_ids) &&
          args.hotel_ids.length
        ) {
          const { routeOpportunity } = await import("./routing.js");
          await routeOpportunity(created.external_opportunity_id, "assistant", {
            hotelIds: args.hotel_ids.map(String),
          });
        }
        return {
          name: "create_opportunity",
          result: {
            ok: true,
            opportunity_id: created.external_opportunity_id,
            public_token: created.public_token,
            status: created.status,
            route: created.pilot?.route ?? true,
            guest_message: created.pilot?.guest_message ?? null,
          },
        };
      } catch (error) {
        return {
          name: "create_opportunity",
          result: {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    case "get_booking_status": {
      const code = String(args.code || "").trim().toUpperCase();
      if (!code) return { name, result: { found: false, reason: "code_required" } };
      const opp = await pool.query(
        `SELECT o.external_opportunity_id, o.status, o.booking_status, o.settlement_mode,
                o.hotel_booking_ref, o.payment_utr, o.guest_attested_at, o.hotel_attested_at,
                tr.check_in, tr.check_out, tr.destination, h.display_name AS hotel_name,
                bc.display_code, bc.redeemed_at
         FROM opportunities o
         JOIN traveller_requests tr ON tr.opportunity_id = o.id
         LEFT JOIN hotels h ON h.id = o.hotel_id
         LEFT JOIN booking_codes bc ON bc.opportunity_id = o.id
         WHERE o.external_opportunity_id = $1
            OR o.hotel_booking_ref = $1
            OR bc.display_code = $1
            OR bc.code = $1
         LIMIT 1`,
        [code]
      );
      if (!opp.rowCount) return { name, result: { found: false } };
      const row = opp.rows[0];
      return {
        name,
        result: {
          found: true,
          opportunity_id: row.external_opportunity_id,
          status: row.status,
          booking_status: row.booking_status,
          destination: row.destination,
          check_in: row.check_in,
          check_out: row.check_out,
          hotel_name: row.hotel_name,
          hotel_booking_ref: row.hotel_booking_ref,
          check_in_code: row.display_code,
          code_redeemed: Boolean(row.redeemed_at),
          settlement_mode: row.settlement_mode,
          payment: {
            utr: row.payment_utr,
            guest_attested: Boolean(row.guest_attested_at),
            hotel_attested: Boolean(row.hotel_attested_at),
          },
        },
      };
    }
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { status: 422 });
  }
}

export function checkGrounding(content: string, toolNames: string[]) {
  return {
    ungrounded: isUngrounded(content, toolNames),
    tool_names: toolNames,
  };
}
