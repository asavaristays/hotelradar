"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import {
  adminListAttestationQueue,
  formatInrFromPaise,
} from "../../../lib/adminApi";

function ageLabel(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function AdminAttestationQueuePage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListAttestationQueue()
      .then((d) => setRows(d.queue))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <AdminShell title="Attestation queue">
      <p className="meta" style={{ marginBottom: 14 }}>
        Manual settlement ops screen — who still needs to confirm payment, how long they have been
        waiting, and which desk number to call. Sort is oldest first.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>OPP</th>
              <th>Hotel</th>
              <th>Guest</th>
              <th>Waiting on</th>
              <th>Age</th>
              <th>UTR</th>
              <th>Desk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.external_opportunity_id)}>
                <td className="mono">{String(r.external_opportunity_id)}</td>
                <td>{String(r.hotel ?? "—")}</td>
                <td>
                  {String(r.guest ?? "—")}
                  <div className="meta">{String(r.guest_phone_masked ?? "")}</div>
                </td>
                <td>
                  <strong>{String(r.waiting_on).replace(/_/g, " ")}</strong>
                  {Number(r.age_seconds) >= 20 * 60 ? (
                    <div className="meta" style={{ color: "#b42318" }}>
                      &gt;20 min — escalate
                    </div>
                  ) : null}
                </td>
                <td>{ageLabel(r.age_seconds as number)}</td>
                <td className="mono">{String(r.utr ?? "—")}</td>
                <td className="mono">{String(r.desk_phone ?? "—")}</td>
                <td>
                  <Link
                    href={`/admin/opportunities/${encodeURIComponent(String(r.external_opportunity_id))}`}
                  >
                    Work
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8}>Queue clear — no open attestations.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows[0]?.gross_collected_paise != null ? (
        <p className="meta" style={{ marginTop: 10 }}>
          Example amount on top row:{" "}
          {formatInrFromPaise(Number(rows[0].gross_collected_paise))}
        </p>
      ) : null}
    </AdminShell>
  );
}
