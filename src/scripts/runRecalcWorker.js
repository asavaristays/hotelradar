import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { processNextRecalculationJob } from '../services/recalcQueueService.js';

let stopped = false;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loop() {
  logger.info('recalc_worker_started', {
    pollMs: env.recalcQueuePollMs,
  });

  while (!stopped) {
    try {
      const processed = await processNextRecalculationJob();
      if (!processed) {
        await sleep(env.recalcQueuePollMs);
      }
    } catch (error) {
      logger.error('recalc_worker_loop_error', { error: error.message });
      await sleep(env.recalcQueuePollMs);
    }
  }

  logger.info('recalc_worker_stopped');
}

process.on('SIGINT', () => {
  stopped = true;
});

process.on('SIGTERM', () => {
  stopped = true;
});

await loop();
