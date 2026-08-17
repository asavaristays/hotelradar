import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { clearCookie, getCookie, serializeCookie } from "../lib/cookies.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireAdmin, type AdminRequest } from "../middleware/adminAuth.js";
import {
  ADMIN_COOKIE,
  loginAdmin,
  logoutAdmin,
  resolveAdminSession,
} from "../services/adminAuth.js";
import {
  adminOverview,
  assignHotel,
  backfillEnumerableOppCodes,
  confirmBooking,
  createHotel,
  getAdminOpportunity,
  getHotel,
  getHotelGoLiveChecklist,
  listAdminOpportunities,
  listAttestationQueue,
  listCommission,
  listGuests,
  listHotels,
  listOpenExceptions,
  markPaid,
  recordPrivateOffer,
  setHotelLive,
  settleCommission,
  stayCompleted,
  transitionOpportunity,
  updateHotel,
} from "../services/adminOps.js";
import { importHotelsBulk } from "../services/hotelImport.js";
import {
  buildCopyMessages,
  markEscalationStepDone,
} from "../services/guestPay.js";
import { routeOpportunity, listOpportunityHotels } from "../services/routing.js";
import {
  quoteFromRateSheet,
  listRateSheets,
  upsertRateSheet,
  supersedeRateSheet,
  setHotelStopSell,
} from "../services/rateEngine.js";
import { redeemCheckInCode, recordFailedRedemption } from "../services/redemption.js";
import { generateWeeklyInvoice } from "../services/invoicing.js";
import {
  submitPaymentUtr,
  attestHotelPayment,
  setSettlementMode,
} from "../services/settlement.js";
import { getTravelToHotel, upsertTravelCache } from "../services/travel.js";
import {
  listAssistantTools,
  listChatMessages,
  listChatBySession,
  appendChatMessage,
  runAssistantTool,
  checkGrounding,
} from "../services/assistantTools.js";
import { runLlmTurn, openaiStatus } from "../services/llm.js";
import {
  listHotelContacts,
  createHotelContact,
  listInvoices,
  listPayouts,
  settlePayout,
  createPayoutAccount,
  listHotelPayoutAccounts,
  listWhatsAppTemplates,
  setWhatsAppTemplateStatus,
  listBeltNotes,
  createBeltNote,
  listHotelMedia,
  addHotelMedia,
} from "../services/domainExtras.js";
import { DESTINATIONS, renderTemplate, TEMPLATES, canSendFreeform } from "@hotelradar/direct-shared";

export const adminRouter = Router();

function envelope(data: unknown, requestId: string) {
  return {
    data,
    meta: { request_id: requestId, timestamp: new Date().toISOString() },
  };
}

function requestId() {
  return `req_${Date.now().toString(36)}`;
}

const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(1).max(200),
});

adminRouter.post(
  "/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const rid = requestId();
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid username or password" },
        meta: { request_id: rid },
      });
    }

    const result = await loginAdmin(parsed.data.username, parsed.data.password, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (!result) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid username or password" },
        meta: { request_id: rid },
      });
    }

    res.setHeader(
      "Set-Cookie",
      serializeCookie(ADMIN_COOKIE, result.token, {
        maxAgeSec: config.admin.sessionTtlSeconds,
        secure: config.admin.cookieSecure,
        sameSite: "Lax",
        path: "/",
      })
    );

    return res.json(
      envelope(
        {
          user: {
            id: result.user.id,
            username: result.user.username,
            role: result.user.role,
          },
          expires_at: result.expiresAt.toISOString(),
        },
        rid
      )
    );
  }
);

adminRouter.post("/auth/logout", async (req, res) => {
  const rid = requestId();
  const token = getCookie(req, ADMIN_COOKIE);
  await logoutAdmin(token);
  res.setHeader(
    "Set-Cookie",
    clearCookie(ADMIN_COOKIE, { secure: config.admin.cookieSecure })
  );
  return res.json(envelope({ ok: true }, rid));
});

adminRouter.get("/auth/me", async (req, res) => {
  const rid = requestId();
  const token = getCookie(req, ADMIN_COOKIE);
  const user = await resolveAdminSession(token);
  if (!user) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Admin sign-in required" },
      meta: { request_id: rid },
    });
  }
  return res.json(
    envelope(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          last_login_at: user.last_login_at,
        },
      },
      rid
    )
  );
});

/** Example protected ping for S1 verification */
adminRouter.get("/ping", requireAdmin, (req: AdminRequest, res) => {
  return res.json(
    envelope(
      {
        ok: true,
        username: req.admin?.username,
        role: req.admin?.role,
      },
      requestId()
    )
  );
});

function fail(res: import("express").Response, error: unknown, rid: string) {
  const status = (error as { status?: number }).status ?? 500;
  const blockers = (error as { blockers?: string[] }).blockers;
  return res.status(status).json({
    error: {
      code:
        (error as { code?: string }).code ||
        (status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION_ERROR" : "REQUEST_ERROR"),
      message: error instanceof Error ? error.message : "Unexpected error",
      ...(blockers ? { blockers } : {}),
    },
    meta: { request_id: rid },
  });
}

adminRouter.get("/overview", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await adminOverview(), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/opportunities", requireAdmin, async (req, res) => {
  const rid = requestId();
  const dest =
    typeof req.query.destination === "string" &&
    (DESTINATIONS as readonly string[]).includes(req.query.destination)
      ? (req.query.destination as (typeof DESTINATIONS)[number])
      : undefined;
  try {
    const rows = await listAdminOpportunities({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      destination: dest,
      q: typeof req.query.q === "string" ? req.query.q.trim() : undefined,
    });
    return res.json(envelope({ opportunities: rows }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/opportunities/:externalId", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    const data = await getAdminOpportunity(req.params.externalId);
    if (!data) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Opportunity not found" },
        meta: { request_id: rid },
      });
    }
    return res.json(envelope(data, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/opportunities/:externalId/copy-messages", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await buildCopyMessages(req.params.externalId), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/escalation-done", requireAdmin, async (req, res) => {
  const rid = requestId();
  const action = String(req.body?.action ?? "");
  if (!action) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "action required" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(envelope(await markEscalationStepDone(req.params.externalId, action), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/assign-hotel", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  try {
    const hotelId = String(req.body?.hotel_id ?? "");
    if (!hotelId) throw Object.assign(new Error("hotel_id required"), { status: 422 });
    const data = await assignHotel(req.params.externalId, hotelId, req.admin?.username ?? "admin");
    return res.json(envelope(data, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/offers", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      hotel_name: z.string().optional(),
      room_type: z.string().min(1),
      occupancy: z.string().min(1),
      total_amount_paise: z.number().int().positive(),
      inclusions: z.string().optional(),
      cancellation_terms: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid offer payload" },
      meta: { request_id: rid },
    });
  }
  try {
    const data = await recordPrivateOffer(
      req.params.externalId,
      parsed.data,
      req.admin?.username ?? "admin"
    );
    return res.json(envelope(data, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/mark-paid", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope(await markPaid(req.params.externalId, req.admin?.username ?? "admin"), rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post(
  "/opportunities/:externalId/payment-utr",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    const utr = String(req.body?.utr ?? "");
    if (!utr) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "utr required" },
        meta: { request_id: rid },
      });
    }
    try {
      return res.json(
        envelope(
          await submitPaymentUtr(req.params.externalId, utr, req.admin?.username ?? "admin", {
            allowOverride: Boolean(req.body?.allow_override),
          }),
          rid
        )
      );
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post(
  "/opportunities/:externalId/attest-hotel",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    try {
      return res.json(
        envelope(
          await attestHotelPayment(req.params.externalId, req.admin?.username ?? "admin"),
          rid
        )
      );
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post(
  "/opportunities/:externalId/settlement-mode",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    const mode = String(req.body?.mode ?? "");
    if (mode !== "direct_to_hotel" && mode !== "escrow") {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "mode must be direct_to_hotel or escrow" },
        meta: { request_id: rid },
      });
    }
    try {
      return res.json(
        envelope(
          await setSettlementMode(req.params.externalId, mode, req.admin?.username ?? "admin"),
          rid
        )
      );
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post(
  "/opportunities/:externalId/confirm-booking",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    try {
      const ref =
        typeof req.body?.hotel_booking_ref === "string" ? req.body.hotel_booking_ref : null;
      return res.json(
        envelope(
          await confirmBooking(req.params.externalId, ref, req.admin?.username ?? "admin"),
          rid
        )
      );
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post(
  "/opportunities/:externalId/stay-completed",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    try {
      return res.json(
        envelope(await stayCompleted(req.params.externalId, req.admin?.username ?? "admin"), rid)
      );
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post("/opportunities/:externalId/transition", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  const next = String(req.body?.status ?? "");
  const allowed = [
    "hotel_declined",
    "more_details_needed",
    "offer_expired",
    "cancelled",
    "issue_review",
  ] as const;
  if (!allowed.includes(next as (typeof allowed)[number])) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid status transition" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(
      envelope(
        await transitionOpportunity(
          req.params.externalId,
          next as (typeof allowed)[number],
          req.admin?.username ?? "admin",
          typeof req.body?.note === "string" ? req.body.note : undefined
        ),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels", requireAdmin, async (req, res) => {
  const rid = requestId();
  const dest =
    typeof req.query.destination === "string" &&
    (DESTINATIONS as readonly string[]).includes(req.query.destination)
      ? (req.query.destination as (typeof DESTINATIONS)[number])
      : undefined;
  try {
    return res.json(envelope({ hotels: await listHotels(dest) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      display_name: z.string().min(2),
      destination: z.enum(DESTINATIONS),
      location: z.string().optional(),
      belt: z.string().optional(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      legal_name: z.string().optional(),
      gstin: z.string().nullable().optional(),
      pan: z.string().nullable().optional(),
      gst_rate_bps: z.number().int().optional(),
      gateway_borne_by: z.enum(["hotel", "platform", "split"]).optional(),
      tcs_bps: z.number().int().min(0).max(1000).optional(),
      commercial_mode: z.enum(["agent", "principal"]).optional(),
      notify_whatsapp: z.string().nullable().optional(),
      notify_email: z.preprocess(
        (v) => (v === "" || v === undefined ? null : v),
        z.string().email().nullable().optional()
      ),
      commission_pct_bps: z.number().int().min(0).max(5000).optional(),
      notes: z.string().nullable().optional(),
      asavari_property_id: z.string().nullable().optional(),
      instant_quote_enabled: z.boolean().optional(),
      upi_vpa: z.string().nullable().optional(),
      payment_note: z.string().nullable().optional(),
      payout: z
        .object({
          account_holder: z.string().optional(),
          ifsc_last4: z.string().optional(),
          account_last4: z.string().optional(),
          provider: z.enum(["razorpay_route", "cashfree_split", "manual_neft"]).optional(),
        })
        .nullable()
        .optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid hotel payload" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(envelope(await createHotel(parsed.data), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/import", requireAdmin, async (req, res) => {
  const rid = requestId();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const merge = req.body?.merge !== false;
  if (!rows.length) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "rows[] required" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(envelope(await importHotelsBulk(rows, { merge }), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id", requireAdmin, async (req, res) => {
  const rid = requestId();
  const hotel = await getHotel(req.params.id);
  if (!hotel) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Hotel not found" },
      meta: { request_id: rid },
    });
  }
  try {
    const [contacts, sheets, payout_accounts, media] = await Promise.all([
      listHotelContacts(req.params.id),
      listRateSheets(req.params.id),
      listHotelPayoutAccounts(req.params.id),
      listHotelMedia(req.params.id),
    ]);
    return res.json(
      envelope({ ...hotel, contacts, rate_sheets: sheets, payout_accounts, media }, rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.patch("/hotels/:id", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await updateHotel(req.params.id, req.body ?? {}), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/go-live", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await setHotelLive(req.params.id, true), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/pause", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await setHotelLive(req.params.id, false), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/commission", requireAdmin, async (req, res) => {
  const rid = requestId();
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  try {
    return res.json(envelope({ entries: await listCommission(status) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/commission/:id/settle", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope(await settleCommission(req.params.id, req.admin?.username ?? "admin"), rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/exceptions", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ exceptions: await listOpenExceptions() }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/attestation-queue", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ queue: await listAttestationQueue() }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/guests", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    return res.json(envelope({ guests: await listGuests(q) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/system/backfill-opp-codes", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await backfillEnumerableOppCodes(), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/system/overview", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await adminOverview(), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/route", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  try {
    const hotelIds = Array.isArray(req.body?.hotel_ids)
      ? req.body.hotel_ids.map(String)
      : undefined;
    const limit = typeof req.body?.limit === "number" ? req.body.limit : undefined;
    return res.json(
      envelope(
        await routeOpportunity(req.params.externalId, req.admin?.username ?? "admin", {
          hotelIds,
          limit,
        }),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/opportunities/:externalId/hotels", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope({ hotels: await listOpportunityHotels(req.params.externalId) }, rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post(
  "/opportunities/:externalId/quote-from-sheet",
  requireAdmin,
  async (req: AdminRequest, res) => {
    const rid = requestId();
    try {
      const hotelId = String(req.body?.hotel_id ?? "");
      if (!hotelId) throw Object.assign(new Error("hotel_id required"), { status: 422 });
      const data = await quoteFromRateSheet(
        req.params.externalId,
        hotelId,
        req.admin?.username ?? "admin",
        typeof req.body?.room_type === "string" ? req.body.room_type : undefined
      );
      if (!data) {
        return res.status(404).json({
          error: { code: "NO_RATE_MATCH", message: "No matching rate sheet row" },
          meta: { request_id: rid },
        });
      }
      return res.json(envelope(data, rid));
    } catch (error) {
      return fail(res, error, rid);
    }
  }
);

adminRouter.post("/codes/redeem", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  const code = String(req.body?.code ?? "");
  if (!code) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "code required" },
      meta: { request_id: rid },
    });
  }
  try {
    const result = await redeemCheckInCode(code, {
      actorId: req.admin?.username ?? "admin",
      channel: "ops_manual",
      ip: req.ip,
    });
    if (!result.ok) {
      await recordFailedRedemption(code);
      const status =
        result.error.code === "NOT_FOUND" || result.error.code === "MALFORMED_CODE" ? 404 : 422;
      return res.status(status).json({
        error: { code: result.error.code, message: result.error.message },
        meta: { request_id: rid },
      });
    }
    return res.json(envelope(result, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id/rate-sheets", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ sheets: await listRateSheets(req.params.id) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/rate-sheets", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      effective_from: z.string(),
      effective_to: z.string(),
      expires_at: z.string(),
      activate: z.boolean().optional(),
      rows: z
        .array(
          z.object({
            room_type: z.string(),
            season: z.enum(["monsoon", "shoulder", "peak", "xmas_ny"]),
            floor_tariff_paise: z.number().int().positive(),
            min_nights: z.number().int().optional(),
            max_nights: z.number().int().optional(),
            max_occupancy: z.number().int().optional(),
            advance_hours_min: z.number().int().optional(),
            dow_mask: z.number().int().optional(),
            inclusions: z.array(z.unknown()).optional(),
            blackout_dates: z.array(z.string()).optional(),
          })
        )
        .min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid rate sheet payload" },
      meta: { request_id: rid },
    });
  }
  try {
    const sheet = await upsertRateSheet({
      hotelId: req.params.id,
      effectiveFrom: parsed.data.effective_from,
      effectiveTo: parsed.data.effective_to,
      expiresAt: parsed.data.expires_at,
      activate: parsed.data.activate,
      rows: parsed.data.rows,
    });
    return res.status(201).json(envelope(sheet, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/rate-sheets/:sheetId/supersede", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope(await supersedeRateSheet(req.params.id, req.params.sheetId), rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/stop-sell", requireAdmin, async (req, res) => {
  const rid = requestId();
  const stop = req.body?.stop_sell !== false;
  try {
    return res.json(envelope(await setHotelStopSell(req.params.id, stop), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id/go-live-checklist", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await getHotelGoLiveChecklist(req.params.id), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id/contacts", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ contacts: await listHotelContacts(req.params.id) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/contacts", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      role: z.enum(["owner", "manager", "front_desk", "night_desk", "accounts"]),
      name: z.string().min(1),
      phone_e164: z.string().min(8),
      is_primary: z.boolean().optional(),
      active_from_hour: z.number().int().min(0).max(24).optional(),
      active_to_hour: z.number().int().min(0).max(24).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid contact payload" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(
      envelope(
        await createHotelContact({ hotelId: req.params.id, ...parsed.data }),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/payout-accounts", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      account_holder: z.string().min(2),
      provider: z.enum(["razorpay_route", "cashfree_split", "manual_neft"]).optional(),
      ifsc_last4: z.string().optional(),
      account_last4: z.string().optional(),
      activate: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid payout account" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(
      envelope(
        await createPayoutAccount({ hotelId: req.params.id, ...parsed.data }),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/invoices", requireAdmin, async (req, res) => {
  const rid = requestId();
  const hotelId = typeof req.query.hotel_id === "string" ? req.query.hotel_id : undefined;
  try {
    return res.json(envelope({ invoices: await listInvoices(hotelId) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/invoices/weekly", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      hotel_id: z.string().uuid(),
      period_start: z.string(),
      period_end: z.string(),
      supplier_gstin: z.string().min(10).optional(),
      supplier_legal_name: z.string().optional(),
      supplier_address: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid invoice request" },
      meta: { request_id: rid },
    });
  }
  try {
    const invoice = await generateWeeklyInvoice({
      hotelId: parsed.data.hotel_id,
      periodStart: new Date(parsed.data.period_start),
      periodEnd: new Date(parsed.data.period_end),
      supplier: {
        gstin: parsed.data.supplier_gstin || process.env.PLATFORM_GSTIN || "29AAAAA0000A1Z5",
        legalName:
          parsed.data.supplier_legal_name ||
          process.env.PLATFORM_LEGAL_NAME ||
          "HotelRADAR Direct",
        address:
          parsed.data.supplier_address ||
          process.env.PLATFORM_ADDRESS ||
          "Goa, India",
      },
    });
    if (!invoice) {
      return res.status(404).json({
        error: { code: "NO_ENTRIES", message: "No accrued commission in period" },
        meta: { request_id: rid },
      });
    }
    return res.status(201).json(envelope(invoice, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/payouts", requireAdmin, async (req, res) => {
  const rid = requestId();
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  try {
    return res.json(envelope({ payouts: await listPayouts(status) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/payouts/:id/settle", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope(await settlePayout(req.params.id), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/templates", requireAdmin, async (_req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ templates: await listWhatsAppTemplates() }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/templates/:key/status", requireAdmin, async (req, res) => {
  const rid = requestId();
  const status = String(req.body?.status ?? "");
  const allowed = ["draft", "submitted", "approved", "rejected", "paused"] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid template status" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(
      envelope(
        await setWhatsAppTemplateStatus(req.params.key, status as (typeof allowed)[number]),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/belt-notes", requireAdmin, async (req, res) => {
  const rid = requestId();
  const belt = typeof req.query.belt === "string" ? req.query.belt : undefined;
  try {
    return res.json(envelope({ notes: await listBeltNotes(belt) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/belt-notes", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      belt: z.string().min(2),
      kind: z.enum(["noise", "access", "monsoon", "crowd", "food", "safety", "seasonal"]),
      note: z.string().min(4),
      months_applicable: z.array(z.number().int().min(1).max(12)).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid belt note" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(envelope(await createBeltNote(parsed.data), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id/media", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(envelope({ media: await listHotelMedia(req.params.id) }, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/media", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      kind: z.enum([
        "room",
        "bathroom",
        "pool",
        "exterior",
        "breakfast",
        "beach_path",
        "view",
        "gallery",
        "amenity",
        "other",
      ]),
      url: z.string().url(),
      room_type: z.string().optional(),
      thumb_url: z.string().url().optional(),
      caption: z.string().optional(),
      sort_order: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid media payload" },
      meta: { request_id: rid },
    });
  }
  try {
    return res
      .status(201)
      .json(envelope(await addHotelMedia({ hotelId: req.params.id, ...parsed.data }), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/hotels/:id/travel", requireAdmin, async (req, res) => {
  const rid = requestId();
  const fromLat = Number(req.query.from_lat);
  const fromLng = Number(req.query.from_lng);
  if (!Number.isFinite(fromLat) || !Number.isFinite(fromLng)) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "from_lat and from_lng required" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(
      envelope(await getTravelToHotel({ hotelId: req.params.id, fromLat, fromLng }), rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/hotels/:id/travel", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      from_lat: z.number(),
      from_lng: z.number(),
      seconds: z.number().int().positive(),
      meters: z.number().int().positive(),
      provider: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid travel cache payload" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(
      envelope(
        await upsertTravelCache({
          hotelId: req.params.id,
          fromLat: parsed.data.from_lat,
          fromLng: parsed.data.from_lng,
          seconds: parsed.data.seconds,
          meters: parsed.data.meters,
          provider: parsed.data.provider,
        }),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/assistant/tools", requireAdmin, async (_req, res) => {
  const rid = requestId();
  return res.json(envelope({ ...listAssistantTools(), openai: openaiStatus() }, rid));
});

adminRouter.post("/assistant/chat", requireAdmin, async (req: AdminRequest, res) => {
  const rid = requestId();
  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "message required" },
      meta: { request_id: rid },
    });
  }
  try {
    const data = await runLlmTurn({
      message,
      externalId: typeof req.body?.opportunity_id === "string" ? req.body.opportunity_id : null,
      sessionKey: typeof req.body?.session_key === "string" ? req.body.session_key : null,
    });
    return res.json(envelope(data, rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.get("/assistant/session/:key", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope({ messages: await listChatBySession(req.params.key), openai: openaiStatus() }, rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/assistant/tools/run", requireAdmin, async (req, res) => {
  const rid = requestId();
  const name = String(req.body?.name ?? "");
  const args = (req.body?.args ?? {}) as Record<string, unknown>;
  if (!name) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "name required" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.json(envelope(await runAssistantTool(name, args), rid));
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/assistant/grounding", requireAdmin, async (req, res) => {
  const rid = requestId();
  const content = String(req.body?.content ?? "");
  const tools = Array.isArray(req.body?.tool_names)
    ? req.body.tool_names.map(String)
    : [];
  return res.json(envelope(checkGrounding(content, tools), rid));
});

adminRouter.get("/opportunities/:externalId/chat", requireAdmin, async (req, res) => {
  const rid = requestId();
  try {
    return res.json(
      envelope({ messages: await listChatMessages(req.params.externalId) }, rid)
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/opportunities/:externalId/chat", requireAdmin, async (req, res) => {
  const rid = requestId();
  const parsed = z
    .object({
      role: z.enum(["user", "assistant", "tool"]),
      content: z.string().min(1),
      tool_calls: z.array(z.unknown()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid chat message" },
      meta: { request_id: rid },
    });
  }
  try {
    return res.status(201).json(
      envelope(
        await appendChatMessage({
          externalId: req.params.externalId,
          role: parsed.data.role,
          content: parsed.data.content,
          toolCalls: parsed.data.tool_calls,
        }),
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});

adminRouter.post("/templates/preview", requireAdmin, async (req, res) => {
  const rid = requestId();
  const key = String(req.body?.key ?? "");
  const values = Array.isArray(req.body?.values) ? req.body.values.map(String) : [];
  const spec = TEMPLATES.find((t) => t.key === key);
  if (!spec) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown template key" },
      meta: { request_id: rid },
    });
  }
  try {
    const lastInbound = req.body?.last_inbound_at
      ? new Date(String(req.body.last_inbound_at))
      : null;
    return res.json(
      envelope(
        {
          key,
          rendered: renderTemplate(spec, values),
          can_send_freeform: canSendFreeform(lastInbound),
        },
        rid
      )
    );
  } catch (error) {
    return fail(res, error, rid);
  }
});
