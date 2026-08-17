/**
 * Bulk hotel onboarding from Excel/CSV rows (guest catalog + prospect fields).
 * Column aliases must stay aligned with apps/web/lib/hotelOnboardColumns.ts
 */

import { DESTINATIONS, type Destination } from "@hotelradar/direct-shared";
import { pool } from "../db/pool.js";
import { createHotel, updateHotel } from "./adminOps.js";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function strOrNull(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function numOrNull(v: unknown) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown) {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
}

function boolish(v: unknown) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  return s === "1" || s === "y" || s === "yes" || s === "true" || s === "on";
}

function normalizeAmenities(raw?: string[] | string | null) {
  if (!raw) return [] as string[];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[|,;/]+/);
  return [
    ...new Set(
      parts
        .map((a) => String(a).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40)
    ),
  ];
}

function parsePhotoUrls(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String);
  return String(raw || "")
    .split(/[\n|;]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

async function replacePhotoUrls(hotelId: string, urls: string[]) {
  const list = urls
    .map((u) => String(u || "").trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 20);
  if (!list.length) return;
  await pool.query(
    `UPDATE hotel_media SET archived_at = NOW()
     WHERE hotel_id = $1 AND archived_at IS NULL AND kind = 'gallery'`,
    [hotelId]
  );
  for (let i = 0; i < list.length; i++) {
    await pool.query(
      `INSERT INTO hotel_media (hotel_id, kind, url, sort_order, caption)
       VALUES ($1,'gallery',$2,$3,$4)`,
      [hotelId, list[i], i, `Photo ${i + 1}`]
    );
  }
}

/** Normalize Excel/CSV header aliases → canonical snake keys. */
const HEADER_ALIASES: Record<string, string> = {
  "display name": "display_name",
  name: "display_name",
  display_name: "display_name",
  "legal name": "legal_name",
  legal_name: "legal_name",
  destination: "destination",
  belt: "belt",
  "area / road": "location",
  location: "location",
  category: "hotel_category",
  hotel_category: "hotel_category",
  tier: "tier",
  rooms: "rooms_count",
  rooms_count: "rooms_count",
  "sea facing": "sea_facing",
  sea_facing: "sea_facing",
  amenities: "amenities",
  blurb: "guest_blurb",
  guest_blurb: "guest_blurb",
  "photo note": "photo_note",
  photo_note: "photo_note",
  "location note": "location_note",
  location_note: "location_note",
  extras: "extras",
  "ota reference inr": "ota_reference_inr",
  ota_reference_inr: "ota_reference_inr",
  "est. adr high": "ota_reference_inr",
  "ota as of": "ota_as_of",
  ota_as_of: "ota_as_of",
  "direct online inr": "direct_online_inr",
  direct_online_inr: "direct_online_inr",
  "est. adr low": "direct_online_inr",
  "photo urls": "photo_urls",
  photo_urls: "photo_urls",
  photos: "photo_urls",
  "show in guest catalog": "show_in_guest_catalog",
  show_in_guest_catalog: "show_in_guest_catalog",
  latitude: "lat",
  lat: "lat",
  longitude: "lng",
  lng: "lng",
  "contact name": "contact_name",
  contact_name: "contact_name",
  role: "contact_role",
  contact_role: "contact_role",
  phone: "notify_whatsapp",
  notify_whatsapp: "notify_whatsapp",
  "night desk phone": "night_desk_phone",
  night_desk_phone: "night_desk_phone",
  "notify email": "notify_email",
  notify_email: "notify_email",
  "upi vpa": "upi_vpa",
  upi_vpa: "upi_vpa",
  "payment note": "payment_note",
  payment_note: "payment_note",
  "on ota?": "on_ota",
  "on ota": "on_ota",
  on_ota: "on_ota",
  gstin: "gstin",
  pan: "pan",
  "commission %": "commission_pct",
  commission_pct: "commission_pct",
  commission_pct_bps: "commission_pct_bps",
  notes: "notes",
};

function canonicalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const canon = HEADER_ALIASES[k.trim().toLowerCase()];
    if (!canon) continue;
    if (v == null || String(v).trim() === "") continue;
    out[canon] = v;
  }
  return out;
}

function pick(raw: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    if (raw[k] != null && String(raw[k]).trim() !== "") return raw[k];
  }
  return undefined;
}

export async function importHotelsBulk(
  rows: Array<Record<string, unknown>>,
  opts?: { merge?: boolean }
) {
  const merge = opts?.merge !== false;
  const results: Array<{
    display_name: string;
    action: "created" | "updated" | "skipped";
    id?: string;
    error?: string;
  }> = [];

  for (const incoming of rows.slice(0, 200)) {
    const raw = canonicalizeRow(incoming);
    // also keep original keys for safety
    const merged = { ...incoming, ...raw };

    const displayName = String(pick(merged, "display_name", "Display name", "name") || "").trim();
    if (!displayName || displayName.toLowerCase() === "display name") {
      results.push({
        display_name: displayName || "(blank)",
        action: "skipped",
        error: "missing name",
      });
      continue;
    }

    try {
      const slug = slugify(displayName);
      const existing = await pool.query(`SELECT id FROM hotels WHERE slug = $1`, [slug]);
      const photoUrls = parsePhotoUrls(pick(merged, "photo_urls", "Photo URLs", "photos"));
      const destRaw = String(pick(merged, "destination", "Destination") || "Goa");
      const destination = (DESTINATIONS as readonly string[]).includes(destRaw)
        ? (destRaw as Destination)
        : ("Goa" as Destination);

      const guestPatch = {
        hotel_category: strOrNull(pick(merged, "hotel_category", "Category", "category")),
        amenities: normalizeAmenities(
          pick(merged, "amenities", "Amenities") as string | string[] | null
        ),
        sea_facing: boolish(pick(merged, "sea_facing", "Sea facing")),
        guest_blurb: strOrNull(pick(merged, "guest_blurb", "Blurb", "blurb")),
        photo_note: strOrNull(pick(merged, "photo_note", "Photo note")),
        location_note: strOrNull(pick(merged, "location_note", "Location note")),
        extras: strOrNull(pick(merged, "extras", "Extras")),
        ota_reference_inr: intOrNull(
          pick(merged, "ota_reference_inr", "OTA reference INR", "Est. ADR high")
        ),
        ota_as_of: strOrNull(pick(merged, "ota_as_of", "OTA as of")),
        direct_online_inr: intOrNull(
          pick(merged, "direct_online_inr", "Direct online INR", "Est. ADR low")
        ),
        rooms_count: intOrNull(pick(merged, "rooms_count", "Rooms")),
        tier: strOrNull(pick(merged, "tier", "Tier")),
        show_in_guest_catalog: boolish(
          pick(merged, "show_in_guest_catalog", "Show in guest catalog")
        ),
        contact_name: strOrNull(pick(merged, "contact_name", "Contact name")),
        contact_role: strOrNull(pick(merged, "contact_role", "Role")),
        night_desk_phone: strOrNull(pick(merged, "night_desk_phone", "Night desk phone")),
        on_ota: boolish(pick(merged, "on_ota", "On OTA?")),
        upi_vpa: strOrNull(pick(merged, "upi_vpa", "UPI VPA")),
        payment_note: strOrNull(pick(merged, "payment_note", "Payment note")),
        notify_email: strOrNull(pick(merged, "notify_email", "Notify email")),
      };

      const createPayload = {
        display_name: displayName,
        destination,
        location: String(pick(merged, "location", "Area / road") || "").trim(),
        belt: String(pick(merged, "belt", "Belt") || "other")
          .trim()
          .toLowerCase(),
        lat: numOrNull(pick(merged, "lat", "Latitude")),
        lng: numOrNull(pick(merged, "lng", "Longitude")),
        legal_name: String(pick(merged, "legal_name", "Legal name") || displayName).trim(),
        notify_whatsapp: strOrNull(pick(merged, "notify_whatsapp", "Phone", "phone")),
        notify_email: guestPatch.notify_email,
        notes: strOrNull(pick(merged, "notes", "Notes")),
        gstin: strOrNull(pick(merged, "gstin", "GSTIN")),
        pan: strOrNull(pick(merged, "pan", "PAN")),
        upi_vpa: guestPatch.upi_vpa,
        payment_note: guestPatch.payment_note,
        commission_pct_bps:
          pick(merged, "commission_pct") != null
            ? Math.round(Number(pick(merged, "commission_pct")) * 100)
            : pick(merged, "commission_pct_bps") != null
              ? Number(pick(merged, "commission_pct_bps"))
              : undefined,
      };

      if (existing.rowCount && merge) {
        const id = String(existing.rows[0].id);
        await updateHotel(id, { ...createPayload, ...guestPatch });
        if (photoUrls.length) await replacePhotoUrls(id, photoUrls);
        results.push({ display_name: displayName, action: "updated", id });
      } else if (existing.rowCount && !merge) {
        results.push({
          display_name: displayName,
          action: "skipped",
          id: String(existing.rows[0].id),
          error: "exists",
        });
      } else {
        const created = await createHotel(createPayload);
        const id = String(created.id);
        await updateHotel(id, guestPatch);
        if (photoUrls.length) await replacePhotoUrls(id, photoUrls);
        const night = guestPatch.night_desk_phone;
        if (night) {
          const existsContact = await pool.query(
            `SELECT 1 FROM hotel_contacts
             WHERE hotel_id = $1 AND role = 'night_desk' AND archived_at IS NULL
             LIMIT 1`,
            [id]
          );
          if (!existsContact.rowCount) {
            await pool.query(
              `INSERT INTO hotel_contacts (hotel_id, role, name, phone_e164, is_primary)
               VALUES ($1,'night_desk',$2,$3,TRUE)`,
              [id, guestPatch.contact_name || "Night desk", night]
            );
          }
        }
        results.push({ display_name: displayName, action: "created", id });
      }
    } catch (err) {
      results.push({
        display_name: displayName,
        action: "skipped",
        error: err instanceof Error ? err.message : "import failed",
      });
    }
  }

  return {
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    results,
  };
}
