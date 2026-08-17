"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRequest } from "../lib/api";
import { defaultDirectDates } from "../lib/bookingWindow";

type Destination = "Goa" | "Rajasthan";

const NORTH_GOA_AREAS = [
  "Calangute / Baga",
  "Anjuna / Vagator",
  "Candolim / Sinquerim",
  "Morjim / Ashwem",
  "Arambol",
  "Other North Goa",
];

export function RequestForm() {
  const router = useRouter();
  const defaults = defaultDirectDates(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const destination: Destination = "Goa";
  const areas = NORTH_GOA_AREAS;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const budgetInr = String(fd.get("budget_inr") || "").trim();
    try {
      const data = await createRequest({
        name: String(fd.get("name") || "").trim(),
        mobile: String(fd.get("mobile") || "").trim(),
        email: String(fd.get("email") || "").trim() || null,
        consent: fd.get("consent") === "on",
        consent_version: "2026-08-08",
        destination,
        requested_area: String(fd.get("requested_area") || ""),
        requested_property: String(fd.get("requested_property") || "").trim() || null,
        check_in: String(fd.get("check_in") || ""),
        check_out: String(fd.get("check_out") || ""),
        rooms: Number(fd.get("rooms") || 1),
        adults: Number(fd.get("adults") || 2),
        children: Number(fd.get("children") || 0),
        budget_paise: budgetInr ? Math.round(Number(budgetInr) * 100) : null,
        special_request: String(fd.get("special_request") || "").trim() || null,
        referral_code: String(fd.get("referral_code") || "").trim() || null,
      });
      if (data.otp?.dev_code) {
        setDevCode(data.otp.dev_code);
        sessionStorage.setItem(`otp_dev_${data.public_token}`, data.otp.dev_code);
      }
      router.push(`/request/${data.public_token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Request a private offer</h2>
      {error ? <p className="error">{error}</p> : null}
      {devCode ? (
        <p className="ok">Dev OTP captured — continuing to verification…</p>
      ) : null}

      <label htmlFor="name">Full name</label>
      <input id="name" name="name" required placeholder="Traveller name" />

      <div className="row-2">
        <div>
          <label htmlFor="mobile">Mobile (WhatsApp)</label>
          <input
            id="mobile"
            name="mobile"
            required
            inputMode="tel"
            placeholder="+91XXXXXXXXXX"
          />
        </div>
        <div>
          <label htmlFor="email">Email (optional)</label>
          <input id="email" name="email" type="email" placeholder="you@email.com" />
        </div>
      </div>

      <label htmlFor="destination">Market</label>
      <select id="destination" name="destination" required value={destination} disabled>
        <option value="Goa">North Goa</option>
      </select>

      <label htmlFor="requested_area">Preferred area</label>
      <select
        id="requested_area"
        name="requested_area"
        required
        defaultValue={areas[0]}
      >
        {areas.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <label htmlFor="requested_property">Hotel preference (optional)</label>
      <input
        id="requested_property"
        name="requested_property"
        placeholder="e.g. Asavari Stays or similar"
      />

      <div className="row-2">
        <div>
          <label htmlFor="check_in">Check-in</label>
          <input
            id="check_in"
            name="check_in"
            type="date"
            required
            min={defaults.min}
            max={defaults.max}
            defaultValue={defaults.check_in}
          />
        </div>
        <div>
          <label htmlFor="check_out">Check-out</label>
          <input
            id="check_out"
            name="check_out"
            type="date"
            required
            min={defaults.check_in}
            defaultValue={defaults.check_out}
          />
        </div>
      </div>
      <p className="muted">Direct window: same-day to +48 hours.</p>

      <div className="row-2">
        <div>
          <label htmlFor="rooms">Rooms</label>
          <input id="rooms" name="rooms" type="number" min={1} defaultValue={1} />
        </div>
        <div>
          <label htmlFor="adults">Adults</label>
          <input id="adults" name="adults" type="number" min={1} defaultValue={2} />
        </div>
      </div>

      <div className="row-2">
        <div>
          <label htmlFor="children">Children</label>
          <input id="children" name="children" type="number" min={0} defaultValue={0} />
        </div>
        <div>
          <label htmlFor="budget_inr">Budget / night (₹, optional)</label>
          <input id="budget_inr" name="budget_inr" type="number" min={0} placeholder="8000" />
        </div>
      </div>

      <label htmlFor="special_request">Notes (optional)</label>
      <textarea id="special_request" name="special_request" placeholder="Pool, early check-in…" />

      <label htmlFor="referral_code">Referral code (optional)</label>
      <input id="referral_code" name="referral_code" placeholder="PARTNER-CODE" />

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
        <input
          type="checkbox"
          name="consent"
          required
          style={{ width: 18, minHeight: 18, marginTop: 2 }}
        />
        <span className="muted" style={{ margin: 0 }}>
          I agree to HotelRADAR Direct contacting me about this stay request. Payment, if I accept an
          offer, is to the hotel — not through an OTA.
        </span>
      </label>

      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Continue to mobile verify"}
      </button>
      <p className="muted" style={{ marginTop: 12 }}>
        Confirm by hotel and pay hotel directly.
      </p>
    </form>
  );
}
