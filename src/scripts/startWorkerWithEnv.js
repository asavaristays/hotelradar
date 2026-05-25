import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

const envPaths = ['/opt/radar_light/.env', '/opt/radar_light/shared/.env'];

for (const envPath of envPaths) {
  if (dotenv.config({ path: envPath }).parsed) break;
}

await import(pathToFileURL('/opt/radar_light/src/scripts/runRecalcWorker.js').href);
