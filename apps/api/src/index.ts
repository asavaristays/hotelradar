import { createApp } from "./app.js";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { log } from "./lib/logger.js";
import { ensureBootstrapAdmin } from "./services/adminAuth.js";
import { backfillEnumerableOppCodes } from "./services/adminOps.js";

async function main() {
  await migrate();
  await ensureBootstrapAdmin();
  try {
    const result = await backfillEnumerableOppCodes(2000);
    if (result.regenerated > 0) {
      log.info("enumerable OPP codes regenerated", result);
    }
  } catch (error) {
    log.warn("OPP code backfill skipped", { error: String(error) });
  }
  const app = createApp();
  app.listen(config.port, "0.0.0.0", () => {
    log.info("hotelradar-direct api listening", {
      port: config.port,
      asavariSync: config.asavari.syncEnabled,
    });
  });
}

main().catch((error) => {
  log.error("api failed to start", { error: String(error) });
  process.exit(1);
});
