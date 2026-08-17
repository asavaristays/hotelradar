import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { log } from "../lib/logger.js";

export const ADMIN_COOKIE = "hrd_admin_session";

export type AdminUser = {
  id: string;
  username: string;
  role: "super_admin";
  is_active: boolean;
  last_login_at: string | null;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM admin_users`);
  if ((count.rows[0]?.n as number) > 0) return;

  const username = config.admin.bootstrapUser;
  const password = config.admin.bootstrapPassword;
  if (!username || !password) {
    log.warn("admin bootstrap skipped — no users and ADMIN_BOOTSTRAP_* not set");
    return;
  }
  if (password.length < 10) {
    log.warn("admin bootstrap skipped — password must be at least 10 characters");
    return;
  }

  await pool.query(
    `INSERT INTO admin_users (username, password_hash, role)
     VALUES ($1, $2, 'super_admin')
     ON CONFLICT (username) DO NOTHING`,
    [username, hashPassword(password)]
  );
  log.info("admin bootstrap user created", { username });
}

export async function loginAdmin(
  username: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null }
): Promise<{ user: AdminUser; token: string; expiresAt: Date } | null> {
  const result = await pool.query(
    `SELECT id, username, role, is_active, password_hash, last_login_at
     FROM admin_users WHERE lower(username) = lower($1) LIMIT 1`,
    [username.trim()]
  );
  const row = result.rows[0];
  if (!row || !row.is_active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.admin.sessionTtlSeconds * 1000);

  await pool.query(
    `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.id, tokenHash(token), expiresAt.toISOString(), meta.ip ?? null, meta.userAgent ?? null]
  );
  await pool.query(
    `UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [row.id]
  );

  return {
    token,
    expiresAt,
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      is_active: row.is_active,
      last_login_at: row.last_login_at,
    },
  };
}

export async function logoutAdmin(token: string | null): Promise<void> {
  if (!token) return;
  await pool.query(
    `UPDATE admin_sessions SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash(token)]
  );
}

export async function resolveAdminSession(token: string | null): Promise<AdminUser | null> {
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.username, u.role, u.is_active, u.last_login_at
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.admin_user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE
     LIMIT 1`,
    [tokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
  };
}
