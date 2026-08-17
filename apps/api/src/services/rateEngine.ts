/**
 * Rate engine: pure matchRateRow / buildQuote / isSheetUsable → Offer.
 */

import {
  matchRateRow,
  buildQuote,
  isSheetUsable,
  type RateRow,
  type Season,
} from "@hotelradar/direct-shared";
import { pool, withTransaction } from "../db/pool.js";

function toRateRow(r: Record<string, unknown>): RateRow {
  const inclusions = Array.isArray(r.inclusions)
    ? r.inclusions.map(String)
    : typeof r.inclusions === "string"
      ? [r.inclusions]
      : [];
  const blackouts = Array.isArray(r.blackout_dates)
    ? r.blackout_dates.map((d) => new Date(String(d)))
    : [];
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
    inclusions,
    blackoutDates: blackouts,
  };
}

/**
 * Given opportunity + hotel, find active RateSheet row and create Offer.
 * Returns null if no match (caller falls back to manual quote).
 */
export async function quoteFromRateSheet(
  externalId: string,
  hotelId: string,
  actorId: string,
  roomTypeHint?: string
): Promise<Record<string, unknown> | null> {
  return withTransaction(async (client) => {
    const opp = await client.query(
      `SELECT o.*, tr.check_in, tr.check_out, tr.rooms, tr.adults, tr.children
       FROM opportunities o
       JOIN traveller_requests tr ON tr.opportunity_id = o.id
       WHERE o.external_opportunity_id = $1`,
      [externalId]
    );
    const row = opp.rows[0];
    if (!row) throw Object.assign(new Error("Opportunity not found"), { status: 404 });

    const hotel = await client.query(`SELECT * FROM hotels WHERE id = $1`, [hotelId]);
    if (!hotel.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
    const h = hotel.rows[0];

    const sheet = await client.query(
      `SELECT * FROM rate_sheets
       WHERE hotel_id = $1 AND status = 'active'
       ORDER BY version DESC LIMIT 1`,
      [hotelId]
    );
    if (!sheet.rowCount) return null;

    const checkIn = new Date(row.check_in);
    const checkOut = new Date(row.check_out);
    const nights = Math.max(
      1,
      Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
    );
    const sheetRow = sheet.rows[0];
    if (
      !isSheetUsable(
        {
          status: String(sheetRow.status),
          expiresAt: new Date(sheetRow.expires_at),
          effectiveFrom: new Date(sheetRow.effective_from),
          effectiveTo: new Date(sheetRow.effective_to),
        },
        checkIn
      )
    ) {
      return null;
    }

    const dbRows = await client.query(
      `SELECT * FROM rate_sheet_rows WHERE rate_sheet_id = $1`,
      [sheetRow.id]
    );
    const rateRows = dbRows.rows.map(toRateRow);
    const leadTimeHours = (checkIn.getTime() - Date.now()) / 3600000;
    const match = matchRateRow(rateRows, {
      checkIn,
      checkOut,
      nights,
      adults: Number(row.adults ?? 2),
      children: Number(row.children ?? 0),
      leadTimeHours,
      roomType: roomTypeHint?.trim() || undefined,
    });
    if (!match.matched) return null;

    const quote = buildQuote(match.row, {
      checkIn,
      checkOut,
      nights,
      adults: Number(row.adults ?? 2),
      children: Number(row.children ?? 0),
      leadTimeHours,
      roomType: roomTypeHint?.trim() || undefined,
    }, Number(h.gst_rate_bps ?? 1800));

    let oppHotel = await client.query(
      `SELECT id FROM opportunity_hotels WHERE opportunity_id = $1 AND hotel_id = $2`,
      [row.id, hotelId]
    );
    if (!oppHotel.rowCount) {
      oppHotel = await client.query(
        `INSERT INTO opportunity_hotels (opportunity_id, hotel_id, route)
         VALUES ($1,$2,'instant_sheet') RETURNING id`,
        [row.id, hotelId]
      );
    }

    const offerId = `OFR-${externalId}-RS-${match.row.id.slice(0, 8)}`;
    await client.query(
      `UPDATE offers_cache SET status = 'superseded', updated_at = NOW()
       WHERE opportunity_id = $1 AND status IN ('ready','sent')`,
      [row.id]
    );

    const inclusions =
      quote.inclusions.length > 0 ? quote.inclusions.join(", ") : "As per rate sheet";

    await client.query(
      `INSERT INTO offers_cache (
         opportunity_id, offer_id, offer_version, hotel_name, room_type, occupancy,
         total_amount_paise, currency, inclusions, cancellation_terms, valid_until, status,
         opportunity_hotel_id, source, rate_sheet_id, rate_sheet_row_id,
         tariff_per_night_paise, nights, holds_until, payload
       ) VALUES (
         $1,$2,1,$3,$4,$5,$6,'INR',$7,$8,$9,'sent',
         $10,'rate_sheet',$11,$12,$13,$14,$15,$16::jsonb
       )`,
      [
        row.id,
        offerId,
        h.display_name,
        quote.roomType,
        `${row.adults} adults`,
        Number(quote.grossPaise),
        inclusions,
        "As per rate sheet",
        quote.holdsUntil.toISOString(),
        oppHotel.rows[0].id,
        sheetRow.id,
        quote.rateSheetRowId,
        Number(quote.tariffPerNightPaise),
        quote.nights,
        quote.holdsUntil.toISOString(),
        JSON.stringify({
          rate_sheet_version: sheetRow.version,
          actor: actorId,
          base_tariff_paise: Number(quote.baseTariffPaise),
        }),
      ]
    );

    await client.query(
      `UPDATE opportunity_hotels
       SET outcome = 'offer_made', responded_at = NOW(),
           response_seconds = EXTRACT(EPOCH FROM (NOW() - sent_at))::int
       WHERE id = $1`,
      [oppHotel.rows[0].id]
    );

    await client.query(
      `UPDATE opportunities
       SET hotel_id = $1, status = 'offer_sent', accept_deadline_at = $2,
           domain_opp_status = 'offers_live', updated_at = NOW()
       WHERE id = $3`,
      [hotelId, quote.holdsUntil.toISOString(), row.id]
    );

    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, actor_id, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'offer.issued','admin',$2,'direct',$3,'offer_sent',$4,$5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.id,
        actorId,
        row.status,
        `${externalId}:offer.issued:${offerId}`,
        JSON.stringify({
          source: "rate_sheet",
          rate_sheet_id: sheetRow.id,
          rate_sheet_row_id: quote.rateSheetRowId,
          gross_paise: Number(quote.grossPaise),
          holds_until: quote.holdsUntil.toISOString(),
        }),
      ]
    );

    return {
      offer_id: offerId,
      source: "rate_sheet",
      rate_sheet_id: sheetRow.id,
      rate_sheet_row_id: quote.rateSheetRowId,
      room_type: quote.roomType,
      nights: quote.nights,
      tariff_per_night_paise: Number(quote.tariffPerNightPaise),
      total_amount_paise: Number(quote.grossPaise),
      holds_until: quote.holdsUntil.toISOString(),
      status: "offer_sent",
    };
  });
}

export async function listRateSheets(hotelId: string) {
  const sheets = await pool.query(
    `SELECT * FROM rate_sheets WHERE hotel_id = $1 ORDER BY version DESC`,
    [hotelId]
  );
  const out = [];
  for (const s of sheets.rows) {
    const rows = await pool.query(
      `SELECT * FROM rate_sheet_rows WHERE rate_sheet_id = $1 ORDER BY room_type, season`,
      [s.id]
    );
    out.push({ ...s, rows: rows.rows });
  }
  return out;
}

export async function upsertRateSheet(input: {
  hotelId: string;
  effectiveFrom: string;
  effectiveTo: string;
  expiresAt: string;
  activate?: boolean;
  rows: Array<{
    room_type: string;
    season: string;
    floor_tariff_paise: number;
    min_nights?: number;
    max_nights?: number;
    max_occupancy?: number;
    advance_hours_min?: number;
    dow_mask?: number;
    inclusions?: unknown[];
    blackout_dates?: string[];
  }>;
}) {
  return withTransaction(async (client) => {
    const ver = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM rate_sheets WHERE hotel_id = $1`,
      [input.hotelId]
    );
    const version = Number(ver.rows[0].v);
    if (input.activate) {
      await client.query(
        `UPDATE rate_sheets SET status = 'superseded' WHERE hotel_id = $1 AND status = 'active'`,
        [input.hotelId]
      );
    }
    const sheet = await client.query(
      `INSERT INTO rate_sheets (
         hotel_id, version, status, effective_from, effective_to, expires_at, approved_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.hotelId,
        version,
        input.activate ? "active" : "draft",
        input.effectiveFrom,
        input.effectiveTo,
        input.expiresAt,
        input.activate ? new Date().toISOString() : null,
      ]
    );
    for (const r of input.rows) {
      await client.query(
        `INSERT INTO rate_sheet_rows (
           rate_sheet_id, room_type, season, dow_mask, floor_tariff_paise,
           min_nights, max_nights, max_occupancy, advance_hours_min, inclusions, blackout_dates
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::date[])`,
        [
          sheet.rows[0].id,
          r.room_type,
          r.season,
          r.dow_mask ?? 127,
          r.floor_tariff_paise,
          r.min_nights ?? 1,
          r.max_nights ?? 30,
          r.max_occupancy ?? 2,
          r.advance_hours_min ?? 0,
          JSON.stringify(r.inclusions ?? []),
          r.blackout_dates ?? [],
        ]
      );
    }
    return sheet.rows[0];
  });
}

/** Expire / supersede active sheet without creating a replacement (stop-sell via sheet). */
export async function supersedeRateSheet(hotelId: string, sheetId: string) {
  const result = await pool.query(
    `UPDATE rate_sheets
     SET status = 'superseded'
     WHERE id = $1 AND hotel_id = $2
     RETURNING *`,
    [sheetId, hotelId]
  );
  if (!result.rowCount) throw Object.assign(new Error("Rate sheet not found"), { status: 404 });
  return result.rows[0];
}

export async function setHotelStopSell(hotelId: string, stopSell: boolean) {
  const result = await pool.query(
    `UPDATE hotels SET stop_sell = $1, updated_at = NOW() WHERE id = $2 RETURNING id, display_name, stop_sell, status`,
    [stopSell, hotelId]
  );
  if (!result.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  return result.rows[0];
}
