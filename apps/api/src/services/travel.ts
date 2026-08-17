/**
 * Travel cache — haversine estimate when no Maps provider is configured.
 */

import {
  originKey,
  estimateTaxiPaise,
  describeTravel,
  TRAVEL_CACHE_TTL_MS,
} from "@hotelradar/direct-shared";
import { pool } from "../db/pool.js";

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function getTravelToHotel(input: {
  hotelId: string;
  fromLat: number;
  fromLng: number;
}) {
  const hotel = await pool.query(`SELECT id, lat, lng, display_name FROM hotels WHERE id = $1`, [
    input.hotelId,
  ]);
  if (!hotel.rowCount) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  const h = hotel.rows[0];
  const key = originKey(input.fromLat, input.fromLng);

  const cached = await pool.query(
    `SELECT * FROM travel_cache WHERE origin_key = $1 AND hotel_id = $2`,
    [key, input.hotelId]
  );
  if (cached.rowCount && new Date(cached.rows[0].expires_at).getTime() > Date.now()) {
    const row = cached.rows[0];
    return {
      source: "cache" as const,
      origin_key: key,
      hotel_id: input.hotelId,
      hotel_name: h.display_name,
      seconds: Number(row.seconds),
      meters: Number(row.meters),
      taxi_estimate_paise: Number(row.taxi_estimate_paise ?? 0),
      description: describeTravel(Number(row.seconds), Number(row.meters)),
      expires_at: row.expires_at,
      provider: row.provider,
    };
  }

  if (h.lat == null || h.lng == null) {
    throw Object.assign(
      new Error("Hotel has no lat/lng — set coordinates on the hotel before travel quotes"),
      { status: 422 }
    );
  }

  const meters = haversineMeters(input.fromLat, input.fromLng, Number(h.lat), Number(h.lng));
  // ~30 km/h average coastal road speed
  const seconds = Math.max(300, Math.round((meters / 1000 / 30) * 3600));
  const taxi = estimateTaxiPaise(meters);
  const expiresAt = new Date(Date.now() + TRAVEL_CACHE_TTL_MS);

  const upserted = await pool.query(
    `INSERT INTO travel_cache (
       origin_key, hotel_id, seconds, meters, taxi_estimate_paise, provider, expires_at
     ) VALUES ($1,$2,$3,$4,$5,'haversine',$6)
     ON CONFLICT (origin_key, hotel_id) DO UPDATE
     SET seconds = EXCLUDED.seconds,
         meters = EXCLUDED.meters,
         taxi_estimate_paise = EXCLUDED.taxi_estimate_paise,
         provider = EXCLUDED.provider,
         fetched_at = NOW(),
         expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [key, input.hotelId, seconds, meters, Number(taxi), expiresAt.toISOString()]
  );

  return {
    source: "computed" as const,
    origin_key: key,
    hotel_id: input.hotelId,
    hotel_name: h.display_name,
    seconds,
    meters,
    taxi_estimate_paise: Number(taxi),
    description: describeTravel(seconds, meters),
    expires_at: upserted.rows[0].expires_at,
    provider: "haversine",
  };
}

export async function upsertTravelCache(input: {
  hotelId: string;
  fromLat: number;
  fromLng: number;
  seconds: number;
  meters: number;
  provider?: string;
}) {
  const key = originKey(input.fromLat, input.fromLng);
  const taxi = estimateTaxiPaise(input.meters);
  const expiresAt = new Date(Date.now() + TRAVEL_CACHE_TTL_MS);
  const result = await pool.query(
    `INSERT INTO travel_cache (
       origin_key, hotel_id, seconds, meters, taxi_estimate_paise, provider, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (origin_key, hotel_id) DO UPDATE
     SET seconds = EXCLUDED.seconds,
         meters = EXCLUDED.meters,
         taxi_estimate_paise = EXCLUDED.taxi_estimate_paise,
         provider = EXCLUDED.provider,
         fetched_at = NOW(),
         expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [
      key,
      input.hotelId,
      input.seconds,
      input.meters,
      Number(taxi),
      input.provider ?? "manual",
      expiresAt.toISOString(),
    ]
  );
  return {
    ...result.rows[0],
    description: describeTravel(input.seconds, input.meters),
  };
}
