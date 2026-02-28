import { runPendingMigrations } from '../db/migrationManager.js';
import { logger } from '../config/logger.js';

try {
  const result = await runPendingMigrations();
  logger.info('migration_run_completed', result);
  process.exit(0);
} catch (error) {
  logger.error('migration_run_failed', {
    error: error?.message || String(error),
    code: error?.code,
    stack: error?.stack,
    details: Array.isArray(error?.errors)
      ? error.errors.map((entry) => ({
          message: entry?.message,
          code: entry?.code,
          address: entry?.address,
          port: entry?.port,
        }))
      : undefined,
  });
  process.exit(1);
}
