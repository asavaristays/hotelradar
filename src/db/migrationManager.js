import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { pool } from './pool.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');
const MIGRATION_LOCK_KEY = 918274;

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('executed', 'baselined')),
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrationMap(client) {
  const { rows } = await client.query(
    `SELECT file_name, checksum, status, applied_at
     FROM schema_migrations`,
  );
  return new Map(rows.map((row) => [row.file_name, row]));
}

async function hasLegacySchema(client) {
  const { rows } = await client.query(
    `SELECT
       to_regclass('public.hotels') IS NOT NULL AS has_hotels,
       to_regclass('public.demand_scores') IS NOT NULL AS has_demand_scores`,
  );
  return Boolean(rows[0]?.has_hotels && rows[0]?.has_demand_scores);
}

async function baselineExistingSchema(client, files) {
  for (const fileName of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8');
    const checksum = sha256(sql);
    await client.query(
      `INSERT INTO schema_migrations (file_name, checksum, status, execution_ms)
       VALUES ($1, $2, 'baselined', 0)
       ON CONFLICT (file_name) DO NOTHING`,
      [fileName, checksum],
    );
  }
  logger.warn('migrations_baselined_existing_schema', {
    files: files.length,
    reason: 'legacy schema detected',
  });
}

async function applyMigration(client, fileName) {
  const started = Date.now();
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const sql = await fs.readFile(filePath, 'utf8');
  const checksum = sha256(sql);

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (file_name, checksum, status, execution_ms)
       VALUES ($1, $2, 'executed', $3)
       ON CONFLICT (file_name) DO UPDATE
       SET checksum = EXCLUDED.checksum,
           status = EXCLUDED.status,
           execution_ms = EXCLUDED.execution_ms,
           applied_at = NOW()`,
      [fileName, checksum, Date.now() - started],
    );
    await client.query('COMMIT');
    logger.info('migration_applied', { fileName, executionMs: Date.now() - started });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('migration_failed', { fileName, error: error.message });
    throw error;
  }
}

export async function runPendingMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await ensureSchemaMigrationsTable(client);
    const files = await listMigrationFiles();
    const appliedMap = await getAppliedMigrationMap(client);
    const pending = files.filter((fileName) => !appliedMap.has(fileName));

    if (!pending.length) {
      logger.info('migrations_up_to_date', { applied: files.length });
      return { appliedCount: 0, pendingCount: 0, baselined: false };
    }

    if (!appliedMap.size && env.migrationBaselineExisting && (await hasLegacySchema(client))) {
      await baselineExistingSchema(client, files);
      return { appliedCount: 0, pendingCount: 0, baselined: true };
    }

    for (const fileName of pending) {
      await applyMigration(client, fileName);
    }

    return { appliedCount: pending.length, pendingCount: 0, baselined: false };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

export async function getSchemaVersionStatus() {
  const client = await pool.connect();
  try {
    const { rows: existenceRows } = await client.query(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
    );
    const tableExists = Boolean(existenceRows[0]?.exists);
    if (!tableExists) {
      const available = await listMigrationFiles();
      return {
        tableExists: false,
        pending: available,
        pendingCount: available.length,
        latestApplied: null,
        latestAvailable: available.at(-1) || null,
      };
    }

    await ensureSchemaMigrationsTable(client);
    const files = await listMigrationFiles();
    const appliedMap = await getAppliedMigrationMap(client);
    const pending = files.filter((fileName) => !appliedMap.has(fileName));
    const latestApplied = [...appliedMap.keys()].sort().at(-1) || null;
    const latestAvailable = files.at(-1) || null;

    return {
      tableExists: true,
      pending,
      pendingCount: pending.length,
      latestApplied,
      latestAvailable,
    };
  } finally {
    client.release();
  }
}

export async function assertSchemaUpToDate({ strict = env.schemaCheckStrict } = {}) {
  const status = await getSchemaVersionStatus();
  if (!status.tableExists || status.pendingCount > 0) {
    const message = !status.tableExists
      ? 'schema_migrations table is missing. Run npm run db:migrate.'
      : `Pending migrations detected: ${status.pending.join(', ')}`;
    if (strict) {
      const error = new Error(message);
      error.status = 503;
      throw error;
    }
    logger.warn('schema_out_of_date', status);
  }
  return status;
}
