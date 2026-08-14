import { pool } from '../db/pool.js';

function mapEvidence(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    finalUrl: row.final_url,
    pageTitle: row.page_title,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    reachable: Boolean(row.reachable),
    blocked: Boolean(row.blocked),
    matchedHotelName: Boolean(row.matched_hotel_name),
    matchScore: Number(row.match_score || 0),
    ratingValue: row.rating_value == null ? null : Number(row.rating_value),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    bookingEngineUrl: row.booking_engine_url,
    contactUrl: row.contact_url,
    roomsUrl: row.rooms_url,
    confidenceScore: Number(row.confidence_score || 0),
    capturedAt: row.captured_at,
  };
}

function mapCompetitor(row) {
  return {
    id: row.id,
    marketHotelId: row.market_hotel_id,
    hotelName: row.hotel_name,
    city: row.city,
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    googleRating: row.google_rating == null ? null : Number(row.google_rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    source: row.source,
    verified: Boolean(row.verified),
  };
}

function mapJob(row) {
  return {
    id: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    area: row.area,
    status: row.status,
    confidenceScore: Number(row.confidence_score || 0),
    confidenceLabel: row.confidence_label,
    summary: row.summary,
    failureReason: row.failure_reason,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPropertyResearchJob({
  hotelName,
  city,
  area = null,
  requestedBy = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO property_research_jobs (
       hotel_name,
       city,
       area,
       requested_by,
       status,
       started_at
     )
     VALUES ($1, $2, $3, $4::uuid, 'running', NOW())
     RETURNING *`,
    [hotelName, city, area, requestedBy],
  );

  return mapJob(rows[0]);
}

export async function completePropertyResearchJob(
  jobId,
  {
    status,
    confidenceScore,
    confidenceLabel,
    summary,
    failureReason = null,
  },
) {
  const { rows } = await pool.query(
    `UPDATE property_research_jobs
     SET
       status = $2,
       confidence_score = $3,
       confidence_label = $4,
       summary = $5,
       failure_reason = $6,
       completed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [jobId, status, confidenceScore, confidenceLabel, summary, failureReason],
  );

  return rows[0] ? mapJob(rows[0]) : null;
}

export async function insertPropertyResearchEvidence(jobId, evidence = []) {
  if (!Array.isArray(evidence) || evidence.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stored = [];

    for (const row of evidence) {
      const result = await client.query(
        `INSERT INTO property_research_evidence (
           research_job_id,
           source_type,
           source_url,
           final_url,
           page_title,
           raw_value,
           normalized_value,
           http_status,
           reachable,
           blocked,
           matched_hotel_name,
           match_score,
           rating_value,
           review_count,
           booking_engine_url,
           contact_url,
           rooms_url,
           confidence_score
         )
         VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18
         )
         RETURNING *`,
        [
          jobId,
          row.sourceType,
          row.sourceUrl,
          row.finalUrl,
          row.pageTitle,
          row.rawValue,
          row.normalizedValue,
          row.httpStatus,
          row.reachable,
          row.blocked,
          row.matchedHotelName,
          row.matchScore,
          row.ratingValue,
          row.reviewCount,
          row.bookingEngineUrl,
          row.contactUrl,
          row.roomsUrl,
          row.confidenceScore,
        ],
      );
      stored.push(mapEvidence(result.rows[0]));
    }

    await client.query('COMMIT');
    return stored;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function selectPropertyResearchCompetitors({
  city,
  hotelName,
  limit = 6,
}) {
  const { rows } = await pool.query(
    `SELECT
       id,
       hotel_name,
       city,
       google_rating,
       review_count
     FROM market_hotels
     WHERE city = $1
       AND LOWER(hotel_name) <> LOWER($2)
     ORDER BY
       CASE WHEN google_rating IS NULL THEN 1 ELSE 0 END,
       review_count DESC NULLS LAST,
       google_rating DESC NULLS LAST,
       hotel_name
     LIMIT $3`,
    [city, hotelName, limit],
  );

  return rows.map((row) => ({
    marketHotelId: row.id,
    hotelName: row.hotel_name,
    city: row.city,
    distanceKm: null,
    googleRating: row.google_rating == null ? null : Number(row.google_rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    source: 'market_index',
    verified: Boolean(row.id),
  }));
}

export async function insertPropertyResearchCompetitors(jobId, competitors = []) {
  const stored = [];

  for (const row of competitors) {
    const { rows } = await pool.query(
      `INSERT INTO property_research_competitors (
         research_job_id,
         market_hotel_id,
         hotel_name,
         city,
         distance_km,
         google_rating,
         review_count,
         source,
         verified
       )
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (research_job_id, hotel_name, city) DO UPDATE
       SET
         market_hotel_id = EXCLUDED.market_hotel_id,
         google_rating = EXCLUDED.google_rating,
         review_count = EXCLUDED.review_count,
         source = EXCLUDED.source,
         verified = EXCLUDED.verified
       RETURNING *`,
      [
        jobId,
        row.marketHotelId,
        row.hotelName,
        row.city,
        row.distanceKm,
        row.googleRating,
        row.reviewCount,
        row.source,
        row.verified,
      ],
    );
    stored.push(mapCompetitor(rows[0]));
  }

  return stored;
}

export async function getPropertyResearchJob(jobId) {
  const { rows } = await pool.query(
    `SELECT * FROM property_research_jobs WHERE id = $1::uuid`,
    [jobId],
  );
  if (!rows[0]) return null;

  const [evidenceResult, competitorResult] = await Promise.all([
    pool.query(
      `SELECT *
       FROM property_research_evidence
       WHERE research_job_id = $1::uuid
       ORDER BY captured_at, id`,
      [jobId],
    ),
    pool.query(
      `SELECT *
       FROM property_research_competitors
       WHERE research_job_id = $1::uuid
       ORDER BY verified DESC, review_count DESC NULLS LAST, hotel_name`,
      [jobId],
    ),
  ]);

  return {
    ...mapJob(rows[0]),
    evidence: evidenceResult.rows.map(mapEvidence),
    competitors: competitorResult.rows.map(mapCompetitor),
    pricingBoundary: {
      eligibleForPricing: false,
      reason:
        'Research evidence and competitor candidates require verified stay-date rate observations before pricing use.',
    },
  };
}

export async function listPropertyResearchJobs({ city = null, limit = 20 } = {}) {
  const values = [];
  const filters = [];
  if (city) {
    values.push(city);
    filters.push(`city = $${values.length}`);
  }
  values.push(limit);
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT *
     FROM property_research_jobs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return rows.map(mapJob);
}
