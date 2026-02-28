import { pool } from '../db/pool.js';
import { getCalibration } from '../config/calibration.js';
import { getSchemaVersionStatus } from '../db/migrationManager.js';

export async function runReadinessChecks() {
  const checks = {
    database: { ok: false, message: '' },
    calibration: { ok: false, message: '' },
    migrations: { ok: false, message: '' },
  };

  try {
    await pool.query('SELECT 1');
    checks.database = { ok: true, message: 'db connection ok' };
  } catch (error) {
    checks.database = { ok: false, message: error.message };
  }

  try {
    await getCalibration({ force: true });
    checks.calibration = { ok: true, message: 'calibration loaded' };
  } catch (error) {
    checks.calibration = { ok: false, message: error.message };
  }

  try {
    const schema = await getSchemaVersionStatus();
    checks.migrations = schema.pendingCount === 0
      ? { ok: true, message: 'schema up to date' }
      : { ok: false, message: `pending migrations: ${schema.pending.join(', ')}` };
  } catch (error) {
    checks.migrations = { ok: false, message: error.message };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  return {
    status: ready ? 'ready' : 'not_ready',
    ready,
    checks,
    timestamp: new Date().toISOString(),
  };
}
