"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminListCommission, adminSettleCommission, formatInrFromPaise } from "../../../lib/adminApi";

export default function AdminCommissionPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(s = status) {
    const data = await adminListCommission(s || undefined);
    setRows(data.entries);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <AdminShell>
      <div className="admin-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="due">due</option>
          <option value="settled">settled</option>
        </select>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>OPP</th>
              <th>Hotel</th>
              <th>Stay total</th>
              <th>Commission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  <Link href={`/admin/opportunities/${String(r.external_opportunity_id)}`}>
                    {String(r.external_opportunity_id)}
                  </Link>
                </td>
                <td>{String(r.hotel_name ?? "—")}</td>
                <td>{formatInrFromPaise(r.stay_total_paise as number)}</td>
                <td>{formatInrFromPaise(r.commission_paise as number)}</td>
                <td>{String(r.status)}</td>
                <td>
                  {r.status === "due" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void adminSettleCommission(String(r.id))
                          .then(() => load())
                          .catch((e) => setError(e instanceof Error ? e.message : "Settle failed"))
                      }
                    >
                      Settle
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="meta">No commission entries yet.</p> : null}
      </div>
    </AdminShell>
  );
}
