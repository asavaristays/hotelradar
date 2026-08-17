"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminListHotels } from "../../../lib/adminApi";

export default function AdminHotelsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListHotels()
      .then((d) => setRows(d.hotels))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <AdminShell
      actions={
        <>
          <Link className="admin-btn" href="/admin/hotels/import" style={{ marginRight: 8 }}>
            Import CSV
          </Link>
          <Link className="admin-btn" href="/admin/hotels/new">
            New hotel
          </Link>
        </>
      }
    >
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Legal / GSTIN</th>
              <th>Dest</th>
              <th>GST</th>
              <th>Commission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={String(h.id)}>
                <td>{String(h.display_name)}</td>
                <td>
                  <div>{String(h.legal_name || "—")}</div>
                  <div className="meta mono">{String(h.gstin || "No GSTIN")}</div>
                </td>
                <td>{String(h.destination)}</td>
                <td>{Number(h.gst_rate_bps ?? 1800) / 100}%</td>
                <td>{Number(h.commission_pct_bps) / 100}%</td>
                <td>{String(h.status)}</td>
                <td>
                  <Link href={`/admin/hotels/${String(h.id)}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="meta">No hotels yet — create one with GSTIN and bank details.</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
