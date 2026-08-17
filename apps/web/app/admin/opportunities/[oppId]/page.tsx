"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../../components/admin/AdminShell";
import {
  adminAssignHotel,
  adminAppendChat,
  adminAssistantChat,
  adminAttestHotel,
  adminConfirmBooking,
  adminCopyMessages,
  adminGetOpportunity,
  adminListChat,
  adminListHotels,
  adminMarkEscalationDone,
  adminMarkPaid,
  adminQuoteFromSheet,
  adminRecordOffer,
  adminRedeemCode,
  adminRouteOpportunity,
  adminSetSettlementMode,
  adminStayCompleted,
  adminSubmitPaymentUtr,
  adminTransition,
  formatInrFromPaise,
} from "../../../../lib/adminApi";

type StepId =
  | "verify"
  | "route"
  | "quote"
  | "accept"
  | "pay"
  | "confirm"
  | "redeem"
  | "settle";

function stepState(
  id: StepId,
  o: Record<string, unknown>,
  data: NonNullable<Awaited<ReturnType<typeof adminGetOpportunity>>>
): "done" | "current" | "todo" {
  const status = String(o.status);
  const booking = String(o.booking_status || "");
  const routed = (data.routed_hotels?.length ?? 0) > 0 || Boolean(o.hotel_id);
  const hasOffer = Boolean(data.offer);
  const paid =
    booking === "payment_received" ||
    booking === "confirmed" ||
    booking === "checked_in" ||
    Boolean(o.mobile_shared_at) ||
    (data.payments?.length ?? 0) > 0;
  const confirmed =
    status === "hotel_confirmed" ||
    status === "commission_due" ||
    status === "settled" ||
    booking === "confirmed" ||
    booking === "checked_in" ||
    Boolean(data.booking_code);
  const redeemed =
    Boolean(data.booking_code?.redeemed_at) ||
    booking === "checked_in" ||
    Boolean(data.commission) ||
    (data.payouts?.length ?? 0) > 0;
  const settled = status === "settled" || String(data.commission?.status) === "settled";

  const order: StepId[] = ["verify", "route", "quote", "accept", "pay", "confirm", "redeem", "settle"];
  const done: Record<StepId, boolean> = {
    verify: Boolean(o.otp_verified) || !["draft", "verification_pending", "verifying"].includes(status),
    route: routed,
    quote: hasOffer,
    accept:
      ["converted", "traveller_accepted", "hotel_confirmed", "commission_due", "settled"].includes(
        status
      ) || paid,
    pay: paid,
    confirm: confirmed,
    redeem: redeemed,
    settle: settled,
  };

  const firstOpen = order.find((s) => !done[s]) ?? "settle";
  if (done[id]) return "done";
  if (id === firstOpen) return "current";
  return "todo";
}

export default function AdminOpportunityDetailPage() {
  const params = useParams<{ oppId: string }>();
  const oppId = decodeURIComponent(params.oppId);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminGetOpportunity>> | null>(null);
  const [hotels, setHotels] = useState<Array<Record<string, unknown>>>([]);
  const [hotelId, setHotelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerForm, setOfferForm] = useState({
    room_type: "Deluxe Room",
    occupancy: "2 adults",
    total_inr: "10000",
    inclusions: "Breakfast",
  });
  const [bookingRef, setBookingRef] = useState("");
  const [utr, setUtr] = useState("");
  const [chat, setChat] = useState<Array<Record<string, unknown>>>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [copyMsgs, setCopyMsgs] = useState<Awaited<ReturnType<typeof adminCopyMessages>> | null>(
    null
  );

  async function load() {
    const [d, h, c, msgs] = await Promise.all([
      adminGetOpportunity(oppId),
      adminListHotels(),
      adminListChat(oppId).catch(() => ({ messages: [] as Array<Record<string, unknown>> })),
      adminCopyMessages(oppId).catch(() => null),
    ]);
    setData(d);
    setHotels(h.hotels.filter((x) => String(x.status) === "live" || String(x.status) === "draft"));
    if (d.opportunity.hotel_id) setHotelId(String(d.opportunity.hotel_id));
    setChat(c.messages);
    setCopyMsgs(msgs);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const o = data?.opportunity;
  const steps = useMemo(() => {
    if (!o || !data) return [];
    return (
      [
        { id: "verify" as const, label: "1 · Verify", hint: "OTP / guest" },
        { id: "route" as const, label: "2 · Route", hint: "Fan-out hotels" },
        { id: "quote" as const, label: "3 · Quote", hint: "Rate sheet / manual" },
        { id: "accept" as const, label: "4 · Accept", hint: "Traveller" },
        { id: "pay" as const, label: "5 · Pay", hint: "UTR + dual attest" },
        { id: "confirm" as const, label: "6 · Confirm", hint: "Code + money snapshot" },
        { id: "redeem" as const, label: "7 · Redeem", hint: "Proof of stay" },
        { id: "settle" as const, label: "8 · Settle", hint: "Weekly invoice" },
      ] as const
    ).map((s) => ({ ...s, state: stepState(s.id, o, data) }));
  }, [o, data]);

  return (
    <AdminShell title={oppId} titleClassName="mono">
      {error ? <p className="admin-error">{error}</p> : null}
      {!o || !data ? (
        <p className="meta">Loading…</p>
      ) : (
        <>
          <ol className="admin-process">
            {steps.map((s) => (
              <li key={s.id} className={`admin-process-step is-${s.state}`}>
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </li>
            ))}
          </ol>

          <div className="admin-panel">
            <h2>Trip</h2>
            <p>
              Spine <strong>{String(o.status)}</strong>
              {o.domain_opp_status ? (
                <>
                  {" "}
                  · domain <strong>{String(o.domain_opp_status)}</strong>
                </>
              ) : null}
              {o.booking_status ? (
                <>
                  {" "}
                  · booking <strong>{String(o.booking_status)}</strong>
                </>
              ) : null}{" "}
              · {String(o.destination)} · {String(o.check_in).slice(0, 10)} →{" "}
              {String(o.check_out).slice(0, 10)} · {String(o.rooms)} room / {String(o.adults)} adults
            </p>
            <p>
              Traveller: <strong>{String(o.traveller_name)}</strong> ·{" "}
              {o.mobile_shared_at ? String(o.mobile) : `${String(o.mobile_masked)} (hidden until paid)`}
            </p>
            <p>Requested: {String(o.requested_property ?? o.requested_area ?? "—")}</p>
            <p>
              Hotel: {String(o.hotel_name ?? "unassigned")}
              {o.hotel_gstin ? ` · GSTIN ${String(o.hotel_gstin)}` : ""}
              {o.hotel_upi_vpa ? (
                <>
                  {" "}
                  · UPI <strong className="mono">{String(o.hotel_upi_vpa)}</strong>
                </>
              ) : null}{" "}
              · Booking {String(o.hotel_booking_ref ?? "—")}
            </p>
            <p>
              Settlement:{" "}
              <strong>{String(o.settlement_mode ?? data.settlement?.mode ?? "direct_to_hotel")}</strong>
              {data.settlement?.plan ? (
                <>
                  {" "}
                  · payee {String(data.settlement.plan.payee)} · code{" "}
                  {String(data.settlement.plan.codeTriggers)} · commission{" "}
                  {String(data.settlement.plan.commissionCollection)}
                </>
              ) : null}
            </p>
            {(data.settlement?.escalations_due?.length ?? 0) > 0 ? (
              <p className="meta">
                Escalation due:{" "}
                {data.settlement!.escalations_due.map((e) => String(e.action)).join(", ")}
              </p>
            ) : null}
          </div>

          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>Copy WhatsApp (manual until Meta send)</h2>
            <p className="meta">
              Live Meta send stays deliberate. Copy or open wa.me — hotel payment-check includes the
              attest link.
            </p>
            {copyMsgs?.outside_booking_window ? (
              <p className="admin-error">Stay is outside the 48h Direct window.</p>
            ) : null}
            <ul className="admin-events">
              {(copyMsgs?.messages ?? []).map((m) => (
                <li key={m.key}>
                  <strong className="mono">{m.key}</strong>
                  <div className="meta">{m.purpose}</div>
                  {m.ready ? (
                    <>
                      <pre
                        className="meta"
                        style={{
                          whiteSpace: "pre-wrap",
                          margin: "6px 0",
                          maxHeight: 90,
                          overflow: "auto",
                        }}
                      >
                        {m.body}
                      </pre>
                      <div className="admin-filters wrap">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(m.body)}
                        >
                          Copy
                        </button>
                        {m.wa_me ? (
                          <a className="admin-btn" href={m.wa_me} target="_blank" rel="noreferrer">
                            Open WhatsApp
                          </a>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="meta">Not enough data yet.</p>
                  )}
                </li>
              ))}
            </ul>
            {(data.settlement?.escalations_due?.length ?? 0) > 0 ? (
              <div className="admin-filters wrap" style={{ marginTop: 10 }}>
                {data.settlement!.escalations_due.map((e) => (
                  <button
                    key={String(e.action)}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => adminMarkEscalationDone(oppId, String(e.action)))
                    }
                  >
                    Mark {String(e.action)} done
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* 2 · Route */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>2 · Route hotels</h2>
            <p className="meta">
              Fan-out creates OpportunityHotel rows — <code>instant_sheet</code> if rate sheet enabled,
              else <code>manual_quote</code>.
            </p>
            {(data.routed_hotels?.length ?? 0) > 0 ? (
              <ul className="admin-events">
                {data.routed_hotels.map((h) => (
                  <li key={String(h.id)}>
                    {String(h.hotel_name)} · {String(h.route)} · {String(h.outcome ?? "waiting")}
                    {h.instant_quote_enabled ? " · instant" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Not routed yet.</p>
            )}
            <div className="admin-filters wrap" style={{ marginTop: 10 }}>
              <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
                <option value="">Select hotel</option>
                {hotels.map((h) => (
                  <option key={String(h.id)} value={String(h.id)}>
                    {String(h.display_name)} ({String(h.destination)} · {String(h.status)}
                    {h.gstin ? ` · ${String(h.gstin)}` : ""})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !hotelId}
                onClick={() => void run(() => adminAssignHotel(oppId, hotelId))}
              >
                Assign one
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminRouteOpportunity(oppId, { limit: 3 }))}
              >
                Fan-out 2–3 live
              </button>
            </div>
          </div>

          {/* 3 · Quote */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>3 · Quote / private offer</h2>
            {data.offer ? (
              <p>
                {String(data.offer.hotel_name)} · {String(data.offer.room_type)} ·{" "}
                {formatInrFromPaise(data.offer.total_amount_paise as number)} · {String(data.offer.status)}
                {data.offer.source ? ` · ${String(data.offer.source)}` : ""}
                {data.offer.holds_until
                  ? ` · holds ${String(data.offer.holds_until).slice(0, 16)}`
                  : data.offer.valid_until
                    ? ` · until ${String(data.offer.valid_until).slice(0, 16)}`
                    : ""}
              </p>
            ) : (
              <p className="meta">No offer — use rate sheet or enter manual gross (GST-inclusive).</p>
            )}
            <div className="admin-filters wrap">
              <button
                type="button"
                disabled={busy || !hotelId}
                onClick={() => void run(() => adminQuoteFromSheet(oppId, hotelId))}
              >
                Quote from rate sheet
              </button>
              <input
                value={offerForm.room_type}
                onChange={(e) => setOfferForm({ ...offerForm, room_type: e.target.value })}
                placeholder="Room type"
              />
              <input
                value={offerForm.occupancy}
                onChange={(e) => setOfferForm({ ...offerForm, occupancy: e.target.value })}
                placeholder="Occupancy"
              />
              <input
                value={offerForm.total_inr}
                onChange={(e) => setOfferForm({ ...offerForm, total_inr: e.target.value })}
                placeholder="Gross INR (incl GST)"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    adminRecordOffer(oppId, {
                      room_type: offerForm.room_type,
                      occupancy: offerForm.occupancy,
                      total_amount_paise: Math.round(Number(offerForm.total_inr) * 100),
                      inclusions: offerForm.inclusions,
                    })
                  )
                }
              >
                Manual offer
              </button>
            </div>
          </div>

          {/* 5 · Pay */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>5 · Payment · dual attestation</h2>
            <p className="meta">
              Pilot is <code>direct_to_hotel</code>: guest pays the hotel, submits UTR, hotel taps
              received. Both sides → payment_received. Ops override still available.
            </p>
            <p>
              UTR: <strong className="mono">{String(o.payment_utr ?? "—")}</strong>
              {" · "}
              Guest: {o.guest_attested_at ? "attested" : "waiting"}
              {" · "}
              Hotel: {o.hotel_attested_at ? "attested" : "waiting"}
              {data.settlement?.attestation_verdict ? (
                <>
                  {" · "}
                  verdict <strong>{String(data.settlement.attestation_verdict.action)}</strong>
                </>
              ) : null}
            </p>
            {(data.payments?.length ?? 0) > 0 ? (
              <ul className="admin-events">
                {data.payments.map((p) => (
                  <li key={String(p.id)}>
                    {String(p.provider)} · {formatInrFromPaise(p.amount_paise as number)} ·{" "}
                    {String(p.status)}
                    {p.utr ? ` · UTR ${String(p.utr)}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No payment row yet.</p>
            )}
            <div className="admin-filters wrap" style={{ marginTop: 10 }}>
              <input
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="UTR / UPI ref (12–22)"
                className="mono"
              />
              <button
                type="button"
                disabled={busy || !utr.trim()}
                onClick={() => void run(() => adminSubmitPaymentUtr(oppId, utr.trim()))}
              >
                Submit guest UTR
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminAttestHotel(oppId))}
              >
                Hotel: payment received
              </button>
              <button type="button" disabled={busy} onClick={() => void run(() => adminMarkPaid(oppId))}>
                Ops override · mark paid
              </button>
              <select
                value={String(o.settlement_mode ?? "direct_to_hotel")}
                onChange={(e) =>
                  void run(() =>
                    adminSetSettlementMode(
                      oppId,
                      e.target.value as "direct_to_hotel" | "escrow"
                    )
                  )
                }
              >
                <option value="direct_to_hotel">direct_to_hotel (pilot)</option>
                <option value="escrow">escrow (later)</option>
              </select>
            </div>
          </div>

          {/* 6 · Confirm */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>6 · Confirm · snapshot money · issue check-in code</h2>
            <p className="meta">
              Commission is on base tariff (excl. room GST). Code uses Luhn mod-32 — typos must fail.
            </p>
            {data.booking_code ? (
              <p>
                Check-in code: <strong className="mono">{data.booking_code.display}</strong>
                {data.booking_code.redeemed_at ? " · redeemed" : " · not redeemed"}
              </p>
            ) : null}
            {data.money ? (
              <ul className="admin-events" style={{ marginTop: 8 }}>
                <li>
                  Mode <strong>{String(data.money.commercial_mode ?? "agent")}</strong>
                  {Number(data.money.tcs_rate_bps ?? 0) > 0
                    ? ` · TCS ${(Number(data.money.tcs_rate_bps) / 100).toFixed(2)}%`
                    : " · TCS off"}
                  {Number(data.money.platform_turnover_paise ?? 0) > 0
                    ? ` · turnover ${formatInrFromPaise(data.money.platform_turnover_paise as number)}`
                    : ""}
                </li>
                {data.money.advice.map((line) => (
                  <li key={line.label}>
                    {line.negative ? "− " : ""}
                    {line.label}: <strong>{line.amount}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Breakup appears after confirm (₹10,000 example: net ₹8,600 agent).</p>
            )}
            <div className="admin-filters wrap" style={{ marginTop: 10 }}>
              <input
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                placeholder="Hotel / PMS ref (optional)"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminConfirmBooking(oppId, bookingRef || undefined))}
              >
                Confirm booking
              </button>
            </div>
          </div>

          {/* 7 · Redeem */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>7 · Redeem check-in code · proof of stay</h2>
            <p className="meta">
              In <code>direct_to_hotel</code>, redeem accrues commission for the weekly invoice — no
              escrow payout. Escrow mode still creates a payout. Idempotent.
            </p>
            {(data.payouts?.length ?? 0) > 0 ? (
              <ul className="admin-events">
                {data.payouts.map((p) => (
                  <li key={String(p.id)}>
                    {String(p.trigger)} · {formatInrFromPaise(p.amount_paise as number)} ·{" "}
                    {String(p.status)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">
                {String(o.settlement_mode ?? "direct_to_hotel") === "direct_to_hotel"
                  ? "No payout expected in pilot mode."
                  : "No payout yet."}
              </p>
            )}
            {data.commission ? (
              <p>
                Commission entry: {formatInrFromPaise(data.commission.commission_paise as number)} ·{" "}
                {String(data.commission.status)}
              </p>
            ) : null}
            <div className="admin-filters wrap" style={{ marginTop: 10 }}>
              <button
                type="button"
                disabled={busy || !data.booking_code?.display || Boolean(data.booking_code?.redeemed_at)}
                onClick={() =>
                  void run(() => adminRedeemCode(String(data.booking_code!.display)))
                }
              >
                Redeem code now
              </button>
              <Link className="admin-btn" href="/admin/redeem">
                Redeem desk
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminStayCompleted(oppId))}
              >
                Ops: stay completed
              </button>
            </div>
          </div>

          {/* 8 · Settle */}
          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>8 · Settle</h2>
            {data.opportunity.payment_receipt_number ? (
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Guest payment receipt</h3>
                <p className="mono">{String(data.opportunity.payment_receipt_number)}</p>
                <p className="meta">
                  Platform coordination receipt only — the hotel issues the tax invoice for the full
                  tariff. Issued{" "}
                  {data.opportunity.payment_receipt_issued_at
                    ? new Date(String(data.opportunity.payment_receipt_issued_at)).toLocaleString()
                    : "—"}
                </p>
                {data.opportunity.payment_receipt &&
                typeof data.opportunity.payment_receipt === "object" ? (
                  <ul className="admin-events">
                    {Object.entries(data.opportunity.payment_receipt as Record<string, unknown>)
                      .filter(([k]) => !["kind", "note", "issued_at"].includes(k))
                      .map(([k, v]) => (
                        <li key={k}>
                          {k.replace(/_/g, " ")}: <strong>{String(v ?? "—")}</strong>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="meta">Receipt issues automatically when booking is confirmed.</p>
            )}
            <p className="meta">
              In <code>direct_to_hotel</code>, redeem accrues commission for the weekly invoice — no
              escrow payout.
            </p>
            <div className="admin-filters wrap">
              <Link className="admin-btn" href="/admin/invoices">
                Weekly invoices
              </Link>
              <Link className="admin-btn" href="/admin/payouts">
                Payouts
              </Link>
              <Link className="admin-btn" href="/admin/commission">
                Commission ledger
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminTransition(oppId, "hotel_declined"))}
              >
                Hotel declined
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => adminTransition(oppId, "cancelled"))}
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>Events</h2>
            <ul className="admin-events">
              {data.events.map((e, i) => (
                <li key={i}>
                  <span className="mono">{String(e.occurred_at).slice(0, 19)}</span> {String(e.event_type)}{" "}
                  {e.previous_status ? `${String(e.previous_status)} → ${String(e.new_status)}` : ""}
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-panel" style={{ marginTop: 14 }}>
            <h2>Chat transcript</h2>
            <p className="meta">
              Grounded assistant replies only — price claims without tools are rejected. Full LLM
              later; ops can log guest/tool turns now.
            </p>
            <ul className="admin-events">
              {chat.map((m) => (
                <li key={String(m.id)}>
                  <strong>{String(m.role)}</strong> · {String(m.content).slice(0, 240)}
                </li>
              ))}
              {!chat.length ? <li className="meta">No messages yet.</li> : null}
            </ul>
            <div className="admin-filters wrap" style={{ marginTop: 10 }}>
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Ask assistant or log guest message"
                style={{ minWidth: 260 }}
              />
              <button
                type="button"
                disabled={busy || !chatDraft.trim()}
                onClick={() =>
                  void run(async () => {
                    await adminAssistantChat({
                      message: chatDraft.trim(),
                      opportunity_id: oppId,
                    });
                    setChatDraft("");
                  })
                }
              >
                Ask OpenAI
              </button>
              <button
                type="button"
                disabled={busy || !chatDraft.trim()}
                onClick={() =>
                  void run(async () => {
                    await adminAppendChat(oppId, { role: "user", content: chatDraft.trim() });
                    setChatDraft("");
                  })
                }
              >
                Log as guest only
              </button>
              <Link className="admin-btn" href="/admin/assistant">
                Assistant desk
              </Link>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
