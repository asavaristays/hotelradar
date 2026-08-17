import { config } from "../config.js";
import { pool, withTransaction } from "../db/pool.js";
import { generateOtpCode, hashOtp, maskMobile, safeEqualHex } from "../lib/crypto.js";
import { log } from "../lib/logger.js";
import { getOpportunityByToken } from "./opportunity.js";

export async function sendOtp(publicToken: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }
  if (row.otp_verified_at) {
    throw Object.assign(new Error("Mobile already verified"), { status: 409 });
  }
  if (row.status !== "verifying" && row.status !== "verification_pending" && row.status !== "draft") {
    throw Object.assign(new Error("OTP not allowed in current status"), {
      status: 409,
    });
  }

  const recent = await pool.query(
    `SELECT last_sent_at FROM otp_challenges
     WHERE opportunity_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [row.id]
  );
  if (recent.rowCount) {
    const last = new Date(recent.rows[0].last_sent_at).getTime();
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < config.otp.resendCooldownSeconds) {
      throw Object.assign(
        new Error(
          `Wait ${Math.ceil(config.otp.resendCooldownSeconds - elapsed)}s before resending`
        ),
        { status: 429 }
      );
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtp(code, row.id);
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO otp_challenges (
       opportunity_id, mobile, code_hash, expires_at, max_attempts, last_sent_at
     ) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [row.id, row.mobile, codeHash, expiresAt.toISOString(), config.otp.maxAttempts]
  );

  if (config.otp.provider === "dev") {
    log.info("dev OTP issued", {
      opportunityId: row.external_opportunity_id,
      mobile: maskMobile(row.mobile),
      code: config.otp.revealDevCode ? code : "[hidden]",
    });
  } else {
    // Future: call SMS provider. Until then fail closed unless provider=dev.
    throw Object.assign(
      new Error("OTP provider not configured. Set OTP_PROVIDER=dev for testing."),
      { status: 503 }
    );
  }

  return {
    public_token: publicToken,
    mobile_masked: maskMobile(row.mobile),
    expires_in_seconds: config.otp.ttlSeconds,
    resend_after_seconds: config.otp.resendCooldownSeconds,
    ...(config.otp.provider === "dev" && config.otp.revealDevCode
      ? { dev_code: code }
      : {}),
  };
}

export async function verifyOtp(publicToken: string, code: string) {
  const row = await getOpportunityByToken(publicToken);
  if (!row) {
    throw Object.assign(new Error("Opportunity not found"), { status: 404 });
  }
  if (row.otp_verified_at) {
    return {
      public_token: publicToken,
      status: row.status,
      already_verified: true,
    };
  }

  return withTransaction(async (client) => {
    const challenge = await client.query(
      `SELECT * FROM otp_challenges
       WHERE opportunity_id = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [row.id]
    );
    if (!challenge.rowCount) {
      throw Object.assign(new Error("No active OTP. Request a new code."), {
        status: 400,
      });
    }
    const ch = challenge.rows[0];
    if (new Date(ch.expires_at).getTime() < Date.now()) {
      throw Object.assign(new Error("That code has expired. Request a new code."), {
        status: 400,
      });
    }
    if (ch.attempt_count >= ch.max_attempts) {
      throw Object.assign(new Error("Too many attempts. Request a new code."), {
        status: 429,
      });
    }

    const ok = safeEqualHex(ch.code_hash, hashOtp(code.trim(), row.id));
    await client.query(
      `UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE id = $1`,
      [ch.id]
    );
    if (!ok) {
      throw Object.assign(
        new Error("That code did not match. Try again or request a new code."),
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1`,
      [ch.id]
    );
    await client.query(
      `UPDATE traveller_requests SET otp_verified_at = NOW(), updated_at = NOW()
       WHERE opportunity_id = $1`,
      [row.id]
    );
    await client.query(
      `UPDATE opportunities
       SET status = 'verified',
           domain_opp_status = 'verified',
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, actor_id, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'consent.verified','traveller',$2,'direct',$3,'verified',$4,$5::jsonb)`,
      [
        row.id,
        row.mobile,
        row.status,
        `${row.external_opportunity_id}:consent.verified:1`,
        JSON.stringify({ mobile_masked: maskMobile(row.mobile) }),
      ]
    );
    await client.query(
      `INSERT INTO opportunity_events (
         opportunity_id, event_type, actor_type, source_system,
         previous_status, new_status, idempotency_key, payload
       ) VALUES ($1,'opportunity.qualified','system','direct','verified','verified',$2,$3::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        row.id,
        `${row.external_opportunity_id}:verified_awaiting_route:1`,
        JSON.stringify({
          note: "Verified — awaiting route (happy path, not an exception)",
          destination: row.destination,
          area: row.requested_area,
          check_in: row.check_in,
          check_out: row.check_out,
        }),
      ]
    );

    return {
      public_token: publicToken,
      status: "verified",
      external_opportunity_id: row.external_opportunity_id,
      already_verified: false,
    };
  });
}
