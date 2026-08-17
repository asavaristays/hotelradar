const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body.data as T;
}

function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(`${publicBase}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

export type AdminUser = {
  id: string;
  username: string;
  role: string;
  last_login_at?: string | null;
};

export async function adminLogin(username: string, password: string) {
  const res = await adminFetch("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return parse<{ user: AdminUser; expires_at: string }>(res);
}

export async function adminLogout() {
  const res = await adminFetch("/admin/auth/logout", { method: "POST" });
  return parse<{ ok: boolean }>(res);
}

export async function adminMe() {
  const res = await adminFetch("/admin/auth/me");
  return parse<{ user: AdminUser }>(res);
}

export async function adminOverview() {
  const res = await adminFetch("/admin/overview");
  return parse<{
    opportunities: Record<string, number>;
    hotels: { total: number; live: number; instant_quote?: number; live_with_sheet?: number };
    open_exceptions: number;
    templates?: { total: number; approved: number };
    tiles?: Record<
      string,
      { label: string; value: string; hint: string; target?: string; raw?: number | null }
    >;
    settlement?: { mode: string; payouts_copy: string };
    system: {
      otp_provider: string;
      asavari_sync: boolean;
      openai?: { configured: boolean; model: string };
      settlement_default?: string;
      booking_window_hours?: number;
    };
  }>(res);
}

export async function adminListAttestationQueue() {
  const res = await adminFetch("/admin/attestation-queue");
  return parse<{ queue: Array<Record<string, unknown>> }>(res);
}

export async function adminBackfillOppCodes() {
  const res = await adminFetch("/admin/system/backfill-opp-codes", { method: "POST" });
  return parse<{ scanned: number; regenerated: number; skipped_non_enumerable: number }>(res);
}

export async function adminListOpportunities(params?: {
  status?: string;
  destination?: string;
  q?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.destination) qs.set("destination", params.destination);
  if (params?.q) qs.set("q", params.q);
  const res = await adminFetch(`/admin/opportunities${qs.toString() ? `?${qs}` : ""}`);
  return parse<{ opportunities: Array<Record<string, unknown>> }>(res);
}

export async function adminGetOpportunity(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}`);
  return parse<{
    opportunity: Record<string, unknown>;
    settlement?: {
      mode: string;
      plan: Record<string, unknown>;
      attestation_verdict: Record<string, unknown> | null;
      escalations_due: Array<Record<string, unknown>>;
      escalation_done: string[];
    };
    offer: Record<string, unknown> | null;
    money: {
      advice: Array<{ label: string; amount: string; negative: boolean }>;
      gross_collected_paise: number;
      commission_paise: number;
      net_payout_paise: number;
      commercial_mode?: string;
      tcs_rate_bps?: number;
      platform_turnover_paise?: number;
    } | null;
    booking_code: {
      display: string;
      issued_at: string;
      expires_at: string;
      redeemed_at: string | null;
      failed_attempts?: number;
    } | null;
    routed_hotels: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    payouts: Array<Record<string, unknown>>;
    commission: Record<string, unknown> | null;
    events: Array<Record<string, unknown>>;
  }>(res);
}

export async function adminAssignHotel(id: string, hotelId: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/assign-hotel`, {
    method: "POST",
    body: JSON.stringify({ hotel_id: hotelId }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminRecordOffer(id: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/offers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminMarkPaid(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/mark-paid`, {
    method: "POST",
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminConfirmBooking(id: string, hotelBookingRef?: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/confirm-booking`, {
    method: "POST",
    body: JSON.stringify({ hotel_booking_ref: hotelBookingRef || null }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminStayCompleted(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/stay-completed`, {
    method: "POST",
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminTransition(id: string, status: string, note?: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListHotels(destination?: string) {
  const q = destination ? `?destination=${encodeURIComponent(destination)}` : "";
  const res = await adminFetch(`/admin/hotels${q}`);
  return parse<{ hotels: Array<Record<string, unknown>> }>(res);
}

export async function adminGetHotel(id: string) {
  const res = await adminFetch(`/admin/hotels/${id}`);
  return parse<Record<string, unknown>>(res);
}

export async function adminCreateHotel(payload: Record<string, unknown>) {
  const res = await adminFetch("/admin/hotels", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminImportHotels(rows: Array<Record<string, unknown>>, merge = true) {
  const res = await adminFetch("/admin/hotels/import", {
    method: "POST",
    body: JSON.stringify({ rows, merge }),
  });
  return parse<{
    created: number;
    updated: number;
    skipped: number;
    results: Array<{ display_name: string; action: string; id?: string; error?: string }>;
  }>(res);
}

export async function adminUpdateHotel(id: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/hotels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminHotelLive(id: string, live: boolean) {
  const res = await adminFetch(`/admin/hotels/${id}/${live ? "go-live" : "pause"}`, {
    method: "POST",
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListCommission(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await adminFetch(`/admin/commission${q}`);
  return parse<{ entries: Array<Record<string, unknown>> }>(res);
}

export async function adminSettleCommission(id: string) {
  const res = await adminFetch(`/admin/commission/${id}/settle`, { method: "POST" });
  return parse<Record<string, unknown>>(res);
}

export async function adminListExceptions() {
  const res = await adminFetch("/admin/exceptions");
  return parse<{ exceptions: Array<Record<string, unknown>> }>(res);
}

export async function adminRouteOpportunity(id: string, body?: { hotel_ids?: string[]; limit?: number }) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/route`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListOppHotels(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/hotels`);
  return parse<{ hotels: Array<Record<string, unknown>> }>(res);
}

export async function adminQuoteFromSheet(id: string, hotelId: string, roomType?: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/quote-from-sheet`, {
    method: "POST",
    body: JSON.stringify({ hotel_id: hotelId, room_type: roomType }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminRedeemCode(code: string) {
  const res = await adminFetch("/admin/codes/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListInvoices(hotelId?: string) {
  const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
  const res = await adminFetch(`/admin/invoices${q}`);
  return parse<{ invoices: Array<Record<string, unknown>> }>(res);
}

export async function adminGenerateWeeklyInvoice(payload: Record<string, unknown>) {
  const res = await adminFetch("/admin/invoices/weekly", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListPayouts(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await adminFetch(`/admin/payouts${q}`);
  return parse<{ payouts: Array<Record<string, unknown>> }>(res);
}

export async function adminSettlePayout(id: string) {
  const res = await adminFetch(`/admin/payouts/${id}/settle`, { method: "POST" });
  return parse<Record<string, unknown>>(res);
}

export async function adminListRateSheets(hotelId: string) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/rate-sheets`);
  return parse<{ sheets: Array<Record<string, unknown>> }>(res);
}

export async function adminCreateRateSheet(hotelId: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/rate-sheets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminSupersedeRateSheet(hotelId: string, sheetId: string) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/rate-sheets/${sheetId}/supersede`, {
    method: "POST",
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminSetStopSell(hotelId: string, stop_sell: boolean) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/stop-sell`, {
    method: "POST",
    body: JSON.stringify({ stop_sell }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminHotelGoLiveChecklist(hotelId: string) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/go-live-checklist`);
  return parse<{
    ok: boolean;
    blockers: string[];
    status: string;
    checklist: Record<string, boolean>;
  }>(res);
}

export async function adminListGuests(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await adminFetch(`/admin/guests${qs}`);
  return parse<{ guests: Array<Record<string, unknown>> }>(res);
}

export async function adminListContacts(hotelId: string) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/contacts`);
  return parse<{ contacts: Array<Record<string, unknown>> }>(res);
}

export async function adminCreateContact(hotelId: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/contacts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminCreatePayoutAccount(hotelId: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/payout-accounts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminSubmitPaymentUtr(
  id: string,
  utr: string,
  allowOverride?: boolean
) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/payment-utr`, {
    method: "POST",
    body: JSON.stringify({ utr, allow_override: !!allowOverride }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminCopyMessages(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/copy-messages`);
  return parse<{
    messages: Array<{
      key: string;
      purpose: string;
      body: string;
      ready: boolean;
      wa_me: string | null;
    }>;
    outside_booking_window: boolean;
  }>(res);
}

export async function adminMarkEscalationDone(id: string, action: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/escalation-done`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return parse<{ escalation_done: string[] }>(res);
}

export async function adminAttestHotel(id: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(id)}/attest-hotel`, {
    method: "POST",
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminSetSettlementMode(id: string, mode: "direct_to_hotel" | "escrow") {
  const res = await adminFetch(
    `/admin/opportunities/${encodeURIComponent(id)}/settlement-mode`,
    {
      method: "POST",
      body: JSON.stringify({ mode }),
    }
  );
  return parse<Record<string, unknown>>(res);
}

export async function adminListTemplates() {
  const res = await adminFetch("/admin/templates");
  return parse<{ templates: Array<Record<string, unknown>> }>(res);
}

export async function adminSetTemplateStatus(key: string, status: string) {
  const res = await adminFetch(`/admin/templates/${encodeURIComponent(key)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListBeltNotes(belt?: string) {
  const q = belt ? `?belt=${encodeURIComponent(belt)}` : "";
  const res = await adminFetch(`/admin/belt-notes${q}`);
  return parse<{ notes: Array<Record<string, unknown>> }>(res);
}

export async function adminCreateBeltNote(payload: Record<string, unknown>) {
  const res = await adminFetch("/admin/belt-notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListHotelMedia(hotelId: string) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/media`);
  return parse<{ media: Array<Record<string, unknown>> }>(res);
}

export async function adminAddHotelMedia(hotelId: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/hotels/${hotelId}/media`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminGetTravel(hotelId: string, fromLat: number, fromLng: number) {
  const res = await adminFetch(
    `/admin/hotels/${hotelId}/travel?from_lat=${fromLat}&from_lng=${fromLng}`
  );
  return parse<Record<string, unknown>>(res);
}

export async function adminListChat(oppId: string) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(oppId)}/chat`);
  return parse<{ messages: Array<Record<string, unknown>> }>(res);
}

export async function adminAppendChat(oppId: string, payload: Record<string, unknown>) {
  const res = await adminFetch(`/admin/opportunities/${encodeURIComponent(oppId)}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<Record<string, unknown>>(res);
}

export async function adminListAssistantTools() {
  const res = await adminFetch("/admin/assistant/tools");
  return parse<{
    tools: Array<Record<string, unknown>>;
    system_prompt: string;
    system_prompt_version?: string;
    system_prompt_editable?: boolean;
    openai?: { configured: boolean; model: string };
  }>(res);
}

export async function adminAssistantChat(payload: {
  message: string;
  opportunity_id?: string;
  session_key?: string;
}) {
  const res = await adminFetch("/admin/assistant/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parse<{
    reply: string;
    tools_used: string[];
    session_key: string | null;
    usage: { tokens_in: number; tokens_out: number };
    openai: { model: string; configured: boolean };
  }>(res);
}

export async function adminRunAssistantTool(name: string, args: Record<string, unknown>) {
  const res = await adminFetch("/admin/assistant/tools/run", {
    method: "POST",
    body: JSON.stringify({ name, args }),
  });
  return parse<{ name: string; result: unknown }>(res);
}

export async function adminCheckGrounding(content: string, toolNames: string[]) {
  const res = await adminFetch("/admin/assistant/grounding", {
    method: "POST",
    body: JSON.stringify({ content, tool_names: toolNames }),
  });
  return parse<{ ungrounded: boolean; tool_names: string[] }>(res);
}

export async function adminPreviewTemplate(key: string, values: string[]) {
  const res = await adminFetch("/admin/templates/preview", {
    method: "POST",
    body: JSON.stringify({ key, values }),
  });
  return parse<{ key: string; rendered: string; can_send_freeform: boolean }>(res);
}

export function formatInrFromPaise(paise: number | string | null | undefined) {
  if (paise === null || paise === undefined) return "—";
  const n = Number(paise) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
