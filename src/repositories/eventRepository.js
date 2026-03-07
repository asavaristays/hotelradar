import { pool } from '../db/pool.js';
import { focusCityKeys } from '../config/productScope.js';

export async function upsertCityEvent(input) {
  const payload = {
    city: String(input.city || '').trim(),
    eventName: String(input.eventName || '').trim(),
    venue: String(input.venue || '').trim(),
    startDate: String(input.startDate || '').trim(),
    endDate: String(input.endDate || '').trim(),
    category: String(input.category || 'general').trim().toLowerCase(),
    scale: String(input.scale || 'medium').trim().toLowerCase(),
    estimatedAttendance:
      Number.isFinite(Number(input.estimatedAttendance)) && Number(input.estimatedAttendance) > 0
        ? Math.round(Number(input.estimatedAttendance))
        : null,
    radiusImpactKm: Number.isFinite(Number(input.radiusImpactKm))
      ? Math.max(1, Math.min(200, Math.round(Number(input.radiusImpactKm))))
      : 15,
    source: String(input.source || 'manual').trim().toLowerCase(),
    confidence: String(input.confidence || 'confirmed').trim().toLowerCase(),
    venueLat: Number.isFinite(Number(input.venueLat)) ? Number(input.venueLat) : null,
    venueLng: Number.isFinite(Number(input.venueLng)) ? Number(input.venueLng) : null,
    eventUrl: String(input.eventUrl || '').trim() || null,
    impactScore: Number.isFinite(Number(input.impactScore))
      ? Math.max(0, Math.min(40, Number(input.impactScore)))
      : 8,
    scrapedAt: input.scrapedAt || new Date().toISOString(),
  };

  const { rows } = await pool.query(
    `INSERT INTO city_events (
       city,
       event_name,
       venue,
       start_date,
       end_date,
       category,
       scale,
       estimated_attendance,
       radius_impact_km,
       source,
       confidence,
       venue_lat,
       venue_lng,
       event_url,
       impact_score,
       scraped_at
     ) VALUES (
       $1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )
     ON CONFLICT (city, event_name, start_date, venue, source)
     DO UPDATE SET
       end_date = EXCLUDED.end_date,
       category = EXCLUDED.category,
       scale = EXCLUDED.scale,
       estimated_attendance = EXCLUDED.estimated_attendance,
       radius_impact_km = EXCLUDED.radius_impact_km,
       confidence = EXCLUDED.confidence,
       venue_lat = EXCLUDED.venue_lat,
       venue_lng = EXCLUDED.venue_lng,
       event_url = EXCLUDED.event_url,
       impact_score = EXCLUDED.impact_score,
       scraped_at = EXCLUDED.scraped_at,
       updated_at = NOW()
     RETURNING id, city, event_name, venue, start_date, end_date, source, scraped_at`,
    [
      payload.city,
      payload.eventName,
      payload.venue,
      payload.startDate,
      payload.endDate,
      payload.category,
      payload.scale,
      payload.estimatedAttendance,
      payload.radiusImpactKm,
      payload.source,
      payload.confidence,
      payload.venueLat,
      payload.venueLng,
      payload.eventUrl,
      payload.impactScore,
      payload.scrapedAt,
    ],
  );

  return rows[0] || null;
}

export async function listUpcomingEventsByCity(city, options = {}) {
  const horizonDays = Number.isFinite(Number(options.horizonDays)) ? Number(options.horizonDays) : 30;
  const { rows } = await pool.query(
    `SELECT
       id,
       city,
       event_name,
       venue,
       start_date,
       end_date,
       category,
       scale,
       estimated_attendance,
       radius_impact_km,
       source,
       confidence,
       venue_lat,
       venue_lng,
       event_url,
       impact_score,
       scraped_at
     FROM city_events
     WHERE lower(city) = lower($1)
       AND lower(city) = ANY($2::text[])
       AND end_date >= CURRENT_DATE
       AND start_date <= CURRENT_DATE + make_interval(days => $3)
     ORDER BY start_date ASC, event_name ASC`,
    [city, focusCityKeys, horizonDays],
  );
  return rows;
}
