const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body.data as T;
}

export async function createRequest(payload: Record<string, unknown>) {
  const res = await fetch(`${publicBase}/opportunities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse<{
    public_token: string;
    external_opportunity_id: string;
    status: string;
    otp?: { dev_code?: string; mobile_masked?: string };
  }>(res);
}

export async function sendOtp(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/otp/send`, {
    method: "POST",
  });
  return parse<{
    mobile_masked: string;
    expires_in_seconds: number;
    dev_code?: string;
  }>(res);
}

export async function verifyOtp(token: string, code: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return parse<{ status: string; external_opportunity_id?: string }>(res);
}

/** Persist guest offer-chat transcript after OTP (server archive for OPP / helpdesk). */
export async function syncGuestChat(
  token: string,
  messages: Array<{ role: "user" | "bot" | "assistant"; text: string }>,
  alreadySynced = 0
) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/chat/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      already_synced: alreadySynced,
      messages: messages.map((m) => ({
        role: m.role === "bot" ? "assistant" : m.role,
        content: m.text,
      })),
    }),
  });
  return parse<{ synced: number; appended: number }>(res);
}

export async function getByToken(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}`, {
    cache: "no-store",
  });
  return parse<{
    opportunity: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
  }>(res);
}

export async function getOffer(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/offer`, {
    cache: "no-store",
  });
  return parse<{
    opportunity: Record<string, unknown>;
    offer: Record<string, unknown> | null;
    payment?: Record<string, unknown>;
  }>(res);
}

export async function attachDemoOffer(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/offer/demo`, {
    method: "POST",
  });
  return parse<{ offer_id: string; status: string }>(res);
}

export async function acceptOffer(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/offer/accept`, {
    method: "POST",
  });
  return parse<{ status: string; handoff?: string; message?: string }>(res);
}

export async function submitGuestUtr(token: string, utr: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/payment-utr`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utr }),
  });
  return parse<Record<string, unknown>>(res);
}

export async function attestHotelPaymentByToken(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/hotel-attest`, {
    method: "POST",
  });
  return parse<{
    payment_utr?: string | null;
    verdict?: { action?: string };
  }>(res);
}

export async function cancelRequest(token: string) {
  const res = await fetch(`${publicBase}/opportunities/by-token/${token}/cancel`, {
    method: "POST",
  });
  return parse<{ status: string }>(res);
}

export async function getDeskQueue(destination?: string) {
  const q = destination ? `?destination=${encodeURIComponent(destination)}` : "";
  const res = await fetch(`${publicBase}/opportunities/desk/queue${q}`, {
    cache: "no-store",
  });
  return parse<{ opportunities: Array<Record<string, unknown>> }>(res);
}

export async function getDeskExceptions() {
  const res = await fetch(`${publicBase}/opportunities/desk/exceptions`, {
    cache: "no-store",
  });
  return parse<{ exceptions: Array<Record<string, unknown>> }>(res);
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
