import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { log } from "./lib/logger.js";
import { config } from "./config.js";
import { scanAllDomainClocks } from "./services/timeouts.js";

/**
 * Connector worker — polls queued jobs + booking timeout scanner.
 */
async function tick() {
  const result = await pool.query(
    `SELECT id, target_system, action, opportunity_id, idempotency_key
     FROM connector_jobs
     WHERE status = 'queued'
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     ORDER BY created_at ASC
     LIMIT 10`
  );

  if (result.rowCount) {
    for (const job of result.rows) {
      await pool.query(
        `UPDATE connector_jobs
         SET status = 'running', attempt_count = attempt_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );

      if (job.target_system === "asavari" && !config.asavari.syncEnabled) {
        await pool.query(
          `UPDATE connector_jobs
           SET status = 'dead_letter',
               error_code = 'ASAVARI_SYNC_DISABLED',
               safe_error_message = 'Asavari sync disabled in this environment',
               updated_at = NOW()
           WHERE id = $1`,
          [job.id]
        );
        await pool.query(
          `INSERT INTO desk_exceptions (
             opportunity_id, exception_type, severity, summary, details
           ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            job.opportunity_id,
            "asavari_sync_disabled",
            "normal",
            "Connector job held: Asavari sync disabled",
            JSON.stringify({ job_id: job.id, action: job.action }),
          ]
        );
        continue;
      }

      await pool.query(
        `UPDATE connector_jobs
         SET status = 'succeeded', updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
      log.info("connector job completed", {
        jobId: job.id,
        target: job.target_system,
        action: job.action,
      });
    }
  } else {
    log.debug("worker idle");
  }

  try {
    const clocks = await scanAllDomainClocks();
    const moved =
      clocks.timeouts.raised +
      clocks.timeouts.expired +
      clocks.attestation.raised +
      clocks.escalations.raised;
    if (moved) {
      log.info("domain clocks scanned", clocks);
    }
  } catch (error) {
    log.error("timeout scan failed", { error: String(error) });
  }
}

async function main() {
  await migrate();
  log.info("hotelradar-direct worker started", {
    asavariSync: config.asavari.syncEnabled,
  });
  setInterval(() => {
    tick().catch((error) => log.error("worker tick failed", { error: String(error) }));
  }, 5000);
}

main().catch((error) => {
  log.error("worker failed to start", { error: String(error) });
  process.exit(1);
});
