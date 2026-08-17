"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminListGuests } from "../../../lib/adminApi";

export default function AdminGuestsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query = q) {
    setRows((await adminListGuests(query || undefined)).guests);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell title="Guests">
      <p className="meta" style={{ marginBottom: 14 }}>
        Repeat travellers are where day-1 check-in and hop-loop messaging pay off. Lifetime bookings
        increment when a stay is confirmed.
      </p>
      <form
        className="admin-filters"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / phone / email"
        />
        <button type="submit">Search</button>
      </form>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Phone</th>
              <th>Requests</th>
              <th>Confirmed stays</th>
              <th>Lifetime</th>
              <th>Last stay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  {String(r.name ?? "—")}
                  {r.is_repeat ? <span className="meta"> · repeat</span> : null}
                </td>
                <td className="mono">{String(r.phone_masked)}</td>
                <td>{String(r.request_count ?? 0)}</td>
                <td>{String(r.completed_stays ?? 0)}</td>
                <td>{String(r.lifetime_bookings ?? 0)}</td>
                <td>
                  {r.last_check_out ? String(r.last_check_out).slice(0, 10) : "—"}
                </td>
                <td className="meta">{r.email ? String(r.email) : ""}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7}>No guests yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
