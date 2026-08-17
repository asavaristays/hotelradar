"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../../../components/admin/AdminShell";
import {
  adminListPayouts,
  adminOverview,
  adminSettlePayout,
  formatInrFromPaise,
} from "../../../lib/adminApi";

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState(
    "No payouts in direct-to-hotel mode — the guest pays the hotel. Commission is collected via weekly invoice."
  );

  async function load(s = status) {
    setRows((await adminListPayouts(s || undefined)).payouts);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    adminOverview()
      .then((d) => {
        if (d.settlement?.payouts_copy) setCopy(d.settlement.payouts_copy);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <AdminShell title="Payouts (escrow mode)">
      <p className="meta" style={{ marginBottom: 14 }}>
        {copy}
      </p>
      <p className="meta" style={{ marginBottom: 14 }}>
        This screen stays empty in the pilot. Escrow payouts appear here only after an aggregator is
        wired and settlement mode is set to <strong>escrow</strong>. Use{" "}
        <Link href="/admin/invoices">Invoices</Link> for hotel → platform commission.
      </p>
      <div className="admin-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">pending</option>
          <option value="settled">settled</option>
          <option value="failed">failed</option>
        </select>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>OPP</th>
              <th>Hotel</th>
              <th>Trigger</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  <Link href={`/admin/opportunities/${encodeURIComponent(String(r.external_opportunity_id))}`}>
                    {String(r.external_opportunity_id)}
                  </Link>
                </td>
                <td>{String(r.hotel_name ?? "—")}</td>
                <td>{String(r.trigger)}</td>
                <td>{formatInrFromPaise(r.amount_paise as number)}</td>
                <td>{String(r.status)}</td>
                <td>
                  {r.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void adminSettlePayout(String(r.id))
                          .then(() => load())
                          .catch((e) => setError(e instanceof Error ? e.message : "Settle failed"))
                      }
                    >
                      Mark settled
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>No escrow payouts — expected in direct-to-hotel mode.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
