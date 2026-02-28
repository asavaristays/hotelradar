import crypto from 'crypto';
import { insertAuditLog } from '../../repositories/auditRepository.js';

export function createResultHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Persist deterministic audit trail for engine execution.
 * @param {{
 *  hotelId:string,
 *  userId?:string,
 *  triggerSource:string,
 *  executionMs:number,
 *  engineVersion?:string,
 *  resultPayload:object,
 *  metadata?:object
 * }} input
 */
export async function logAuditTrail(input) {
  const resultHash = createResultHash(input.resultPayload || {});
  return insertAuditLog({
    hotelId: input.hotelId,
    userId: input.userId || null,
    triggerSource: input.triggerSource || 'system',
    executionMs: Number(input.executionMs || 0),
    engineVersion: input.engineVersion || 'v3.0.0',
    resultHash,
    metadata: input.metadata || {},
  });
}
