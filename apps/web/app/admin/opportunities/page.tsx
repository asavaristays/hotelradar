"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminListOpportunities } from "../../../lib/adminApi";

export default function AdminOpportunitiesPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState("");
  const [destination, setDestination] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await adminListOpportunities({
      status: status || undefined,
      destination: destination || undefined,
      q: q || undefined,
    });
    setRows(data.opportunities);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, destination]);

  return (
    <AdminShell>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search OPP / name" />
        <select value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="">All destinations</option>
          <option>Goa</option>
          <option>Rajasthan</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {[
            "verifying",
            "verified",
            "routed",
            "hotel_notified",
            "offers_live",
            "converted",
            "hotel_confirmed",
            "commission_due",
            "settled",
            "no_offers",
            "cancelled",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>OPP</th>
              <th>Status</th>
              <th>Booking</th>
              <th>Dest</th>
              <th>Traveller</th>
              <th>Hotel</th>
              <th>Response</th>
              <th>Stay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.external_opportunity_id)}>
                <td className="mono">{String(r.external_opportunity_id)}</td>
                <td>{String(r.status)}</td>
                <td>{String(r.booking_status ?? "—")}</td>
                <td>{String(r.destination ?? "—")}</td>
                <td>{String(r.traveller_name ?? "—")}</td>
                <td>{String(r.hotel_name ?? r.requested_property ?? "—")}</td>
                <td>
                  {r.median_response_seconds != null
                    ? Number(r.median_response_seconds) < 60
                      ? `${Math.round(Number(r.median_response_seconds))}s`
                      : `${Math.round(Number(r.median_response_seconds) / 60)}m`
                    : "—"}
                  <div className="meta">
                    {Number(r.hotels_responded ?? 0)}/{Number(r.hotels_routed ?? 0)} replied
                  </div>
                </td>
                <td>
                  {String(r.check_in).slice(0, 10)} → {String(r.check_out).slice(0, 10)}
                  {r.outside_booking_window ? (
                    <div className="meta" style={{ color: "var(--admin-danger, #b33)" }}>
                      outside 48h window
                    </div>
                  ) : null}
                </td>
                <td>
                  <Link href={`/admin/opportunities/${encodeURIComponent(String(r.external_opportunity_id))}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="meta">No opportunities.</p> : null}
      </div>
    </AdminShell>
  );
}
