import { runNightlyCalibration } from '../services/intelligence-engine/calibrationFasttrackEngine.js';
import { logger } from '../config/logger.js';

async function main() {
  const minObservations =
    process.env.CALIBRATION_MIN_OBS == null ? null : Number(process.env.CALIBRATION_MIN_OBS);
  const canaryFraction =
    process.env.CALIBRATION_CANARY_FRACTION == null
      ? null
      : Number(process.env.CALIBRATION_CANARY_FRACTION);

  const result = await runNightlyCalibration({
    days: Number(process.env.CALIBRATION_DAYS || 14),
    minObservations,
    canaryFraction,
    dryRun: String(process.env.CALIBRATION_DRY_RUN || 'false') === 'true',
    triggeredBy: null,
  });

  logger.info('nightly_calibration_completed', result);

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  logger.error('nightly_calibration_failed', { error: error.message, stack: error.stack });
  process.exitCode = 1;
});
