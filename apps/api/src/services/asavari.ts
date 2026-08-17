import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { log } from "../lib/logger.js";

/**
 * Asavari connectivity — HTTPS JSON only.
 * Discovered endpoints on asavaristays.com:
 *   GET /api/health      → public
 *   GET /api/properties  → auth required (401 without credentials)
 *   GET /api/villas      → auth required
 *   GET /api/stays       → auth required
 */

export type AsavariPropertySnapshot = {
  property_id: string;
  property_version: string;
  profile_complete: boolean;
  name: string;
  destination: string;
  decision_maker?: string | null;
  response_hours?: string | null;
  payment_method?: string | null;
  commission_terms?: string | null;
  public_url?: string | null;
  updated_at: string;
};

function authHeader(): string | null {
  const raw = config.asavari.auth.trim();
  if (!raw) return null;
  if (/^(bearer|basic)\s+/i.test(raw)) return raw;
  if (raw.startsWith("raw:")) return raw.slice(4).trim();
  return `Bearer ${raw}`;
}

async function asavariFetch(path: string, init: RequestInit = {}) {
  const base = config.asavari.baseUrl.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const auth = authHeader();
  if (auth) headers.set("authorization", auth);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  return res;
}

export async function checkAsavariHealth(): Promise<{
  ok: boolean;
  status_code: number;
  body: unknown;
  latency_ms: number;
}> {
  const started = Date.now();
  try {
    const res = await asavariFetch("/api/health");
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      ok: res.ok,
      status_code: res.status,
      body,
      latency_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status_code: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
      latency_ms: Date.now() - started,
    };
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function normalizeProperty(raw: unknown, index: number): AsavariPropertySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const propertyId =
    pickString(o, ["property_id", "id", "slug", "uuid", "_id"]) ?? `asavari-${index + 1}`;
  const name = pickString(o, ["name", "title", "property_name", "stay_name"]) ?? propertyId;
  const destination =
    pickString(o, ["destination", "area", "location", "city", "region"]) ?? "India";
  const version =
    pickString(o, ["property_version", "version", "updated_at", "updatedAt"]) ?? "v1";
  const profileComplete = Boolean(
    o.profile_complete ?? o.profileComplete ?? o.onboarding_complete ?? false
  );
  return {
    property_id: propertyId,
    property_version: version,
    profile_complete: profileComplete,
    name,
    destination,
    decision_maker: pickString(o, ["decision_maker", "decisionMaker", "host_name"]),
    response_hours: pickString(o, ["response_hours", "responseHours", "response_sla"]),
    payment_method: pickString(o, ["payment_method", "paymentMethod"]),
    commission_terms: pickString(o, ["commission_terms", "commissionTerms"]),
    public_url: pickString(o, ["public_url", "url", "slug"])
      ? `https://asavaristays.com/${pickString(o, ["public_url", "url", "slug"])}`
      : null,
    updated_at: pickString(o, ["updated_at", "updatedAt"]) ?? new Date().toISOString(),
  };
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  for (const key of ["data", "properties", "villas", "stays", "items", "results"]) {
    const v = o[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const nested = v as Record<string, unknown>;
      for (const nk of ["items", "results", "data", "properties"]) {
        if (Array.isArray(nested[nk])) return nested[nk] as unknown[];
      }
    }
  }
  return [];
}

export async function fetchPropertiesFromAsavari(): Promise<{
  ok: boolean;
  status_code: number;
  auth_configured: boolean;
  properties: AsavariPropertySnapshot[];
  error?: string;
}> {
  const auth_configured = Boolean(authHeader());
  if (!auth_configured) {
    return {
      ok: false,
      status_code: 401,
      auth_configured: false,
      properties: [],
      error: "ASAVARI_INTEGRATION_AUTH is not set",
    };
  }

  const paths = ["/api/properties", "/api/villas", "/api/stays"];
  let lastStatus = 0;
  let lastError = "No properties endpoint succeeded";

  for (const path of paths) {
    try {
      const res = await asavariFetch(path);
      lastStatus = res.status;
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        lastError =
          (body as { message?: string; error?: string } | null)?.message ||
          (body as { error?: string } | null)?.error ||
          `HTTP ${res.status} from ${path}`;
        continue;
      }
      const list = extractList(body)
        .map((item, i) => normalizeProperty(item, i))
        .filter((x): x is AsavariPropertySnapshot => Boolean(x));
      return {
        ok: true,
        status_code: res.status,
        auth_configured: true,
        properties: list,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: false,
    status_code: lastStatus,
    auth_configured: true,
    properties: [],
    error: lastError,
  };
}

export async function upsertPropertyCache(properties: AsavariPropertySnapshot[]) {
  for (const p of properties) {
    await pool.query(
      `INSERT INTO asavari_properties (
         property_id, property_version, name, destination, profile_complete,
         decision_maker, response_hours, payment_method, commission_terms,
         public_url, raw, last_synced_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW(),NOW())
       ON CONFLICT (property_id) DO UPDATE SET
         property_version = EXCLUDED.property_version,
         name = EXCLUDED.name,
         destination = EXCLUDED.destination,
         profile_complete = EXCLUDED.profile_complete,
         decision_maker = EXCLUDED.decision_maker,
         response_hours = EXCLUDED.response_hours,
         payment_method = EXCLUDED.payment_method,
         commission_terms = EXCLUDED.commission_terms,
         public_url = EXCLUDED.public_url,
         raw = EXCLUDED.raw,
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [
        p.property_id,
        p.property_version,
        p.name,
        p.destination,
        p.profile_complete,
        p.decision_maker ?? null,
        p.response_hours ?? null,
        p.payment_method ?? null,
        p.commission_terms ?? null,
        p.public_url ?? null,
        JSON.stringify(p),
      ]
    );
  }
  return properties.length;
}

export async function listCachedProperties() {
  const result = await pool.query(
    `SELECT property_id, property_version, name, destination, profile_complete,
            decision_maker, response_hours, payment_method, commission_terms,
            public_url, last_synced_at
     FROM asavari_properties
     ORDER BY destination NULLS LAST, name ASC
     LIMIT 200`
  );
  return result.rows;
}

export async function syncAsavariProperties() {
  if (!config.asavari.syncEnabled) {
    throw Object.assign(new Error("Asavari sync is disabled (ASAVARI_SYNC_ENABLED=false)"), {
      status: 503,
    });
  }
  const fetched = await fetchPropertiesFromAsavari();
  if (!fetched.ok) {
    throw Object.assign(new Error(fetched.error || "Asavari property fetch failed"), {
      status: fetched.status_code === 401 ? 401 : 502,
      detail: fetched,
    });
  }
  const count = await upsertPropertyCache(fetched.properties);
  log.info("asavari properties synced", { count });
  return { synced: count, properties: fetched.properties };
}

/** Kept for opportunity routing callers */
export async function fetchPropertySnapshot(
  propertyId: string
): Promise<AsavariPropertySnapshot | null> {
  const cached = await pool.query(
    `SELECT * FROM asavari_properties WHERE property_id = $1`,
    [propertyId]
  );
  if (cached.rowCount) {
    const row = cached.rows[0];
    return {
      property_id: row.property_id,
      property_version: row.property_version,
      profile_complete: row.profile_complete,
      name: row.name,
      destination: row.destination ?? "",
      decision_maker: row.decision_maker,
      response_hours: row.response_hours,
      payment_method: row.payment_method,
      commission_terms: row.commission_terms,
      public_url: row.public_url,
      updated_at: row.last_synced_at?.toISOString?.() ?? String(row.last_synced_at),
    };
  }

  if (!config.asavari.syncEnabled) {
    log.info("asavari sync disabled; no cached snapshot", { propertyId });
    return null;
  }

  const fetched = await fetchPropertiesFromAsavari();
  if (fetched.ok) {
    await upsertPropertyCache(fetched.properties);
    return fetched.properties.find((p) => p.property_id === propertyId) ?? null;
  }
  return null;
}

export async function asavariStatus() {
  const health = await checkAsavariHealth();
  const cached = await pool.query(
    `SELECT COUNT(*)::int AS count,
            MAX(last_synced_at) AS last_synced_at
     FROM asavari_properties`
  );
  return {
    ...asavariContract(),
    health,
    auth_configured: Boolean(authHeader()),
    cache: {
      property_count: cached.rows[0]?.count ?? 0,
      last_synced_at: cached.rows[0]?.last_synced_at ?? null,
    },
  };
}

export function asavariContract() {
  return {
    sync_enabled: config.asavari.syncEnabled,
    base_url: config.asavari.baseUrl,
    transport: "https_json_only",
    shared_volumes: false,
    endpoints: {
      health: "/api/health",
      properties: "/api/properties",
      villas: "/api/villas",
      stays: "/api/stays",
    },
    required_fields_for_routing: [
      "property_id",
      "property_version",
      "profile_complete",
      "decision_maker",
      "response_hours",
      "payment_method",
      "commission_terms",
    ],
    book_handoff: {
      from: "hotelradar-direct",
      to: "asavari",
      required: ["external_opportunity_id", "offer_version", "public_token"],
    },
  };
}
