import { pool } from '../db/pool.js';
import { isPhysicalEventRecord } from '../utils/eventVisibility.js';
import { isVisibleHotelRecord } from '../utils/hotelVisibility.js';

function toBatchRows(rows = [], batchSize = 50) {
  const size = Math.max(1, Number(batchSize || 50));
  const batches = [];

  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }

  return batches;
}

async function upsertMarketHotelsBatch(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 8;
    values.push(
      row.googlePlaceId,
      row.hotelName,
      row.city,
      row.latitude,
      row.longitude,
      row.googleRating,
      row.reviewCount,
      row.source,
    );
    return `(
      $${offset + 1}::text,
      $${offset + 2}::text,
      $${offset + 3}::text,
      $${offset + 4}::double precision,
      $${offset + 5}::double precision,
      $${offset + 6}::numeric(3,2),
      $${offset + 7}::integer,
      $${offset + 8}::text
    )`;
  });

  const result = await pool.query(
    `WITH input_rows (
       google_place_id,
       hotel_name,
       city,
       latitude,
       longitude,
       google_rating,
       review_count,
       source
     ) AS (
       VALUES ${placeholders.join(', ')}
     ),
     deduped_input AS (
       SELECT DISTINCT ON (hotel_name, city)
         google_place_id,
         hotel_name,
         city,
         latitude,
         longitude,
         google_rating,
         review_count,
         source
       FROM input_rows
       ORDER BY hotel_name, city, review_count DESC NULLS LAST, google_place_id DESC NULLS LAST
     ),
     updated AS (
       UPDATE market_hotels mh
       SET
         google_place_id = COALESCE(mh.google_place_id, deduped_input.google_place_id),
         hotel_name = deduped_input.hotel_name,
         city = deduped_input.city,
         latitude = deduped_input.latitude,
         longitude = deduped_input.longitude,
         google_rating = deduped_input.google_rating,
         review_count = deduped_input.review_count,
         source = deduped_input.source,
         updated_at = NOW()
       FROM deduped_input
       WHERE (
         deduped_input.google_place_id IS NOT NULL
         AND mh.google_place_id = deduped_input.google_place_id
       ) OR (
         mh.hotel_name = deduped_input.hotel_name
         AND mh.city = deduped_input.city
       )
       RETURNING mh.id
     ),
     inserted AS (
       INSERT INTO market_hotels (
         google_place_id,
         hotel_name,
         city,
         latitude,
         longitude,
         google_rating,
         review_count,
         source,
         updated_at
       )
       SELECT
         deduped_input.google_place_id,
         deduped_input.hotel_name,
         deduped_input.city,
         deduped_input.latitude,
         deduped_input.longitude,
         deduped_input.google_rating,
         deduped_input.review_count,
         deduped_input.source,
         NOW()
       FROM deduped_input
       WHERE NOT EXISTS (
         SELECT 1
         FROM market_hotels mh
         WHERE (
           deduped_input.google_place_id IS NOT NULL
           AND mh.google_place_id = deduped_input.google_place_id
         ) OR (
           mh.hotel_name = deduped_input.hotel_name
           AND mh.city = deduped_input.city
         )
       )
       ON CONFLICT (hotel_name, city) DO UPDATE
       SET
         google_place_id = COALESCE(market_hotels.google_place_id, EXCLUDED.google_place_id),
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         google_rating = EXCLUDED.google_rating,
         review_count = EXCLUDED.review_count,
         source = EXCLUDED.source,
         updated_at = NOW()
       RETURNING id
     )
     SELECT
       (SELECT COUNT(*) FROM updated) + (SELECT COUNT(*) FROM inserted) AS row_count`,
    values,
  );

  return { rowCount: Number(result.rows?.[0]?.row_count || 0) };
}

export async function upsertMarketHotels(rows = [], { batchSize = 50 } = {}) {
  let rowCount = 0;

  for (const batch of toBatchRows(rows, batchSize)) {
    const result = await upsertMarketHotelsBatch(batch);
    rowCount += Number(result?.rowCount || 0);
  }

  return { rowCount };
}

export async function deleteMarketHotelsMissingPlaceIdByCity(city) {
  const result = await pool.query(
    `DELETE FROM market_hotels
     WHERE city = $1
       AND google_place_id IS NULL`,
    [city],
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function getMarketHotelCountsByCity(city) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::integer AS total_hotels,
       COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::integer AS with_place_id
     FROM market_hotels
     WHERE city = $1`,
    [city],
  );

  return {
    totalHotels: Number(rows[0]?.total_hotels || 0),
    withPlaceId: Number(rows[0]?.with_place_id || 0),
  };
}

export async function listMarketHotelsWithCoordinates(city = null) {
  const values = [];
  const filters = ['latitude IS NOT NULL', 'longitude IS NOT NULL'];

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_name,
       city,
       latitude,
       longitude,
       google_place_id
     FROM market_hotels
     WHERE ${filters.join(' AND ')}
     ORDER BY city, hotel_name, id`,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    googlePlaceId: row.google_place_id,
  })).filter((row) => isVisibleHotelRecord(row));
}

export async function listMarketHotelsMissingContactFields({ limit = null } = {}) {
  const values = [];
  let limitClause = '';

  if (limit != null) {
    values.push(Math.max(1, Number(limit || 1)));
    limitClause = `LIMIT $${values.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_name,
       city,
       google_place_id,
       website,
       phone,
       google_maps_url
     FROM market_hotels
     WHERE google_place_id IS NOT NULL
       AND (
         website IS NULL
         OR phone IS NULL
         OR google_maps_url IS NULL
       )
     ORDER BY city, hotel_name, id
     ${limitClause}`,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    googlePlaceId: row.google_place_id,
    website: row.website,
    phone: row.phone,
    googleMapsUrl: row.google_maps_url,
  }));
}

export async function updateMarketHotelContactFields(
  hotelId,
  { website = null, phone = null, googleMapsUrl = null } = {},
) {
  const result = await pool.query(
    `UPDATE market_hotels
     SET
       website = COALESCE(website, $2::text),
       phone = COALESCE(phone, $3::text),
       google_maps_url = COALESCE(google_maps_url, $4::text)
     WHERE id = $1::uuid
       AND (
         ($2::text IS NOT NULL AND website IS NULL)
         OR ($3::text IS NOT NULL AND phone IS NULL)
         OR ($4::text IS NOT NULL AND google_maps_url IS NULL)
       )`,
    [hotelId, website, phone, googleMapsUrl],
  );

  return { rowCount: Number(result.rowCount || 0) };
}

async function insertMarketHotelNeighborsBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 3;
    values.push(row.hotelId, row.neighborHotelId, row.distanceKm);
    return `(
      $${offset + 1}::uuid,
      $${offset + 2}::uuid,
      $${offset + 3}::numeric(8,3)
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_hotel_neighbors (
       hotel_id,
       neighbor_hotel_id,
       distance_km
     )
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (hotel_id, neighbor_hotel_id) DO UPDATE
     SET
       distance_km = EXCLUDED.distance_km,
       created_at = NOW()`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketHotelNeighbors(
  hotelIds = [],
  rows = [],
  { batchSize = 500 } = {},
) {
  const dedupedHotelIds = Array.from(
    new Set((Array.isArray(hotelIds) ? hotelIds : []).filter(Boolean)),
  );

  if (!dedupedHotelIds.length) {
    return { deletedRowCount: 0, rowCount: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleteResult = await client.query(
      `DELETE FROM market_hotel_neighbors
       WHERE hotel_id = ANY($1::uuid[])`,
      [dedupedHotelIds],
    );

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertMarketHotelNeighborsBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');

    return {
      deletedRowCount: Number(deleteResult.rowCount || 0),
      rowCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMarketHotelsForSignals(city = null) {
  const values = [];
  const filters = [];

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_name,
       city,
       google_rating,
       review_count,
       has_chatbot
     FROM market_hotels
     ${whereClause}
     ORDER BY city, hotel_name, id`,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    googleRating: row.google_rating == null ? null : Number(row.google_rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    hasChatbot: row.has_chatbot == null ? null : Boolean(row.has_chatbot),
  })).filter((row) => isVisibleHotelRecord(row));
}

export async function listMarketHotelNeighbors(city = null) {
  const values = [];
  let cityFilter = '';

  if (city) {
    values.push(city);
    cityFilter = `WHERE source_hotel.city = $${values.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       nh.hotel_id,
       nh.neighbor_hotel_id,
       nh.distance_km
     FROM market_hotel_neighbors nh
     JOIN market_hotels source_hotel
       ON source_hotel.id = nh.hotel_id
     ${cityFilter}
     ORDER BY nh.hotel_id, nh.distance_km, nh.neighbor_hotel_id`,
    values,
  );

  return rows.map((row) => ({
    hotelId: row.hotel_id,
    neighborHotelId: row.neighbor_hotel_id,
    distanceKm: Number(row.distance_km),
  }));
}

async function insertMarketHotelSignalsBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 3;
    values.push(row.hotelId, row.signalType, row.signalStrength);
    return `(
      $${offset + 1}::uuid,
      $${offset + 2}::text,
      $${offset + 3}::numeric(10,4)
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_hotel_signals (
       hotel_id,
       signal_type,
       signal_strength
     )
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (hotel_id, signal_type) DO UPDATE
     SET
       signal_strength = EXCLUDED.signal_strength,
       created_at = NOW()`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketHotelSignals(
  hotelIds = [],
  rows = [],
  { batchSize = 500, signalTypes = [] } = {},
) {
  const dedupedHotelIds = Array.from(
    new Set((Array.isArray(hotelIds) ? hotelIds : []).filter(Boolean)),
  );

  if (!dedupedHotelIds.length) {
    return { deletedRowCount: 0, rowCount: 0 };
  }

  const dedupedSignalTypes = Array.from(
    new Set((Array.isArray(signalTypes) ? signalTypes : []).filter(Boolean)),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleteValues = [dedupedHotelIds];
    let deleteQuery = `DELETE FROM market_hotel_signals
       WHERE hotel_id = ANY($1::uuid[])`;

    if (dedupedSignalTypes.length) {
      deleteValues.push(dedupedSignalTypes);
      deleteQuery += ` AND signal_type = ANY($2::text[])`;
    }

    const deleteResult = await client.query(deleteQuery, deleteValues);

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertMarketHotelSignalsBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');

    return {
      deletedRowCount: Number(deleteResult.rowCount || 0),
      rowCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMarketHotelSignals(signalTypes = [], city = null) {
  const values = [];
  const filters = [];

  if (Array.isArray(signalTypes) && signalTypes.length) {
    values.push(signalTypes);
    filters.push(`signal.signal_type = ANY($${values.length}::text[])`);
  }

  if (city) {
    values.push(city);
    filters.push(`hotel.city = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       signal.hotel_id,
       signal.signal_type,
       signal.signal_strength
     FROM market_hotel_signals signal
     JOIN market_hotels hotel
       ON hotel.id = signal.hotel_id
     ${whereClause}
     ORDER BY signal.hotel_id, signal.signal_type`,
    values,
  );

  return rows.map((row) => ({
    hotelId: row.hotel_id,
    signalType: row.signal_type,
    signalStrength: row.signal_strength == null ? null : Number(row.signal_strength),
  }));
}

export async function listFestivalCityEvents(city = null, categories = []) {
  const values = [];
  const filters = [
    'venue_lat IS NOT NULL',
    'venue_lng IS NOT NULL',
  ];

  if (Array.isArray(categories) && categories.length) {
    values.push(categories.map((category) => String(category).trim().toLowerCase()));
    filters.push(`LOWER(category) = ANY($${values.length}::text[])`);
  }

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       id,
       city,
       event_name,
       category,
       venue,
       venue_lat,
       venue_lng
     FROM city_events
     WHERE ${filters.join(' AND ')}
     ORDER BY city, start_date, event_name, id`,
    values,
  );

  return rows
    .filter((row) => isPhysicalEventRecord(row))
    .map((row) => ({
      id: row.id,
      city: row.city,
      eventName: row.event_name,
      category: row.category,
      venue: row.venue,
      latitude: Number(row.venue_lat),
      longitude: Number(row.venue_lng),
    }));
}

export async function listRecentMarketHotelSignalsForFeed({ city = null, hours = 24 } = {}) {
  const values = [Math.max(1, Number(hours || 24))];
  const filters = [`signal.created_at > NOW() - ($1::text || ' hours')::interval`];

  if (city) {
    values.push(city);
    filters.push(`hotel.city = $${values.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       hotel.city,
       signal.signal_type,
       signal.hotel_id,
       signal.created_at,
       signal.signal_strength
     FROM market_hotel_signals signal
     JOIN market_hotels hotel
       ON hotel.id = signal.hotel_id
     WHERE ${filters.join(' AND ')}
     ORDER BY hotel.city, signal.created_at DESC, signal.signal_strength DESC, signal.hotel_id`,
    values,
  );

  return rows.map((row) => ({
    city: row.city,
    signalType: row.signal_type,
    hotelId: row.hotel_id,
    createdAt: row.created_at,
    signalStrength: row.signal_strength == null ? null : Number(row.signal_strength),
  }));
}

async function insertMarketOpportunityFeedBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 5;
    values.push(row.city, row.signalType, row.hotelId, row.createdAt, row.signalStrength);
    return `(
      $${offset + 1}::text,
      $${offset + 2}::text,
      $${offset + 3}::uuid,
      $${offset + 4}::timestamptz,
      $${offset + 5}::numeric(10,4)
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_opportunity_feed (
       city,
       signal_type,
       hotel_id,
       created_at,
       signal_strength
     )
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketOpportunityFeed(rows = [], { batchSize = 500 } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM market_opportunity_feed');

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertMarketOpportunityFeedBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');
    return { rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMarketOpportunityFeed(city = null) {
  const values = [];
  const filters = [];

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       city,
       signal_type,
       hotel_id,
       created_at,
       signal_strength
     FROM market_opportunity_feed
     ${whereClause}
     ORDER BY city, created_at DESC, signal_strength DESC, hotel_id`,
    values,
  );

  return rows.map((row) => ({
    city: row.city,
    signalType: row.signal_type,
    hotelId: row.hotel_id,
    createdAt: row.created_at,
    signalStrength: row.signal_strength == null ? null : Number(row.signal_strength),
  }));
}

async function insertRankedOpportunityBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 5;
    values.push(row.city, row.hotelId, row.signalType, row.score, row.createdAt);
    return `(
      $${offset + 1}::text,
      $${offset + 2}::uuid,
      $${offset + 3}::text,
      $${offset + 4}::numeric(12,4),
      $${offset + 5}::timestamptz
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_ranked_opportunities (
       city,
       hotel_id,
       signal_type,
       score,
       created_at
     )
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketRankedOpportunities(rows = [], { batchSize = 500 } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM market_ranked_opportunities');

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertRankedOpportunityBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');
    return { rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertMarketHotelBenchmarksBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 6;
    values.push(
      row.hotelId,
      row.city,
      row.nearbyHotelCount,
      row.avgNearbyRating,
      row.avgNearbyReviews,
      row.nearbySignalCount,
    );
    return `(
      $${offset + 1}::uuid,
      $${offset + 2}::text,
      $${offset + 3}::integer,
      $${offset + 4}::numeric(6,3),
      $${offset + 5}::numeric(12,3),
      $${offset + 6}::integer
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_hotel_benchmarks (
       hotel_id,
       city,
       nearby_hotel_count,
       avg_nearby_rating,
       avg_nearby_reviews,
       nearby_signal_count
     )
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketHotelBenchmarks(rows = [], { batchSize = 500 } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM market_hotel_benchmarks');

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertMarketHotelBenchmarksBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');
    return { rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMarketRankedOpportunities(city = null) {
  const values = [];
  const filters = [];

  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT
       city,
       hotel_id,
       signal_type,
       score,
       created_at
     FROM market_ranked_opportunities
     ${whereClause}
     ORDER BY city, score DESC, created_at DESC, hotel_id`,
    values,
  );

  return rows.map((row) => ({
    city: row.city,
    hotelId: row.hotel_id,
    signalType: row.signal_type,
    score: Number(row.score),
    createdAt: row.created_at,
  }));
}

async function insertMarketOpportunityNotificationsBatch(client, rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { rowCount: 0 };
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 4;
    values.push(row.hotelId, row.signalType, row.opportunityScore, row.createdAt);
    return `(
      $${offset + 1}::uuid,
      $${offset + 2}::text,
      $${offset + 3}::numeric(12,4),
      $${offset + 4}::timestamptz
    )`;
  });

  const result = await client.query(
    `INSERT INTO market_opportunity_notifications (
       hotel_id,
       signal_type,
       opportunity_score,
       created_at
     )
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  return { rowCount: Number(result.rowCount || 0) };
}

export async function replaceMarketOpportunityNotifications(rows = [], { batchSize = 500 } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM market_opportunity_notifications');

    let rowCount = 0;
    for (const batch of toBatchRows(rows, batchSize)) {
      const result = await insertMarketOpportunityNotificationsBatch(client, batch);
      rowCount += Number(result?.rowCount || 0);
    }

    await client.query('COMMIT');
    return { rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTopRankedOpportunitiesByCity(city, { limit = 5 } = {}) {
  const { rows } = await pool.query(
    `SELECT
       ranked.signal_type,
       ranked.score,
       ranked.created_at,
       hotel.hotel_name
     FROM market_ranked_opportunities ranked
     JOIN market_hotels hotel
       ON hotel.id = ranked.hotel_id
     WHERE ranked.city = $1
     ORDER BY ranked.score DESC, ranked.created_at DESC, ranked.hotel_id
     LIMIT $2`,
    [city, Math.max(1, Number(limit || 5))],
  );

  return rows.map((row) => ({
    signalType: row.signal_type,
    score: Number(row.score),
    createdAt: row.created_at,
    hotelName: row.hotel_name,
  })).filter((row) => isVisibleHotelRecord(row));
}

export async function getLatestRankedOpportunityScanByCity(city) {
  const { rows } = await pool.query(
    `SELECT MAX(created_at) AS last_market_scan
     FROM market_ranked_opportunities
     WHERE city = $1`,
    [city],
  );

  return rows[0]?.last_market_scan || null;
}

export async function listTopRankedOpportunitiesForFeed(
  { city = null, signalType = null, limitPerCity = 20, limit = 200 } = {},
) {
  const values = [];
  const filters = [];

  if (city) {
    values.push(city);
    filters.push(`ranked.city = $${values.length}`);
  }

  if (signalType) {
    values.push(signalType);
    filters.push(`ranked.signal_type = $${values.length}`);
  }

  values.push(Math.max(1, Number(limitPerCity || 20)));
  const limitPerCityPlaceholder = `$${values.length}`;

  values.push(Math.max(1, Number(limit || 200)));
  const limitPlaceholder = `$${values.length}`;

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `WITH scoped_rows AS (
       SELECT
         ranked.hotel_id,
         ranked.city,
         ranked.signal_type,
         ranked.score,
         ranked.created_at,
         hotel.hotel_name,
         hotel.latitude,
         hotel.longitude,
         ROW_NUMBER() OVER (
           PARTITION BY ranked.city
           ORDER BY ranked.score DESC, ranked.created_at DESC, ranked.hotel_id
         ) AS city_rank
       FROM market_ranked_opportunities ranked
       JOIN market_hotels hotel
         ON hotel.id = ranked.hotel_id
       ${whereClause}
     )
     SELECT
       hotel_id,
       city,
       signal_type,
       score,
       created_at,
       hotel_name,
       latitude,
       longitude
     FROM scoped_rows
     WHERE city_rank <= ${limitPerCityPlaceholder}
     ORDER BY city, score DESC, created_at DESC, hotel_id
     LIMIT ${limitPlaceholder}`,
    values,
  );

  return rows.map((row) => ({
    hotelId: row.hotel_id,
    city: row.city,
    signalType: row.signal_type,
    score: Number(row.score),
    createdAt: row.created_at,
    hotelName: row.hotel_name,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  })).filter((row) => isVisibleHotelRecord(row));
}

export async function listRecentMarketSignalsForMap({ city = null, limit = 1000, hours = 24 } = {}) {
  const values = [Math.max(1, Number(hours || 24))];
  const filters = [
    'hotel.latitude IS NOT NULL',
    'hotel.longitude IS NOT NULL',
    `signal.created_at > NOW() - ($1::text || ' hours')::interval`,
  ];

  if (city) {
    values.push(city);
    filters.push(`hotel.city = $${values.length}`);
  }

  values.push(Math.max(1, Number(limit || 1000)));

  const { rows } = await pool.query(
    `SELECT
       signal.signal_type,
       signal.signal_strength,
       hotel.city,
       hotel.latitude,
       hotel.longitude,
       hotel.hotel_name,
       signal.created_at
     FROM market_hotel_signals signal
     JOIN market_hotels hotel
       ON hotel.id = signal.hotel_id
     WHERE ${filters.join(' AND ')}
     ORDER BY signal.created_at DESC, signal.signal_strength DESC, signal.hotel_id
     LIMIT $${values.length}`,
    values,
  );

  return rows.map((row) => ({
    signalType: row.signal_type,
    city: row.city,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    location: row.hotel_name,
    intensity:
      row.signal_strength == null
        ? 0.4
        : Math.max(0, Math.min(1, Number(row.signal_strength) <= 1 ? Number(row.signal_strength) : Number(row.signal_strength) / 10)),
    timestamp: row.created_at,
    createdAt: row.created_at,
  })).filter((row) => isVisibleHotelRecord({ hotelName: row.location }));
}

export async function listMarketHotelsByNamesAndCity(city, hotelNames = []) {
  const normalizedNames = Array.isArray(hotelNames)
    ? [...new Set(hotelNames.map((name) => String(name || '').trim()).filter(Boolean))]
    : [];

  if (!city || !normalizedNames.length) {
    return [];
  }

  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_name,
       city,
       google_rating,
       review_count
     FROM market_hotels
     WHERE city = $1
       AND lower(hotel_name) = ANY(
         SELECT lower(value)
         FROM unnest($2::text[]) AS value
       )
     ORDER BY hotel_name ASC`,
    [city, normalizedNames],
  );

  return rows.map((row) => ({
    id: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    googleRating: row.google_rating == null ? null : Number(row.google_rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
  })).filter((row) => isVisibleHotelRecord(row));
}
