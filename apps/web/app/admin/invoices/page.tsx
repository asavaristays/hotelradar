"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import {
  adminGenerateWeeklyInvoice,
  adminListHotels,
  adminListInvoices,
  formatInrFromPaise,
} from "../../../lib/adminApi";

export default function AdminInvoicesPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [hotels, setHotels] = useState<Array<Record<string, unknown>>>([]);
  const [hotelId, setHotelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [inv, h] = await Promise.all([adminListInvoices(), adminListHotels()]);
    setRows(inv.invoices);
    setHotels(h.hotels);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setBusy(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      await adminGenerateWeeklyInvoice({
        hotel_id: hotelId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Invoices">
      <p className="meta" style={{ marginBottom: 14 }}>
        Gapless HR/FY series under row lock. Weekly commission invoices from accrued stays.
      </p>
      <form className="admin-filters" onSubmit={onGenerate}>
        <select value={hotelId} onChange={(e) => setHotelId(e.target.value)} required>
          <option value="">Hotel</option>
          {hotels.map((h) => (
            <option key={String(h.id)} value={String(h.id)}>
              {String(h.display_name)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !hotelId}>
          {busy ? "Generating…" : "Generate last 7 days"}
        </button>
      </form>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Hotel</th>
              <th>Period</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td className="mono">{String(r.invoice_number)}</td>
                <td>{String(r.hotel_name)}</td>
                <td>
                  {String(r.period_start).slice(0, 10)} → {String(r.period_end).slice(0, 10)}
                </td>
                <td>{formatInrFromPaise(r.total_paise as number)}</td>
                <td>{String(r.status)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5}>No invoices yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
