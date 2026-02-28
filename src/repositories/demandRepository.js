import { pool } from '../db/pool.js';

export async function insertDemandScore(payload) {
  const {
    hotelId,
    demandScore,
    level,
    recommendation,
    confidence,
    explanation,
    marketPosition,
    signals,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO demand_scores (
      hotel_id,
      demand_score,
      level,
      recommendation,
      confidence,
      explanation,
      market_position,
      signals
    )
    VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb)
    RETURNING *`,
    [
      hotelId,
      demandScore,
      level,
      JSON.stringify(recommendation),
      confidence,
      JSON.stringify(explanation),
      JSON.stringify(marketPosition),
      JSON.stringify(signals),
    ],
  );

  return rows[0];
}

export async function getLatestDemandScore(hotelId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM demand_scores
     WHERE hotel_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [hotelId],
  );

  return rows[0] || null;
}

export async function getPreviousDemandScore(hotelId, currentScoreId = null) {
  const { rows } = await pool.query(
    `SELECT *
     FROM demand_scores
     WHERE hotel_id = $1
     ORDER BY created_at DESC, id DESC
     OFFSET CASE WHEN $2::text IS NULL THEN 0 ELSE 1 END
     LIMIT 1`,
    [hotelId, currentScoreId ? String(currentScoreId) : null],
  );

  return rows[0] || null;
}
