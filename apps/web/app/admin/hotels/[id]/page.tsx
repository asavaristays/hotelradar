"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AdminShell } from "../../../../components/admin/AdminShell";
import {
  adminAddHotelMedia,
  adminCreateContact,
  adminCreatePayoutAccount,
  adminCreateRateSheet,
  adminGetHotel,
  adminGetTravel,
  adminHotelGoLiveChecklist,
  adminHotelLive,
  adminSetStopSell,
  adminSupersedeRateSheet,
  adminUpdateHotel,
  formatInrFromPaise,
} from "../../../../lib/adminApi";

export default function AdminHotelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [hotel, setHotel] = useState<Record<string, unknown> | null>(null);
  const [checklist, setChecklist] = useState<{
    ok: boolean;
    blockers: string[];
    checklist: Record<string, boolean>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const h = await adminGetHotel(id);
    setHotel(h);
    try {
      setChecklist(await adminHotelGoLiveChecklist(id));
    } catch {
      setChecklist(null);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const email = String(fd.get("notify_email") || "").trim();
      await adminUpdateHotel(id, {
        display_name: String(fd.get("display_name") || ""),
        legal_name: String(fd.get("legal_name") || fd.get("display_name") || ""),
        destination: String(fd.get("destination") || "Goa"),
        location: String(fd.get("location") || ""),
        belt: String(fd.get("belt") || "other"),
        lat: fd.get("lat") ? Number(fd.get("lat")) : null,
        lng: fd.get("lng") ? Number(fd.get("lng")) : null,
        notify_whatsapp: String(fd.get("notify_whatsapp") || "") || null,
        notify_email: email || null,
        commission_pct_bps: Math.round(Number(fd.get("commission_pct") || 12) * 100),
        gst_rate_bps: Number(fd.get("gst_rate_bps") || 1800),
        gstin: String(fd.get("gstin") || "") || null,
        pan: String(fd.get("pan") || "") || null,
        gateway_borne_by: String(fd.get("gateway_borne_by") || "hotel"),
        tcs_bps: Number(fd.get("tcs_bps") || 0),
        commercial_mode: String(fd.get("commercial_mode") || "agent"),
        instant_quote_enabled: fd.get("instant_quote_enabled") === "on",
        stop_sell: fd.get("stop_sell") === "on",
        upi_vpa: String(fd.get("upi_vpa") || "") || null,
        payment_note: String(fd.get("payment_note") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      await load();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!hotel) {
    return (
      <AdminShell title="Hotel">
        <p className="meta">Loading…</p>
      </AdminShell>
    );
  }

  const contacts = (hotel.contacts as Array<Record<string, unknown>>) || [];
  const sheets = (hotel.rate_sheets as Array<Record<string, unknown>>) || [];
  const payouts = (hotel.payout_accounts as Array<Record<string, unknown>>) || [];
  const media = (hotel.media as Array<Record<string, unknown>>) || [];

  return (
    <AdminShell
      title={String(hotel.display_name)}
      actions={
        <span className="admin-pill" style={{ marginTop: 0 }}>
          {String(hotel.status)}
        </span>
      }
    >
      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="meta" style={{ color: "var(--admin-teal)" }}>Saved.</p> : null}

      <div className="admin-filters" style={{ marginBottom: 16 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void adminHotelLive(id, true)
              .then(load)
              .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
          }
        >
          Go live
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void adminHotelLive(id, false)
              .then(load)
              .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
          }
        >
          Pause
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void adminSetStopSell(id, !Boolean(hotel.stop_sell))
              .then(load)
              .catch((e) => setError(e instanceof Error ? e.message : "Stop-sell failed"))
          }
        >
          {hotel.stop_sell ? "Clear stop-sell" : "Stop sell now"}
        </button>
      </div>

      {checklist ? (
        <div className="admin-panel" style={{ marginBottom: 14 }}>
          <h2>Go-live checklist</h2>
          <p className="meta">
            {checklist.ok
              ? "Ready to go live."
              : `Blocked: ${checklist.blockers.join("; ")}`}
          </p>
          <ul className="admin-events">
            {Object.entries(checklist.checklist).map(([k, v]) => (
              <li key={k}>
                {v ? "✓" : "✗"} {k.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="admin-stats" style={{ marginBottom: 18 }}>
        <div className="admin-stat">
          <strong style={{ fontSize: 14 }}>{String(hotel.gstin || "—")}</strong>
          <span>GSTIN</span>
        </div>
        <div className="admin-stat">
          <strong style={{ fontSize: 14 }}>{Number(hotel.gst_rate_bps ?? 1800) / 100}%</strong>
          <span>Room GST</span>
        </div>
        <div className="admin-stat">
          <strong style={{ fontSize: 14 }}>{Number(hotel.commission_pct_bps ?? 0) / 100}%</strong>
          <span>Commission</span>
        </div>
        <div className="admin-stat">
          <strong style={{ fontSize: 14 }}>
            {payouts.length
              ? `····${String(payouts[0].account_last4 || "????")}`
              : "None"}
          </strong>
          <span>Bank account</span>
        </div>
      </div>

      <form className="admin-form admin-form-wide" onSubmit={onSave}>
        <h2 className="admin-section-title">Property</h2>
        <label>
          Display name
          <input name="display_name" defaultValue={String(hotel.display_name)} required />
        </label>
        <label>
          Legal name (GST invoices)
          <input name="legal_name" defaultValue={String(hotel.legal_name ?? hotel.display_name)} required />
        </label>
        <label>
          Destination
          <select name="destination" defaultValue={String(hotel.destination)}>
            <option>Goa</option>
            <option>Rajasthan</option>
          </select>
        </label>
        <label>
          Location / area
          <input name="location" defaultValue={String(hotel.location ?? "")} />
        </label>
        <label>
          Belt (routing — required for go-live)
          <select name="belt" defaultValue={String(hotel.belt ?? "morjim")} required>
            {[
              "morjim",
              "anjuna",
              "arambol",
              "candolim",
              "vagator",
              "calangute",
              "ashwem",
              "baga",
            ].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label>
          Latitude
          <input name="lat" type="number" step="any" defaultValue={hotel.lat != null ? String(hotel.lat) : ""} placeholder="15.6297" />
        </label>
        <label>
          Longitude
          <input name="lng" type="number" step="any" defaultValue={hotel.lng != null ? String(hotel.lng) : ""} placeholder="73.7342" />
        </label>

        <h2 className="admin-section-title">GST &amp; tax</h2>
        <label>
          GSTIN
          <input name="gstin" defaultValue={String(hotel.gstin ?? "")} placeholder="30AABCU9603R1ZM" maxLength={15} />
        </label>
        <label>
          PAN
          <input name="pan" defaultValue={String(hotel.pan ?? "")} placeholder="AABCU9603R" maxLength={10} />
        </label>
        <label>
          Room GST rate
          <select name="gst_rate_bps" defaultValue={String(hotel.gst_rate_bps ?? 1800)}>
            <option value="500">5%</option>
            <option value="1200">12%</option>
            <option value="1800">18%</option>
          </select>
        </label>
        <label>
          Commission % (on base tariff, excl. GST)
          <input
            name="commission_pct"
            type="number"
            min={0}
            max={50}
            step={0.5}
            defaultValue={Number(hotel.commission_pct_bps ?? 1200) / 100}
          />
        </label>
        <label>
          Gateway fee borne by
          <select name="gateway_borne_by" defaultValue={String(hotel.gateway_borne_by ?? "hotel")}>
            <option value="hotel">Hotel</option>
            <option value="platform">Platform</option>
            <option value="split">Split</option>
          </select>
        </label>
        <label>
          Commercial mode
          <select name="commercial_mode" defaultValue={String(hotel.commercial_mode ?? "agent")}>
            <option value="agent">Agent (intermediary — default)</option>
            <option value="principal">Principal (gross = your turnover)</option>
          </select>
        </label>
        <label>
          TCS on base tariff
          <select name="tcs_bps" defaultValue={String(hotel.tcs_bps ?? 0)}>
            <option value="0">Off (0%)</option>
            <option value="10">0.1%</option>
            <option value="50">0.5%</option>
            <option value="100">1%</option>
          </select>
        </label>
        <p className="meta">
          Confirm agent vs principal and TCS with counsel/CA before flipping live hotels. Defaults stay
          agent + TCS off.
        </p>

        <h2 className="admin-section-title">Ops</h2>
        <label>
          UPI VPA (guest pays hotel)
          <input
            name="upi_vpa"
            defaultValue={String(hotel.upi_vpa ?? "")}
            placeholder="hotel@okaxis"
          />
        </label>
        <label>
          Payment note (shown to guest)
          <input
            name="payment_note"
            defaultValue={String(hotel.payment_note ?? "")}
            placeholder="Include guest name in UPI remark"
          />
        </label>
        <label>
          Notify WhatsApp
          <input name="notify_whatsapp" defaultValue={String(hotel.notify_whatsapp ?? "")} />
        </label>
        <label>
          Notify email
          <input name="notify_email" type="email" defaultValue={String(hotel.notify_email ?? "")} />
        </label>
        <label>
          <input
            name="instant_quote_enabled"
            type="checkbox"
            defaultChecked={Boolean(hotel.instant_quote_enabled)}
          />{" "}
          Instant quote (rate sheet)
        </label>
        <label>
          <input name="stop_sell" type="checkbox" defaultChecked={Boolean(hotel.stop_sell)} /> Stop
          sell
        </label>
        <label>
          Notes
          <textarea name="notes" rows={3} defaultValue={String(hotel.notes ?? "")} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save GST & property"}
        </button>
      </form>

      <div className="admin-panel" style={{ marginTop: 22 }}>
        <h2 className="admin-section-title" style={{ marginTop: 0 }}>
          Bank / payout accounts
        </h2>
        <ul className="admin-events">
          {payouts.map((p) => (
            <li key={String(p.id)}>
              {String(p.account_holder)} · ····{String(p.account_last4 || "????")} · IFSC ····
              {String(p.ifsc_last4 || "????")} · {String(p.provider)} · {String(p.kyc_status)}
            </li>
          ))}
          {!payouts.length ? <li>No bank account on file — add below.</li> : null}
        </ul>
        <form
          className="admin-form admin-form-wide"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void adminCreatePayoutAccount(id, {
              account_holder: String(fd.get("account_holder")),
              ifsc_last4: String(fd.get("ifsc_last4") || ""),
              account_last4: String(fd.get("account_last4") || ""),
              activate: true,
              provider: "manual_neft",
            })
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : "Account failed"));
            e.currentTarget.reset();
          }}
        >
          <label>
            Account holder
            <input
              name="account_holder"
              required
              defaultValue={String(hotel.legal_name ?? hotel.display_name)}
            />
          </label>
          <label>
            Account number (last 4)
            <input name="account_last4" maxLength={4} required placeholder="4821" />
          </label>
          <label>
            IFSC (last 4)
            <input name="ifsc_last4" maxLength={4} placeholder="0001" />
          </label>
          <button type="submit">Save bank details</button>
        </form>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Contacts</h2>
        <ul className="admin-events">
          {contacts.map((c) => (
            <li key={String(c.id)}>
              {String(c.role)} · {String(c.name)} · {String(c.phone_e164)}
              {c.is_primary ? " · primary" : ""}
            </li>
          ))}
          {!contacts.length ? <li>No contacts yet.</li> : null}
        </ul>
        <form
          className="admin-filters wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void adminCreateContact(id, {
              role: String(fd.get("role")),
              name: String(fd.get("name")),
              phone_e164: String(fd.get("phone_e164")),
              is_primary: true,
            })
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : "Contact failed"));
            e.currentTarget.reset();
          }}
        >
          <select name="role" defaultValue="front_desk">
            <option value="owner">owner</option>
            <option value="manager">manager</option>
            <option value="front_desk">front_desk</option>
            <option value="night_desk">night_desk</option>
            <option value="accounts">accounts</option>
          </select>
          <input name="name" placeholder="Name" required />
          <input name="phone_e164" placeholder="+91…" required />
          <button type="submit">Add contact</button>
        </form>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Rate sheets</h2>
        <p className="meta">
          Activating a sheet supersedes the previous active version. Instant quoting needs an active,
          unexpired sheet.
        </p>
        <ul className="admin-events">
          {sheets.map((s) => (
            <li key={String(s.id)}>
              v{String(s.version)} · {String(s.status)} · {String(s.effective_from).slice(0, 10)}→
              {String(s.effective_to).slice(0, 10)} · expires {String(s.expires_at).slice(0, 10)} ·{" "}
              {Array.isArray(s.rows) ? s.rows.length : 0} rows
              {String(s.status) === "active" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() =>
                      void adminSupersedeRateSheet(id, String(s.id))
                        .then(load)
                        .catch((err) =>
                          setError(err instanceof Error ? err.message : "Supersede failed")
                        )
                    }
                  >
                    Supersede
                  </button>
                </>
              ) : null}
            </li>
          ))}
          {!sheets.length ? <li>No rate sheets.</li> : null}
        </ul>
        <form
          className="admin-form admin-form-wide"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const from = String(fd.get("from"));
            const to = String(fd.get("to"));
            const expires = String(fd.get("expires") || to);
            const room = String(fd.get("room_type") || "Deluxe");
            const tariff = Math.round(Number(fd.get("tariff_inr")) * 100);
            const seasons = ["monsoon", "shoulder", "peak", "xmas_ny"] as const;
            const rows = seasons
              .map((season) => {
                const raw = fd.get(`tariff_${season}`);
                const n = raw ? Math.round(Number(raw) * 100) : tariff;
                if (!n || n <= 0) return null;
                return {
                  room_type: room,
                  season,
                  floor_tariff_paise: n,
                  inclusions: ["Breakfast"],
                };
              })
              .filter(Boolean) as Array<Record<string, unknown>>;
            if (!rows.length) {
              setError("Add at least one season tariff");
              return;
            }
            void adminCreateRateSheet(id, {
              effective_from: from,
              effective_to: to,
              expires_at: new Date(expires + "T23:59:59Z").toISOString(),
              activate: true,
              rows,
            })
              .then(() => {
                e.currentTarget.reset();
                return load();
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Sheet failed"));
          }}
        >
          <label>
            Room type
            <input name="room_type" defaultValue="Deluxe" required />
          </label>
          <div className="admin-filters wrap">
            <label>
              Effective from
              <input name="from" type="date" required />
            </label>
            <label>
              Effective to
              <input name="to" type="date" required />
            </label>
            <label>
              Expires (explicit)
              <input name="expires" type="date" required />
            </label>
          </div>
          <p className="meta">Season floors (₹/night excl GST). Leave blank to use default tariff.</p>
          <input name="tariff_inr" type="number" placeholder="Default ₹/night" required />
          <div className="admin-filters wrap">
            <input name="tariff_monsoon" type="number" placeholder="Monsoon ₹" />
            <input name="tariff_shoulder" type="number" placeholder="Shoulder ₹" />
            <input name="tariff_peak" type="number" placeholder="Peak ₹" />
            <input name="tariff_xmas_ny" type="number" placeholder="Xmas/NY ₹" />
          </div>
          <button type="submit">Activate new sheet (supersedes prior)</button>
        </form>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Media (hotel-supplied)</h2>
        <p className="meta">Assistant may only describe what is listed here — never invent photos.</p>
        <ul className="admin-events">
          {media.map((m) => (
            <li key={String(m.id)}>
              {String(m.kind)}
              {m.room_type ? ` · ${String(m.room_type)}` : ""} ·{" "}
              <a href={String(m.url)} target="_blank" rel="noreferrer">
                open
              </a>
              {m.caption ? ` — ${String(m.caption)}` : ""}
            </li>
          ))}
          {!media.length ? <li>No media yet.</li> : null}
        </ul>
        <form
          className="admin-filters wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void adminAddHotelMedia(id, {
              kind: String(fd.get("kind")),
              url: String(fd.get("url")),
              room_type: String(fd.get("room_type") || "") || undefined,
              caption: String(fd.get("caption") || "") || undefined,
            })
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : "Media failed"));
            e.currentTarget.reset();
          }}
        >
          <select name="kind" defaultValue="room">
            {["room", "bathroom", "pool", "exterior", "breakfast", "beach_path", "view"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input name="url" type="url" placeholder="https://…" required style={{ minWidth: 220 }} />
          <input name="room_type" placeholder="Room type (optional)" />
          <input name="caption" placeholder="Caption" />
          <button type="submit">Add media</button>
        </form>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>Travel cache</h2>
        <p className="meta">
          Haversine estimate until a Maps provider is configured. Set hotel lat/lng first.
        </p>
        <form
          className="admin-filters wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void adminGetTravel(id, Number(fd.get("from_lat")), Number(fd.get("from_lng")))
              .then((t) => {
                setError(null);
                window.alert(
                  `${String(t.description)} · taxi ${formatInrFromPaise(t.taxi_estimate_paise as number)} · ${String(t.source)}`
                );
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Travel failed"));
          }}
        >
          <input name="from_lat" type="number" step="any" placeholder="Guest lat" defaultValue="15.55" required />
          <input name="from_lng" type="number" step="any" placeholder="Guest lng" defaultValue="73.75" required />
          <button type="submit">Estimate travel</button>
        </form>
      </div>
    </AdminShell>
  );
}
