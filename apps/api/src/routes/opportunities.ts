import { DESTINATIONS } from "@hotelradar/direct-shared";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { acceptOffer, attachDemoOffer, getCurrentOffer } from "../services/offers.js";
import { sendOtp, verifyOtp } from "../services/otp.js";
import {
  cancelOpportunity,
  createOpportunity,
  getOpportunityByExternalId,
  getOpportunityByToken,
  listDeskQueue,
  listEvents,
  listOpenExceptions,
  toPublicOpportunity,
} from "../services/opportunity.js";
import {
  attestHotelByGuestToken,
  submitGuestPaymentUtr,
} from "../services/guestPay.js";
import { syncGuestChatByToken } from "../services/assistantTools.js";

export const opportunitiesRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(8),
  email: z.string().email().nullable().optional(),
  consent_version: z.string().min(1),
  consent: z.literal(true),
  destination: z.enum(DESTINATIONS),
  requested_area: z.string().min(1),
  requested_property: z.string().nullable().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.number().int().positive().optional(),
  adults: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  budget_paise: z.number().int().nonnegative().nullable().optional(),
  public_rate_paise: z.number().int().nonnegative().nullable().optional(),
  preferences: z.array(z.string()).optional(),
  special_request: z.string().nullable().optional(),
  referral_code: z.string().nullable().optional(),
});

function envelope(data: unknown, requestId: string) {
  return {
    data,
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

function fail(res: import("express").Response, error: unknown, requestId: string) {
  const status = (error as { status?: number }).status ?? 500;
  return res.status(status).json({
    error: {
      code:
        status === 422
          ? "VALIDATION_ERROR"
          : status === 429
            ? "RATE_LIMITED"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "CONFLICT"
                : "REQUEST_ERROR",
      message: error instanceof Error ? error.message : "Unexpected error",
    },
    meta: { request_id: requestId },
  });
}

opportunitiesRouter.post(
  "/",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid opportunity payload",
          fields: parsed.error.flatten().fieldErrors,
        },
        meta: { request_id: requestId },
      });
    }

    try {
      const created = await createOpportunity(parsed.data);
      // Best-effort OTP send for traveller flow
      let otp: unknown = null;
      try {
        otp = await sendOtp(created.public_token);
      } catch {
        otp = { sent: false };
      }
      return res.status(201).json(envelope({ ...created, otp }, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.get("/desk/exceptions", requireAdmin, async (_req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  const rows = await listOpenExceptions();
  return res.status(200).json(envelope({ exceptions: rows }, requestId));
});

opportunitiesRouter.get("/desk/queue", requireAdmin, async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  const raw = typeof req.query.destination === "string" ? req.query.destination : undefined;
  const destination =
    raw && (DESTINATIONS as readonly string[]).includes(raw)
      ? (raw as (typeof DESTINATIONS)[number])
      : undefined;
  const rows = await listDeskQueue(destination);
  return res.status(200).json(
    envelope({ opportunities: rows, filter: { destination: destination ?? null } }, requestId)
  );
});

opportunitiesRouter.post(
  "/by-token/:token/otp/send",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    try {
      const data = await sendOtp(req.params.token);
      return res.status(200).json(envelope(data, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.post(
  "/by-token/:token/otp/verify",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    const code = String(req.body?.code ?? "");
    if (!/^\d{6}$/.test(code)) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "Enter the 6-digit code." },
        meta: { request_id: requestId },
      });
    }
    try {
      const data = await verifyOtp(req.params.token, code);
      return res.status(200).json(envelope(data, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.post("/by-token/:token/cancel", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  try {
    const data = await cancelOpportunity(req.params.token);
    return res.status(200).json(envelope(data, requestId));
  } catch (error) {
    return fail(res, error, requestId);
  }
});

opportunitiesRouter.get("/by-token/:token/offer", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  try {
    const data = await getCurrentOffer(req.params.token);
    return res.status(200).json(envelope(data, requestId));
  } catch (error) {
    return fail(res, error, requestId);
  }
});

opportunitiesRouter.post("/by-token/:token/offer/demo", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  if (config.otp.provider !== "dev") {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Demo offers only available when OTP_PROVIDER=dev",
      },
      meta: { request_id: requestId },
    });
  }
  try {
    const data = await attachDemoOffer(req.params.token);
    return res.status(200).json(envelope(data, requestId));
  } catch (error) {
    return fail(res, error, requestId);
  }
});

opportunitiesRouter.post("/by-token/:token/offer/accept", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  try {
    const data = await acceptOffer(req.params.token);
    return res.status(200).json(envelope(data, requestId));
  } catch (error) {
    return fail(res, error, requestId);
  }
});

opportunitiesRouter.post(
  "/by-token/:token/payment-utr",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    const utr = String(req.body?.utr ?? "");
    if (!utr.trim()) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "utr required" },
        meta: { request_id: requestId },
      });
    }
    try {
      const data = await submitGuestPaymentUtr(req.params.token, utr);
      return res.status(200).json(envelope(data, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.post(
  "/by-token/:token/hotel-attest",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    try {
      const data = await attestHotelByGuestToken(req.params.token);
      return res.status(200).json(envelope(data, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.post(
  "/by-token/:token/chat/sync",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 60 }),
  async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}`;
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const alreadySynced = Number(req.body?.already_synced ?? 0) || 0;
    const messages = raw
      .slice(0, 200)
      .map((m: { role?: string; content?: string; text?: string }) => {
        const roleRaw = String(m?.role ?? "");
        const role =
          roleRaw === "user"
            ? ("user" as const)
            : roleRaw === "assistant" || roleRaw === "bot"
              ? ("assistant" as const)
              : null;
        const content = String(m?.content ?? m?.text ?? "");
        return role ? { role, content } : null;
      })
      .filter(Boolean) as Array<{ role: "user" | "assistant"; content: string }>;
    try {
      const data = await syncGuestChatByToken(req.params.token, messages, alreadySynced);
      return res.status(200).json(envelope(data, requestId));
    } catch (error) {
      return fail(res, error, requestId);
    }
  }
);

opportunitiesRouter.get("/by-token/:token", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  const row = await getOpportunityByToken(req.params.token);
  if (!row) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Opportunity not found" },
      meta: { request_id: requestId },
    });
  }
  const events = await listEvents(row.id);
  return res.status(200).json(
    envelope(
      {
        opportunity: toPublicOpportunity(row),
        events: events.map((e) => ({
          event_type: e.event_type,
          occurred_at: e.occurred_at,
          source_system: e.source_system,
          previous_status: e.previous_status,
          new_status: e.new_status,
        })),
      },
      requestId
    )
  );
});

opportunitiesRouter.get("/:externalId", async (req, res) => {
  const requestId = `req_${Date.now().toString(36)}`;
  const row = await getOpportunityByExternalId(req.params.externalId);
  if (!row) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Opportunity not found" },
      meta: { request_id: requestId },
    });
  }
  const events = await listEvents(row.id);
  return res.status(200).json(
    envelope(
      {
        opportunity: toPublicOpportunity(row),
        events,
      },
      requestId
    )
  );
});
