"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "../../../../components/admin/AdminShell";
import { adminImportHotels } from "../../../../lib/adminApi";
import { HOTEL_ONBOARD_COLUMNS } from "../../../../lib/hotelOnboardColumns";

/** Minimal CSV parser (handles quoted commas). */
function parseCsv(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return lines.map(splitCsvLine);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function findHeaderRowIndex(matrix: string[][]): number {
  const needle = "display name";
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] || [];
    if (row.some((c) => String(c).trim().toLowerCase() === needle)) return i;
  }
  return 0;
}

function matrixToRows(matrix: string[][]): Array<Record<string, string>> {
  if (matrix.length < 2) return [];
  const headerIdx = findHeaderRowIndex(matrix);
  const headers = (matrix[headerIdx] || []).map((h) => String(h || "").trim());
  return matrix.slice(headerIdx + 1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      row[h] = String(cells[i] ?? "").trim();
    });
    return row;
  }).filter((r) => Object.values(r).some((v) => String(v || "").trim()));
}

async function fileToRows(file: File): Promise<Array<Record<string, string>>> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName =
      wb.SheetNames.find((n) => /hotel/i.test(n)) ||
      wb.SheetNames.find((n) => /onboard/i.test(n)) ||
      wb.SheetNames[0];
    if (!sheetName) throw new Error("Workbook has no sheets");
    const sheet = wb.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];
    return matrixToRows(matrix.map((r) => (r || []).map((c) => String(c ?? ""))));
  }
  const text = await file.text();
  return matrixToRows(parseCsv(text));
}

export default function ImportHotelsPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState(true);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    results: Array<{ display_name: string; action: string; id?: string; error?: string }>;
  } | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const rows = await fileToRows(file);
      if (!rows.length) {
        throw new Error(
          "No data rows found. Use the template — row 1 must be headers including Display name."
        );
      }
      if (!rows.some((r) => r["Display name"] || r.display_name || r.name)) {
        // still ok if aliases normalize server-side; check any name-like
        const hasName = rows.some((r) =>
          Object.keys(r).some((k) => /display\s*name|^name$/i.test(k) && r[k])
        );
        if (!hasName) {
          throw new Error("Could not find Display name column. Download the latest template.");
        }
      }
      const data = await adminImportHotels(rows, merge);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Import hotels"
      actions={
        <>
          <a className="admin-btn" href="/templates/HotelRADAR_Hotel_Onboarding_Template.xlsx" download>
            Download Excel
          </a>
          <Link className="admin-btn" href="/admin/hotels/new" style={{ marginLeft: 8 }}>
            Single hotel
          </Link>
        </>
      }
    >
      <div className="admin-panel" style={{ marginBottom: 16 }}>
        <h2>Excel → HotelRADAR backend</h2>
        <p className="meta">
          Upload the onboarding template (<strong>.xlsx</strong> preferred, or CSV UTF-8). Each row
          creates/updates a hotel with guest catalog fields, indicative prices, photo URLs, contacts,
          and commercial fields — same mapping as <Link href="/admin/hotels/new">New hotel</Link>.
        </p>
        <ol className="meta" style={{ paddingLeft: 18 }}>
          <li>Download Excel template</li>
          <li>Fill yellow rows (keep header row 1)</li>
          <li>Upload here — merge on same Display name</li>
        </ol>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          Merge into existing hotels (same Display name)
        </label>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {busy ? <p className="meta">Importing…</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}
      </div>

      <div className="admin-panel" style={{ marginBottom: 16 }}>
        <h2>Column → backend map</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Excel</th>
                <th>Backend</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {HOTEL_ONBOARD_COLUMNS.map((c) => (
                <tr key={c.excel}>
                  <td>{c.excel}</td>
                  <td>
                    <code>{c.mapsTo}</code>
                  </td>
                  <td className="meta">{c.note || (c.required ? "Required" : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result ? (
        <div className="admin-panel">
          <h2>Result</h2>
          <p className="meta">
            Created {result.created} · Updated {result.updated} · Skipped {result.skipped}
          </p>
          <ul className="admin-events">
            {result.results.map((r, i) => (
              <li key={`${r.display_name}-${i}`}>
                <strong>{r.display_name}</strong> — {r.action}
                {r.error ? ` (${r.error})` : ""}
                {r.id ? (
                  <>
                    {" "}
                    <Link href={`/admin/hotels/${r.id}`}>Open</Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AdminShell>
  );
}
