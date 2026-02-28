import { app } from './app.js';
import { pool } from './db/pool.js';
import { assertSchemaUpToDate } from './db/migrationManager.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let server;

async function start() {
  try {
    await pool.query('SELECT 1');
    await assertSchemaUpToDate();

    server = app.listen(env.port, () => {
      logger.info('server_started', {
        port: env.port,
        nodeEnv: env.nodeEnv,
      });
    });

    server.on('error', (error) => {
      logger.error('server_listen_error', {
        code: error.code,
        message: error.message,
      });
      process.exit(1);
    });
  } catch (error) {
    logger.error('server_startup_failed', {
      message: error.message,
      stack: env.isProduction ? undefined : error.stack,
    });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { message: error.message, stack: error.stack });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('shutdown_signal_received', { signal: 'SIGTERM' });
  if (server) {
    server.close(() => {
      logger.info('http_server_closed');
    });
  }
  await pool.end();
  process.exit(0);
});

start();
