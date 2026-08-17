"use client";

import { useEffect, useState } from "react";
import { attestHotelPaymentByToken } from "../lib/api";

export function HotelAttestView({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    // no auto-attest — hotel must tap
  }, [token]);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const data = await attestHotelPaymentByToken(token);
      setDone(true);
      setDetail(
        data.verdict?.action
          ? `Attestation ${String(data.verdict.action)}${
              data.payment_utr ? ` · UTR ${data.payment_utr}` : ""
            }`
          : "Hotel payment confirmed."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 480, margin: "40px auto" }}>
      <section className="card">
        <h1 style={{ marginTop: 0, fontSize: 22 }}>Confirm guest payment</h1>
        <p className="muted">
          Hotel desk only — tap below if you have received this guest’s stay payment. HotelRADAR does
          not hold guest funds.
        </p>
        {error ? <p className="error">{error}</p> : null}
        {done ? (
          <p className="ok">{detail || "Confirmed."}</p>
        ) : (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Confirming…" : "Yes — payment received"}
          </button>
        )}
      </section>
    </div>
  );
}
