"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { adminBackfillOppCodes, adminOverview } from "../../../lib/adminApi";

export default function AdminSystemPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfill, setBackfill] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminOverview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <AdminShell>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-panel">
        <h2>Runtime</h2>
        <p>
          OTP provider: <strong>{data?.system.otp_provider ?? "—"}</strong>
        </p>
        <p>
          Asavari sync: <strong>{data?.system.asavari_sync ? "enabled" : "disabled"}</strong>
        </p>
        <p>
          OpenAI:{" "}
          <strong>
            {data?.system.openai?.configured
              ? `enabled · ${data.system.openai.model}`
              : "not configured"}
          </strong>
        </p>
        <p>
          Settlement default: <strong>{data?.system.settlement_default ?? "direct_to_hotel"}</strong>
        </p>
        <p>
          Booking window: <strong>{data?.system.booking_window_hours ?? 48} hours</strong>
        </p>
        <p>
          WhatsApp templates:{" "}
          <strong>
            {data?.templates?.approved ?? 0} approved / {data?.templates?.total ?? 0} total
          </strong>
        </p>
        <p className="meta" style={{ marginTop: 12 }}>
          Meta WhatsApp Cloud send and Razorpay/Cashfree PSP are deliberately not wired.
          Ops uses Copy WhatsApp / wa.me on each OPP; guests pay the hotel UPI and submit UTR on
          the offer page. North Goa belt KB lives under Comms — assistant reads it via{" "}
          <code>get_area_notes</code>.
        </p>
        <div className="admin-filters wrap" style={{ marginTop: 12 }}>
          <Link className="admin-btn" href="/admin/assistant">
            Assistant
          </Link>
          <Link className="admin-btn" href="/admin/comms">
            Comms / North Goa KB
          </Link>
          <Link className="admin-btn" href="/admin/attestation">
            Attestation queue
          </Link>
        </div>
      </div>

      <div className="admin-panel" style={{ marginTop: 14 }}>
        <h2>OPP code security</h2>
        <p className="meta">
          Sequential codes like <span className="mono">OPP-20260808-0001</span> are enumerable. New
          codes use CSPRNG (<span className="mono">OPP-26H-4K7M2</span>). Run backfill once before
          real guests — old values stay in <span className="mono">legacy_opp_code</span> for support.
        </p>
        <button
          type="button"
          className="admin-btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setBackfill(null);
            void adminBackfillOppCodes()
              .then((r) =>
                setBackfill(
                  `Scanned ${r.scanned} · regenerated ${r.regenerated} · skipped ${r.skipped_non_enumerable}`
                )
              )
              .catch((e) => setError(e instanceof Error ? e.message : "Backfill failed"))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Backfilling…" : "Backfill enumerable OPP codes"}
        </button>
        {backfill ? <p className="ok" style={{ marginTop: 10 }}>{backfill}</p> : null}
      </div>
    </AdminShell>
  );
}
