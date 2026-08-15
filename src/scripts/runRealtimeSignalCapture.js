import { logger } from '../config/logger.js';
import {
  runRealtimeSignalCaptureCycle,
  runRealtimeSignalCaptureLoop,
} from '../services/realtimeSignalCaptureService.js';

async function main() {
  const runOnce = process.argv.includes('--once') || process.env.REALTIME_CAPTURE_RUN_ONCE === 'true';
  if (runOnce) {
    const summary = await runRealtimeSignalCaptureCycle({
      snapshotPath: process.env.REALTIME_SIGNAL_SNAPSHOT_FILE || '',
      collectorCommand: process.env.REALTIME_SIGNAL_COLLECT_COMMAND || '',
      source: 'realtime-capture-cli',
      cadence: 'manual',
      forceConfiguredSources: process.argv.includes('--force-sources') || process.env.REALTIME_CAPTURE_FORCE_SOURCES === 'true',
    });
    logger.info('realtime_signal_capture_script_completed', summary);
    return;
  }

  await runRealtimeSignalCaptureLoop({
    snapshotPath: process.env.REALTIME_SIGNAL_SNAPSHOT_FILE || '',
    collectorCommand: process.env.REALTIME_SIGNAL_COLLECT_COMMAND || '',
  });
}

main().catch((error) => {
  logger.error('realtime_signal_capture_script_failed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
