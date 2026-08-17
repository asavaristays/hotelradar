"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AdminShell } from "../../../../components/admin/AdminShell";
import {
  adminAddHotelMedia,
  adminCreateHotel,
  adminUpdateHotel,
} from "../../../../lib/adminApi";

function guestPatchFromForm(fd: FormData) {
  const amenities = String(fd.get("amenities") || "")
    .split(/[|,;/]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const photoUrls = String(fd.get("photo_urls") || "")
    .split(/[\n|;]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  return {
    hotel_category: String(fd.get("hotel_category") || "") || null,
    amenities,
    sea_facing: fd.get("sea_facing") === "on",
    guest_blurb: String(fd.get("guest_blurb") || "") || null,
    photo_note: String(fd.get("photo_note") || "") || null,
    location_note: String(fd.get("location_note") || "") || null,
    extras: String(fd.get("extras") || "") || null,
    ota_reference_inr: fd.get("ota_reference_inr")
      ? Number(fd.get("ota_reference_inr"))
      : null,
    ota_as_of: String(fd.get("ota_as_of") || "") || null,
    direct_online_inr: fd.get("direct_online_inr")
      ? Number(fd.get("direct_online_inr"))
      : null,
    rooms_count: fd.get("rooms_count") ? Number(fd.get("rooms_count")) : null,
    tier: String(fd.get("tier") || "") || null,
    show_in_guest_catalog: fd.get("show_in_guest_catalog") === "on",
    contact_name: String(fd.get("contact_name") || "") || null,
    contact_role: String(fd.get("contact_role") || "") || null,
    night_desk_phone: String(fd.get("night_desk_phone") || "") || null,
    on_ota: fd.get("on_ota") === "on",
    photoUrls,
  };
}

export default function NewHotelPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const email = String(fd.get("notify_email") || "").trim();
      const accountLast4 = String(fd.get("account_last4") || "").trim();
      const ifscLast4 = String(fd.get("ifsc_last4") || "").trim();
      const accountHolder = String(fd.get("account_holder") || "").trim();
      const guest = guestPatchFromForm(fd);
      const created = await adminCreateHotel({
        display_name: String(fd.get("display_name") || ""),
        legal_name: String(fd.get("legal_name") || fd.get("display_name") || ""),
        destination: String(fd.get("destination") || "Goa"),
        location: String(fd.get("location") || ""),
        belt: String(fd.get("belt") || "morjim"),
        lat: fd.get("lat") ? Number(fd.get("lat")) : null,
        lng: fd.get("lng") ? Number(fd.get("lng")) : null,
        gstin: String(fd.get("gstin") || "") || null,
        pan: String(fd.get("pan") || "") || null,
        gst_rate_bps: Number(fd.get("gst_rate_bps") || 1800),
        gateway_borne_by: String(fd.get("gateway_borne_by") || "hotel"),
        tcs_bps: Number(fd.get("tcs_bps") || 0),
        commercial_mode: String(fd.get("commercial_mode") || "agent"),
        notify_whatsapp: String(fd.get("notify_whatsapp") || "") || null,
        notify_email: email || null,
        commission_pct_bps: Math.round(Number(fd.get("commission_pct") || 12) * 100),
        instant_quote_enabled: fd.get("instant_quote_enabled") === "on",
        upi_vpa: String(fd.get("upi_vpa") || "") || null,
        payment_note: String(fd.get("payment_note") || "") || null,
        notes: String(fd.get("notes") || "") || null,
        payout:
          accountHolder || accountLast4 || ifscLast4
            ? {
                account_holder: accountHolder || String(fd.get("legal_name") || fd.get("display_name")),
                account_last4: accountLast4 || undefined,
                ifsc_last4: ifscLast4 || undefined,
                provider: "manual_neft",
              }
            : null,
      });
      const { photoUrls, ...guestPatch } = guest;
      await adminUpdateHotel(String(created.id), guestPatch);
      for (let i = 0; i < photoUrls.length; i++) {
        await adminAddHotelMedia(String(created.id), {
          kind: "gallery",
          url: photoUrls[i],
          caption: `Photo ${i + 1}`,
          sort_order: i,
        });
      }
      router.push(`/admin/hotels/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="New hotel">
      {error ? <p className="admin-error">{error}</p> : null}
      <p className="meta" style={{ marginBottom: 14 }}>
        Prefer bulk?{" "}
        <a href="/templates/HotelRADAR_Hotel_Onboarding_Template.xlsx" download>
          Download Excel template
        </a>{" "}
        → fill →{" "}
        <a href="/admin/hotels/import">Import</a>. Same fields as this form map to the backend.
      </p>
      <form className="admin-form admin-form-wide" onSubmit={onSubmit}>
        <h2 className="admin-section-title">Property</h2>
        <label>
          Display name
          <input name="display_name" required placeholder="Casa Verde Boutique" />
        </label>
        <label>
          Legal name (must match GST certificate)
          <input name="legal_name" required placeholder="Casa Verde Hospitality LLP" />
        </label>
        <label>
          Destination
          <select name="destination">
            <option>Goa</option>
            <option>Rajasthan</option>
          </select>
        </label>
        <label>
          Location / area
          <input name="location" placeholder="Morjim, North Goa" />
        </label>
        <label>
          Belt (routing — required for go-live)
          <select name="belt" required defaultValue="morjim">
            <option value="morjim">morjim</option>
            <option value="anjuna">anjuna</option>
            <option value="arambol">arambol</option>
            <option value="candolim">candolim</option>
            <option value="vagator">vagator</option>
            <option value="calangute">calangute</option>
            <option value="ashwem">ashwem</option>
            <option value="baga">baga</option>
          </select>
        </label>
        <p className="meta">
          Do not use “other” — belt score and night-sheet bonus never apply there. Night desk contact
          must be the desk phone, not the owner’s mobile.
        </p>
        <label>
          Latitude
          <input name="lat" type="number" step="any" placeholder="15.6297" />
        </label>
        <label>
          Longitude
          <input name="lng" type="number" step="any" placeholder="73.7342" />
        </label>

        <h2 className="admin-section-title">Guest catalog (Get hotel offer)</h2>
        <p className="meta" style={{ marginTop: -6 }}>
          What travellers see: category, amenities, indicative prices, photos (URLs). No Asavari
          required.
        </p>
        <label>
          Hotel category
          <select name="hotel_category" defaultValue="boutique">
            <option value="villa">Villa</option>
            <option value="resort">Resort</option>
            <option value="boutique">Boutique</option>
            <option value="hotel">Hotel</option>
            <option value="homestay">Homestay</option>
            <option value="guesthouse">Guesthouse</option>
          </select>
        </label>
        <label>
          Tier
          <select name="tier" defaultValue="core">
            <option value="core">Core</option>
            <option value="premium">Premium</option>
            <option value="breadth">Breadth</option>
          </select>
        </label>
        <label>
          Rooms count
          <input name="rooms_count" type="number" min={1} placeholder="18" />
        </label>
        <label>
          Amenities (comma / pipe separated)
          <input
            name="amenities"
            placeholder="pool, wifi, breakfast, parking, ac"
          />
        </label>
        <label>
          <input name="sea_facing" type="checkbox" /> Sea facing / walk-to-beach
        </label>
        <label>
          <input name="on_ota" type="checkbox" defaultChecked /> Listed on OTA
        </label>
        <label>
          <input name="show_in_guest_catalog" type="checkbox" defaultChecked /> Show in guest
          catalog
        </label>
        <label>
          Guest blurb
          <textarea name="guest_blurb" rows={2} placeholder="Quieter North Goa belt…" />
        </label>
        <label>
          Photo note
          <input name="photo_note" placeholder="Garden rooms, dune path, small pool." />
        </label>
        <label>
          Location note
          <input name="location_note" placeholder="Morjim beach ~6 min walk" />
        </label>
        <label>
          Extras
          <input name="extras" placeholder="Kitchenette · Quiet after 11pm" />
        </label>
        <label>
          OTA reference INR / night
          <input name="ota_reference_inr" type="number" placeholder="8000" />
        </label>
        <label>
          OTA as of (YYYY-MM-DD)
          <input name="ota_as_of" type="date" />
        </label>
        <label>
          Direct / indicative INR / night
          <input name="direct_online_inr" type="number" placeholder="7200" />
        </label>
        <label>
          Photo URLs (one per line or | separated)
          <textarea
            name="photo_urls"
            rows={4}
            placeholder={"https://cdn.example.com/hotel/1.jpg\nhttps://cdn.example.com/hotel/2.jpg"}
          />
        </label>
        <label>
          Contact name
          <input name="contact_name" placeholder="Sunil Naik" />
        </label>
        <label>
          Contact role
          <input name="contact_role" placeholder="Owner" />
        </label>
        <label>
          Night desk phone
          <input name="night_desk_phone" placeholder="+91…" />
        </label>

        <h2 className="admin-section-title">GST &amp; tax</h2>
        <label>
          GSTIN
          <input name="gstin" placeholder="30AABCU9603R1ZM" maxLength={15} />
        </label>
        <label>
          PAN
          <input name="pan" placeholder="AABCU9603R" maxLength={10} />
        </label>
        <label>
          Room GST rate (never hardcode — per property band)
          <select name="gst_rate_bps" defaultValue="1800">
            <option value="500">5%</option>
            <option value="1200">12%</option>
            <option value="1800">18%</option>
          </select>
        </label>
        <label>
          Commission % (on base tariff, excl. GST)
          <input name="commission_pct" type="number" min={0} max={50} step={0.5} defaultValue={12} />
        </label>
        <label>
          Payment gateway fee borne by
          <select name="gateway_borne_by" defaultValue="hotel">
            <option value="hotel">Hotel</option>
            <option value="platform">Platform</option>
            <option value="split">Split</option>
          </select>
        </label>
        <label>
          Commercial mode
          <select name="commercial_mode" defaultValue="agent">
            <option value="agent">Agent (intermediary — default)</option>
            <option value="principal">Principal (gross = your turnover)</option>
          </select>
        </label>
        <label>
          TCS on base tariff
          <select name="tcs_bps" defaultValue="0">
            <option value="0">Off (0%)</option>
            <option value="10">0.1%</option>
            <option value="50">0.5%</option>
            <option value="100">1%</option>
          </select>
        </label>

        <h2 className="admin-section-title">Bank / payout</h2>
        <p className="meta" style={{ marginTop: -6, marginBottom: 8 }}>
          Stored as last-4 only. Full account numbers stay with the payout provider after KYC.
        </p>
        <label>
          Account holder (match legal name)
          <input name="account_holder" placeholder="Casa Verde Hospitality LLP" />
        </label>
        <label>
          Account number (last 4)
          <input name="account_last4" maxLength={4} placeholder="4821" inputMode="numeric" />
        </label>
        <label>
          IFSC (last 4)
          <input name="ifsc_last4" maxLength={4} placeholder="0001" />
        </label>

        <h2 className="admin-section-title">Ops contact</h2>
        <label>
          UPI VPA (guest pays hotel)
          <input name="upi_vpa" placeholder="hotel@okaxis" />
        </label>
        <label>
          Payment note
          <input name="payment_note" placeholder="Include guest name in UPI remark" />
        </label>
        <label>
          Notify WhatsApp
          <input name="notify_whatsapp" placeholder="+91…" />
        </label>
        <label>
          Notify email
          <input name="notify_email" type="email" />
        </label>
        <label>
          <input name="instant_quote_enabled" type="checkbox" /> Instant quote from rate sheet
        </label>
        <label>
          Notes
          <textarea name="notes" rows={3} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create hotel"}
        </button>
      </form>
    </AdminShell>
  );
}
