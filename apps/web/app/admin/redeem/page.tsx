"use client";

import { FormEvent, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminRedeemCode, formatInrFromPaise } from "../../../lib/adminApi";

export default function AdminRedeemPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await adminRedeemCode(code.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Redeem check-in code">
      <p className="meta" style={{ marginBottom: 16 }}>
        Front-desk / ops redemption. Idempotent — a second submit returns the original result and never
        double-accrues commission. In direct-to-hotel mode redemption proves the stay and accrues
        commission for the weekly invoice; it does not pay the hotel.
      </p>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>
          Check-in code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="4K7M2H-9"
            required
            className="mono"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Redeeming…" : "Redeem"}
        </button>
      </form>
      {error ? <p className="admin-error">{error}</p> : null}
      {result ? (
        <div className="admin-panel" style={{ marginTop: 16 }}>
          <h2>{result.idempotent ? "Already redeemed" : "Redeemed"}</h2>
          <p>
            OPP <strong className="mono">{String(result.opportunity_id)}</strong>
          </p>
          {result.commission && typeof result.commission === "object" ? (
            <p>
              Commission accrued{" "}
              {formatInrFromPaise(
                Number((result.commission as { commission_paise?: number }).commission_paise)
              )}{" "}
              · {String((result.commission as { status?: string }).status ?? "due")}
            </p>
          ) : result.money && typeof result.money === "object" ? (
            <p>
              Commission{" "}
              {formatInrFromPaise(
                Number((result.money as { commission_paise?: string }).commission_paise)
              )}
            </p>
          ) : (
            <p className="meta">Stay proved — commission entry created when applicable.</p>
          )}
        </div>
      ) : null}
    </AdminShell>
  );
}
