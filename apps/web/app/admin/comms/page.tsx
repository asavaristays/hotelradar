"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import {
  adminCreateBeltNote,
  adminListBeltNotes,
  adminListTemplates,
  adminPreviewTemplate,
  adminSetTemplateStatus,
} from "../../../lib/adminApi";

const BELTS = [
  "morjim",
  "ashwem",
  "arambol",
  "anjuna",
  "vagator",
  "candolim",
  "calangute",
  "baga",
] as const;

const KINDS = ["noise", "access", "monsoon", "crowd", "food", "safety", "seasonal"] as const;

export default function AdminCommsPage() {
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [notes, setNotes] = useState<Array<Record<string, unknown>>>([]);
  const [filterBelt, setFilterBelt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function load(belt = filterBelt) {
    const [t, n] = await Promise.all([
      adminListTemplates(),
      adminListBeltNotes(belt || undefined),
    ]);
    setTemplates(t.templates);
    setNotes(n.notes);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const monthsRaw = String(fd.get("months") || "").trim();
    const months = monthsRaw
      ? monthsRaw
          .split(/[,\s]+/)
          .map((x) => Number(x))
          .filter((n) => n >= 1 && n <= 12)
      : [];
    setBusy(true);
    setError(null);
    try {
      await adminCreateBeltNote({
        belt: String(fd.get("belt") || "").trim().toLowerCase(),
        kind: String(fd.get("kind") || "noise"),
        note: String(fd.get("note") || "").trim(),
        months_applicable: months,
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Comms">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-panel">
        <h2>WhatsApp templates</h2>
        <p className="meta">
          Seeded Meta template specs — mark approved only after Meta accepts. Freeform chat only
          works inside the 24h session window. Live Meta send stays deliberate for beta.
        </p>
        <ul className="admin-events" style={{ marginTop: 10 }}>
          {templates.map((t) => (
            <li key={String(t.key)}>
              <strong className="mono">{String(t.key)}</strong> · {String(t.status)} ·{" "}
              {String(t.category)}
              <div className="meta" style={{ marginTop: 4 }}>
                {String(t.body_text)}
              </div>
              <div className="admin-filters wrap" style={{ marginTop: 6 }}>
                {(["submitted", "approved", "rejected", "paused", "draft"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy || String(t.status) === s}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          await adminSetTemplateStatus(String(t.key), s);
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Update failed");
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        const vars = Array.isArray(t.variables) ? t.variables.map(String) : [];
                        const sample = vars.map((_, i) => `Sample${i + 1}`);
                        const p = await adminPreviewTemplate(String(t.key), sample);
                        setPreview(p.rendered);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Preview failed");
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Preview
                </button>
              </div>
            </li>
          ))}
          {templates.length === 0 ? <li className="meta">No templates yet — run migration 009.</li> : null}
        </ul>
        {preview ? (
          <p className="meta" style={{ marginTop: 10 }}>
            Preview: {preview}
          </p>
        ) : null}
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>North Goa belt KB</h2>
        <p className="meta">
          Hand-written local knowledge the assistant may quote via <code>get_area_notes</code> —
          never invent. Beta pack covers all eight belts.
        </p>
        <div className="admin-filters wrap" style={{ marginBottom: 10 }}>
          <select
            value={filterBelt}
            onChange={(e) => {
              const v = e.target.value;
              setFilterBelt(v);
              load(v).catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
            }}
          >
            <option value="">All belts</option>
            {BELTS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="meta">{notes.length} notes</span>
        </div>
        <ul className="admin-events" style={{ marginTop: 10 }}>
          {notes.map((n) => (
            <li key={String(n.id)}>
              <strong>{String(n.belt)}</strong> · {String(n.kind)}
              {Array.isArray(n.months_applicable) && n.months_applicable.length
                ? ` · months ${n.months_applicable.join(",")}`
                : " · all months"}{" "}
              — {String(n.note)}
            </li>
          ))}
          {!notes.length ? <li className="meta">No notes yet.</li> : null}
        </ul>
        <form className="admin-filters wrap" style={{ marginTop: 12 }} onSubmit={onNote}>
          <select name="belt" defaultValue="morjim" required>
            {BELTS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select name="kind" defaultValue="noise">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input name="note" placeholder="One honest line" required style={{ minWidth: 280 }} />
          <input
            name="months"
            placeholder="Months 1-12 (blank = always)"
            style={{ minWidth: 160 }}
          />
          <button type="submit" disabled={busy}>
            Add note
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
