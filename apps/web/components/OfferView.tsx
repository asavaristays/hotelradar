"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  acceptOffer,
  formatInrFromPaise,
  getOffer,
  submitGuestUtr,
} from "../lib/api";

export function OfferView({ token }: { token: string }) {
  const [offer, setOffer] = useState<Record<string, unknown> | null>(null);
  const [opp, setOpp] = useState<Record<string, unknown> | null>(null);
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null);
  const [utr, setUtr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const data = await getOffer(token);
    setOpp(data.opportunity);
    setOffer(data.offer);
    setPayment((data as { payment?: Record<string, unknown> }).payment ?? null);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load offer"));
  }, [token]);

  async function onAccept() {
    setBusy(true);
    setError(null);
    try {
      const data = await acceptOffer(token);
      setMsg(data.handoff || data.message || "Offer accepted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitUtr(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitGuestUtr(token, utr.trim());
      setMsg("UTR submitted — waiting for the hotel to confirm payment received.");
      setUtr("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "UTR submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !opp) {
    return (
      <div className="card">
        <p className="error">{error}</p>
        <Link href={`/request/${token}`}>Back to request status</Link>
      </div>
    );
  }

  if (!opp) return <p className="muted">Loading offer…</p>;

  const accepted =
    String(offer?.status) === "accepted" ||
    ["converted", "hotel_confirmed", "commission_due", "settled"].includes(String(opp.status));
  const showPay = accepted || Boolean(payment?.can_submit_utr) || Boolean(payment?.payment_utr);

  return (
    <div className="stack">
      <section className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Private offer · {String(opp.external_opportunity_id)}
        </p>
        <h2 style={{ margin: "0 0 8px" }}>
          {offer ? String(offer.hotel_name) : "Offer not ready yet"}
        </h2>
        <p className="muted">
          {opp.destination ? `${String(opp.destination)} · ` : ""}
          {String(opp.requested_area)} · {String(opp.check_in).slice(0, 10)} →{" "}
          {String(opp.check_out).slice(0, 10)}
        </p>
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p className="ok">{msg}</p> : null}
      </section>

      {offer ? (
        <section className="card">
          <p style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 750 }}>
            {formatInrFromPaise(offer.total_amount_paise as number)}
          </p>
          <p className="muted" style={{ marginTop: 0 }}>
            {String(offer.tax_fee_treatment)} · {String(offer.room_type)} · {String(offer.occupancy)}
          </p>
          <p>
            <strong>Includes:</strong> {String(offer.inclusions)}
          </p>
          <p>
            <strong>Cancellation:</strong> {String(offer.cancellation_terms)}
          </p>
          <p className="muted">
            Valid until {new Date(String(offer.valid_until)).toLocaleString()} · status{" "}
            {String(offer.status)}
          </p>
          {!accepted ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={onAccept}>
              Accept offer
            </button>
          ) : (
            <p className="ok">Accepted — pay the hotel directly below.</p>
          )}
        </section>
      ) : (
        <section className="card">
          <p className="muted">
            No offer attached yet. Use the request status page to attach a demo offer for testing.
          </p>
          <Link className="btn btn-secondary" href={`/request/${token}`}>
            Back to request
          </Link>
        </section>
      )}

      {showPay && payment ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Pay hotel directly</h3>
          <p className="muted">{String(payment.instructions)}</p>
          {payment.upi_vpa ? (
            <p>
              UPI: <strong className="mono">{String(payment.upi_vpa)}</strong>
              {payment.amount_display ? (
                <>
                  {" "}
                  · Amount <strong>{String(payment.amount_display)}</strong>
                </>
              ) : null}
            </p>
          ) : (
            <p className="muted">
              Ask the desk for UPI / bank details if not shown here yet.
            </p>
          )}
          {payment.payment_note ? <p className="muted">{String(payment.payment_note)}</p> : null}
          {payment.payment_utr ? (
            <p className="ok">
              UTR recorded: <strong className="mono">{String(payment.payment_utr)}</strong>
              {payment.hotel_attested
                ? " · Hotel confirmed received"
                : " · Waiting for hotel confirmation"}
            </p>
          ) : payment.can_submit_utr ? (
            <form onSubmit={onSubmitUtr}>
              <label htmlFor="utr">UTR / UPI reference</label>
              <input
                id="utr"
                className="mono"
                value={utr}
                onChange={(e) => setUtr(e.target.value.toUpperCase())}
                placeholder="12–22 character ref"
                required
                minLength={12}
                maxLength={22}
              />
              <button className="btn btn-primary" type="submit" disabled={busy || utr.trim().length < 12}>
                Submit UTR
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {opp.check_in_code || payment?.check_in_code ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Check-in code</h3>
          <p className="mono" style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>
            {String(opp.check_in_code || payment?.check_in_code)}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Show this at the front desk. Ref{" "}
            {String(opp.hotel_booking_ref || payment?.booking_ref || opp.external_opportunity_id)}.
          </p>
        </section>
      ) : null}
    </div>
  );
}
