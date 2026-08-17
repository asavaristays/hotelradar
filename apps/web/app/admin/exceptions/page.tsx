"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminListExceptions } from "../../../lib/adminApi";

export default function AdminExceptionsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListExceptions()
      .then((d) => setRows(d.exceptions))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <AdminShell title="Exceptions">
      <p className="meta" style={{ marginBottom: 14 }}>
        Real problems only — happy-path progress lives in the OPP event log.{" "}
        <code>paid_not_confirmed</code> and attestation gaps must never be ignored.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>OPP</th>
              <th>Summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{new Date(String(r.created_at)).toLocaleString()}</td>
                <td>{String(r.exception_type)}</td>
                <td className="mono">{String(r.external_opportunity_id ?? "—")}</td>
                <td>{String(r.summary ?? "")}</td>
                <td>
                  {r.external_opportunity_id ? (
                    <Link href={`/admin/opportunities/${String(r.external_opportunity_id)}`}>Open</Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="meta">No open exceptions.</p> : null}
      </div>
    </AdminShell>
  );
}
