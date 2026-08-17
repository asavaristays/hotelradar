import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://direct:change_me_direct_db@127.0.0.1:5432/hotelradar_direct"
  ),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  appUrl: process.env.APP_URL ?? "http://localhost:4100",
  logLevel: process.env.LOG_LEVEL ?? "info",
  otp: {
    provider: process.env.OTP_PROVIDER ?? "dev",
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 45),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    /** Reveal OTP in API response for testing when provider=dev */
    revealDevCode: (process.env.OTP_REVEAL_DEV_CODE ?? "true") === "true",
  },
  asavari: {
    baseUrl: process.env.ASAVARI_BASE_URL ?? "https://asavaristays.com",
    auth: process.env.ASAVARI_INTEGRATION_AUTH ?? "",
    webhookSecret: process.env.ASAVARI_WEBHOOK_SECRET ?? "",
    syncEnabled: (process.env.ASAVARI_SYNC_ENABLED ?? "false") === "true",
  },
  admin: {
    sessionSecret:
      process.env.ADMIN_SESSION_SECRET ||
      process.env.AUTH_SECRET ||
      "dev-only-change-me-admin-session",
    sessionTtlSeconds: Number(process.env.ADMIN_SESSION_TTL_SECONDS ?? 12 * 60 * 60),
    bootstrapUser: process.env.ADMIN_BOOTSTRAP_USER ?? "",
    bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "",
    /** Set true when browsers hit the site over HTTPS (hotelradar.in). Keep false for http://127.0.0.1 tunnel. */
    cookieSecure: (process.env.ADMIN_COOKIE_SECURE ?? "false") === "true",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  },
};
