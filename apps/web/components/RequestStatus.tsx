"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  attachDemoOffer,
  cancelRequest,
  getByToken,
  sendOtp,
  verifyOtp,
} from "../lib/api";

type Opp = Record<string, unknown>;
type Ev = Record<string, unknown>;

export function RequestStatus({ token }: { token: string }) {
  const [opp, setOpp] = useState<Opp | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const data = await getByToken(token);
    setOpp(data.opportunity);
    setEvents(data.events);
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(`otp_dev_${token}`);
    if (stored) setDevHint(stored);
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load request")
    );
  }, [token]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await verifyOtp(token, code.trim());
      sessionStorage.removeItem(`otp_dev_${token}`);
      setMsg("Mobile verified. Your request is with the desk.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    try {
      const data = await sendOtp(token);
      if (data.dev_code) {
        setDevHint(data.dev_code);
        sessionStorage.setItem(`otp_dev_${token}`, data.dev_code);
      }
      setMsg(`Code sent to ${data.mobile_masked}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDemoOffer() {
    setBusy(true);
    setError(null);
    try {
      await attachDemoOffer(token);
      setMsg("Demo offer attached.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo offer failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!confirm("Cancel this request?")) return;
    setBusy(true);
    try {
      await cancelRequest(token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  if (!opp && !error) {
    return <p className="muted">Loading request…</p>;
  }

  if (!opp) {
    return <p className="error">{error}</p>;
  }

  const verified = Boolean(opp.otp_verified);
  const status = String(opp.status);
  const showOfferLink = ["offer_sent", "offer_accepted", "hotel_confirmed"].includes(status);

  return (
    <div className="stack">
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="badge">{status.replaceAll("_", " ")}</span>
            <h2 style={{ margin: "12px 0 4px", fontSize: 22 }}>
              {String(opp.external_opportunity_id)}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {opp.destination ? `${String(opp.destination)} · ` : ""}
              {String(opp.requested_area)} · {String(opp.check_in).slice(0, 10)} →{" "}
              {String(opp.check_out).slice(0, 10)} · {String(opp.rooms)} room(s)
            </p>
          </div>
          <div className="muted" style={{ textAlign: "right" }}>
            <div>{String(opp.traveller_name ?? "")}</div>
            <div>{String(opp.mobile_masked ?? "")}</div>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p className="ok">{msg}</p> : null}
      </section>

      {!verified && (status === "verification_pending" || status === "verifying") ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Verify mobile</h3>
          <p className="muted">
            Enter the 6-digit code sent to your WhatsApp/SMS. In this test environment the code may be
            shown below.
          </p>
          {devHint ? (
            <p className="ok">
              Dev OTP: <strong>{devHint}</strong>
            </p>
          ) : null}
          <form onSubmit={onVerify}>
            <label htmlFor="otp">OTP</label>
            <input
              id="otp"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              required
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={busy || code.length !== 6}>
                Verify
              </button>
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={onResend}>
                Resend code
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {verified ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Next steps</h3>
          <p className="muted">
            Your request is verified. The desk will prepare a private offer. Confirm by hotel and pay
            hotel directly — HotelRADAR Direct never collects the stay payment.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {showOfferLink ? (
              <Link className="btn btn-primary" href={`/offer/${token}`}>
                View private offer
              </Link>
            ) : (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={onDemoOffer}>
                Attach demo offer (test)
              </button>
            )}
            {["converted", "hotel_confirmed"].includes(status) ||
            ["payment_pending", "payment_received"].includes(String(opp.booking_status ?? "")) ? (
              <Link className="btn btn-primary" href={`/offer/${token}`}>
                Pay hotel / submit UTR
              </Link>
            ) : null}
            {status !== "cancelled" ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>
                Cancel request
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {opp.payment_receipt_number ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Payment receipt</h3>
          <p className="mono" style={{ margin: "0 0 8px" }}>
            {String(opp.payment_receipt_number)}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            HotelRADAR coordination receipt — the hotel issues the tax invoice for your room tariff.
            {opp.payment_receipt_issued_at
              ? ` Issued ${new Date(String(opp.payment_receipt_issued_at)).toLocaleString()}.`
              : ""}
          </p>
        </section>
      ) : null}

      {opp.check_in_code ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Check-in code</h3>
          <p className="mono" style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>
            {String(opp.check_in_code)}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Show this at the front desk
            {opp.hotel_booking_ref ? ` · ref ${String(opp.hotel_booking_ref)}` : ""}.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link className="btn btn-secondary" href={`/offer/${token}`}>
              Payment & offer details
            </Link>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Timeline</h3>
        {events.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={i}>
                  <td>{new Date(String(ev.occurred_at)).toLocaleString()}</td>
                  <td>{String(ev.event_type)}</td>
                  <td>
                    {ev.new_status ? String(ev.new_status).replaceAll("_", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
