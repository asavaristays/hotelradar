"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "../../components/admin/AdminShell";
import { adminOverview } from "../../lib/adminApi";

const FLOW = [
  {
    n: "1",
    title: "Supply",
    body: "Hotels · GST · belt · lat/lng · rate sheet · media",
    href: "/admin/hotels",
  },
  {
    n: "2",
    title: "Route & quote",
    body: "Fan-out scoring · rate engine · 45-min hold",
    href: "/admin/opportunities",
  },
  {
    n: "3",
    title: "Pay & attest",
    body: "UTR + hotel received · direct_to_hotel pilot",
    href: "/admin/attestation",
  },
  {
    n: "4",
    title: "Redeem & settle",
    body: "Proof of stay · weekly invoice · no escrow payout",
    href: "/admin/redeem",
  },
];

export default function AdminHomePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminOverview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  const tiles = data?.tiles;

  return (
    <AdminShell>
      {error ? <p className="admin-error">{error}</p> : null}

      <p className="meta" style={{ marginBottom: 16 }}>
        Pilot: North Goa · 48h window · dual attestation · direct_to_hotel (commission via invoice).
      </p>

      <div className="admin-flow">
        {FLOW.map((f) => (
          <Link key={f.n} href={f.href} className="admin-flow-card">
            <span className="admin-flow-n">{f.n}</span>
            <strong>{f.title}</strong>
            <span>{f.body}</span>
          </Link>
        ))}
      </div>

      <h2 className="admin-section-title" style={{ marginTop: 20 }}>
        Pilot signals
      </h2>
      <div className="admin-stats">
        <div className="admin-stat">
          <strong>{tiles?.offer_coverage?.value ?? "—"}</strong>
          <span>{tiles?.offer_coverage?.label ?? "Offer coverage, 7d"}</span>
          <span className="meta">{tiles?.offer_coverage?.target}</span>
        </div>
        <div className="admin-stat">
          <strong>{tiles?.median_response?.value ?? "—"}</strong>
          <span>{tiles?.median_response?.label ?? "Median response, 7d"}</span>
          <span className="meta">{tiles?.median_response?.target}</span>
        </div>
        <div className="admin-stat">
          <strong>{tiles?.silent_hotels?.value ?? "—"}</strong>
          <span>{tiles?.silent_hotels?.label ?? "Silent hotels, 7d"}</span>
          <span className="meta">{tiles?.silent_hotels?.target}</span>
        </div>
        <div className="admin-stat">
          <strong>{tiles?.live_with_sheet?.value ?? "—"}</strong>
          <span>{tiles?.live_with_sheet?.label ?? "Live with sheet"}</span>
        </div>
      </div>

      <h2 className="admin-section-title" style={{ marginTop: 18 }}>
        Ops queue
      </h2>
      <div className="admin-stats">
        <Link href="/admin/opportunities" className="admin-stat">
          <strong>{data?.opportunities.open_opps ?? "—"}</strong>
          <span>Open OPPs</span>
        </Link>
        <Link href="/admin/attestation" className="admin-stat">
          <strong>{data?.opportunities.attestation_pending ?? "—"}</strong>
          <span>Attestation open</span>
        </Link>
        <Link href="/admin/attestation" className="admin-stat">
          <strong>{data?.opportunities.paid_not_confirmed ?? "—"}</strong>
          <span>Paid · not confirmed</span>
        </Link>
        <Link href="/admin/commission" className="admin-stat">
          <strong>{tiles?.commission_due?.value ?? data?.opportunities.commission_due ?? "—"}</strong>
          <span>Commission due</span>
        </Link>
        <Link href="/admin/exceptions" className="admin-stat">
          <strong>{data?.open_exceptions ?? "—"}</strong>
          <span>Open exceptions</span>
        </Link>
        <Link href="/admin/assistant" className="admin-stat">
          <strong>{data?.system.openai?.configured ? "ON" : "OFF"}</strong>
          <span>OpenAI</span>
        </Link>
      </div>

      <div className="admin-panel" style={{ marginTop: 16 }}>
        <h2>System</h2>
        <p>
          OTP: <strong>{data?.system.otp_provider ?? "—"}</strong>
          {" · "}
          Asavari: <strong>{data?.system.asavari_sync ? "on" : "off"}</strong>
          {" · "}
          Settlement: <strong>{data?.system.settlement_default ?? "direct_to_hotel"}</strong>
          {" · "}
          Window: <strong>{data?.system.booking_window_hours ?? 48}h</strong>
          {" · "}
          WA templates:{" "}
          <strong>
            {data?.templates?.approved ?? 0}/{data?.templates?.total ?? 0} approved
          </strong>
        </p>
        <p className="meta" style={{ marginTop: 8 }}>
          {data?.settlement?.payouts_copy}
        </p>
        <div className="admin-filters wrap" style={{ marginTop: 10 }}>
          <Link className="admin-btn" href="/admin/attestation">
            Attestation queue
          </Link>
          <Link className="admin-btn" href="/admin/comms">
            Comms
          </Link>
          <Link className="admin-btn" href="/admin/invoices">
            Invoices
          </Link>
          <Link className="admin-btn" href="/admin/system">
            System
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
