/**
 * Opportunity fan-out using shared scoring (belt, sheet, response rate, night desk).
 */

import {
  selectHotels,
  contactRoleForHour,
  type RoutableHotel,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";

async function recordEvent(
  client: { query: typeof pool.query },
  args: {
    opportunityId: string;
    externalId: string;
    eventType: string;
    actorId: string;
    previous: string;
    next: string;
    payload?: Record<string, unknown>;
  }
) {
  await client.query(
    `INSERT INTO opportunity_events (
       opportunity_id, event_type, actor_type, actor_id, source_system,
       previous_status, new_status, idempotency_key, payload
     ) VALUES ($1,$2,'admin',$3,'direct',$4,$5,$6,$7::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      args.opportunityId,
      args.eventType,
      args.actorId,
      args.previous,
      args.next,
      `${args.externalId}:${args.eventType}:${args.next}:${Date.now()}`,
      JSON.stringify(args.payload ?? {}),
    ]
  );
}

function preferredBelt(requestedArea: string | null, destination: string): string | null {
  const area = String(requestedArea || "").trim().toLowerCase();
  if (!area) return destination === "Goa" ? null : null;
  const belts = ["morjim", "anjuna", "arambol", "ashwem", "candolim", "calangute", "vagator", "baga"];
  return belts.find((b) => area.includes(b)) ?? null;
}

function istHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? now.getUTCHours());
}

export async function routeOpportunity(
  externalId: string,
  actorId: string,
  opts?: { hotelIds?: string[]; limit?: number }
) {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, tr.destination, tr.requested_area, tr.requested_property
       FROM opportunities o
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    let hotelRows: Array<Record<string, unknown>>;
    let shortfallReason: string = "none";
    const atHour = istHour();
    const belt = preferredBelt(row.requested_area, row.destination);
    const fanOut = Math.min(Math.max(opts?.limit ?? 3, 1), 5);

    if (opts?.hotelIds?.length) {
      const hotels = await client.query(
        `SELECT * FROM hotels WHERE id = ANY($1::uuid[]) AND status = 'live'`,
        [opts.hotelIds]
      );
      hotelRows = hotels.rows;
    } else {
      const candidates = await client.query(
        `SELECT h.*,
           (
             SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oh.response_seconds)
             FROM opportunity_hotels oh
             WHERE oh.hotel_id = h.id
               AND oh.response_seconds IS NOT NULL
               AND oh.sent_at > NOW() - INTERVAL '30 days'
           ) AS median_response_seconds,
           (
             SELECT CASE WHEN COUNT(*) = 0 THEN NULL
               ELSE COUNT(*) FILTER (WHERE oh.outcome IS NOT NULL AND oh.outcome <> 'no_response')::float
                    / COUNT(*)::float
               END
             FROM opportunity_hotels oh
             WHERE oh.hotel_id = h.id AND oh.sent_at > NOW() - INTERVAL '30 days'
           ) AS response_rate
         FROM hotels h
         WHERE h.status = 'live'
           AND h.destination = $1`,
        [row.destination]
      );

      const routable: RoutableHotel[] = candidates.rows.map((h) => ({
        id: String(h.id),
        belt: String(h.belt || "other"),
        stopSell: Boolean(h.stop_sell),
        status: String(h.status),
        instantQuoteEnabled: Boolean(h.instant_quote_enabled),
        medianResponseSeconds:
          h.median_response_seconds != null ? Number(h.median_response_seconds) : null,
        responseRate: h.response_rate != null ? Number(h.response_rate) : null,
        distanceMeters: null,
        hasAvailability: null,
      }));

      const decision = selectHotels(routable, {
        preferredBelt: belt,
        atHour,
        fanOut,
      });
      shortfallReason = decision.shortfallReason;
      const ids = decision.hotels.map((h) => h.id);
      hotelRows = candidates.rows.filter((h) => ids.includes(String(h.id)));
      // Preserve score order
      hotelRows.sort((a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)));
    }

    if (!hotelRows.length) {
      throw Object.assign(new Error("No live hotels to route"), { status: 422 });
    }

    const contactRole = contactRoleForHour(atHour);
    const routed: Array<Record<string, unknown>> = [];
    for (const hotel of hotelRows) {
      const route = hotel.instant_quote_enabled ? "instant_sheet" : "manual_quote";
      const inserted = await client.query(
        `INSERT INTO opportunity_hotels (opportunity_id, hotel_id, route)
         VALUES ($1,$2,$3)
         ON CONFLICT (opportunity_id, hotel_id) DO UPDATE
         SET route = EXCLUDED.route, sent_at = NOW()
         RETURNING *`,
        [row.id, hotel.id, route]
      );
      routed.push({
        id: inserted.rows[0].id,
        hotel_id: hotel.id,
        hotel_name: hotel.display_name,
        route,
        belt: hotel.belt,
        contact_role: contactRole,
      });
    }

    const primary = hotelRows[0];
    const deadline = new Date(Date.now() + 10 * 60 * 1000);
    await client.query(
      `UPDATE opportunities
       SET hotel_id = COALESCE(hotel_id, $1),
           status = 'hotel_notified',
           domain_opp_status = 'routed',
           offer_request_deadline_at = $2,
           escalation_done = '[]'::jsonb,
           updated_at = NOW()
       WHERE id = $3`,
      [primary.id, deadline.toISOString(), row.id]
    );

    await recordEvent(client, {
      opportunityId: row.id,
      externalId,
      eventType: "route.sent",
      actorId,
      previous: row.status,
      next: "hotel_notified",
      payload: {
        hotels: routed,
        domain: "opportunity.routed",
        preferred_belt: belt,
        shortfall_reason: shortfallReason,
        at_hour_ist: atHour,
        contact_role: contactRole,
      },
    });

    return {
      status: "hotel_notified",
      domain_opp_status: "routed",
      opportunity_hotels: routed,
      offer_request_deadline_at: deadline.toISOString(),
      preferred_belt: belt,
      shortfall_reason: shortfallReason,
      contact_role: contactRole,
    };
  });
}

export async function listOpportunityHotels(externalId: string) {
  const result = await pool.query(
    `SELECT oh.*, h.display_name AS hotel_name, h.instant_quote_enabled, h.status AS hotel_status,
            h.belt
     FROM opportunity_hotels oh
     JOIN opportunities o ON o.id = oh.opportunity_id
     JOIN hotels h ON h.id = oh.hotel_id
     WHERE o.external_opportunity_id = $1
     ORDER BY oh.sent_at ASC`,
    [externalId]
  );
  return result.rows;
}
