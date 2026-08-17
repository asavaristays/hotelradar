"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDeskExceptions, getDeskQueue } from "../lib/api";

type DestFilter = "" | "Goa" | "Rajasthan";

export function DeskBoard() {
  const [queue, setQueue] = useState<Array<Record<string, unknown>>>([]);
  const [exceptions, setExceptions] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [destFilter, setDestFilter] = useState<DestFilter>("");

  async function load(destination: DestFilter = destFilter) {
    const [q, e] = await Promise.all([
      getDeskQueue(destination || undefined),
      getDeskExceptions(),
    ]);
    setQueue(q.opportunities);
    setExceptions(e.exceptions);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Desk load failed"));
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destFilter]);

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Open exceptions</h2>
          <button className="btn btn-secondary" type="button" onClick={() => load()}>
            Refresh
          </button>
        </div>
        {exceptions.length === 0 ? (
          <p className="muted">No open exceptions.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>OPP</th>
                <th>Destination</th>
                <th>Summary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((row) => (
                <tr key={String(row.id)}>
                  <td>{new Date(String(row.created_at)).toLocaleString()}</td>
                  <td>{String(row.exception_type)}</td>
                  <td>{String(row.external_opportunity_id ?? "—")}</td>
                  <td>{String(row.destination ?? "—")}</td>
                  <td>{String(row.summary ?? "")}</td>
                  <td>
                    {row.public_token ? (
                      <Link href={`/request/${String(row.public_token)}`}>Open</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Opportunity queue</h2>
          <div className="dest-filter" role="group" aria-label="Filter by destination">
            {(
              [
                ["", "All"],
                ["Goa", "Goa"],
                ["Rajasthan", "Rajasthan"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={destFilter === value ? "dest-filter-btn is-active" : "dest-filter-btn"}
                onClick={() => setDestFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {queue.length === 0 ? (
          <p className="muted">Queue empty.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>OPP</th>
                <th>Status</th>
                <th>Traveller</th>
                <th>Destination</th>
                <th>Stay</th>
                <th>OTP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={String(row.external_opportunity_id)}>
                  <td>{String(row.external_opportunity_id)}</td>
                  <td>
                    <span className="badge">{String(row.status).replaceAll("_", " ")}</span>
                  </td>
                  <td>
                    {String(row.traveller_name ?? "")}
                    <div className="muted">{String(row.mobile_masked ?? "")}</div>
                  </td>
                  <td>{String(row.destination ?? "—")}</td>
                  <td>
                    {String(row.requested_area)}
                    <div className="muted">
                      {String(row.check_in).slice(0, 10)} → {String(row.check_out).slice(0, 10)}
                    </div>
                  </td>
                  <td>{row.otp_verified ? "verified" : "pending"}</td>
                  <td>
                    <Link href={`/request/${String(row.public_token)}`}>Open</Link>
                    {" · "}
                    <Link href={`/offer/${String(row.public_token)}`}>Offer</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
