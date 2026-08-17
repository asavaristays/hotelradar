import { Router } from "express";
import {
  asavariContract,
  asavariStatus,
  listCachedProperties,
  syncAsavariProperties,
} from "../services/asavari.js";

export const asavariRouter = Router();

asavariRouter.get("/contract", (_req, res) => {
  res.status(200).json({
    data: asavariContract(),
    meta: { timestamp: new Date().toISOString() },
  });
});

asavariRouter.get("/status", async (_req, res) => {
  try {
    const data = await asavariStatus();
    res.status(200).json({
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: "ASAVARI_STATUS_FAILED",
        message: error instanceof Error ? error.message : "Status failed",
      },
    });
  }
});

asavariRouter.get("/properties", async (_req, res) => {
  try {
    const properties = await listCachedProperties();
    res.status(200).json({
      data: { properties },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: "ASAVARI_PROPERTIES_FAILED",
        message: error instanceof Error ? error.message : "List failed",
      },
    });
  }
});

asavariRouter.post("/sync", async (_req, res) => {
  try {
    const data = await syncAsavariProperties();
    res.status(200).json({
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({
      error: {
        code: status === 503 ? "ASAVARI_SYNC_DISABLED" : "ASAVARI_SYNC_FAILED",
        message: error instanceof Error ? error.message : "Sync failed",
        detail: (error as { detail?: unknown }).detail,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
});

asavariRouter.post("/events", (_req, res) => {
  res.status(503).json({
    error: {
      code: "ASAVARI_EVENTS_NOT_READY",
      message: "Signed Asavari webhook ingestion is not enabled yet.",
    },
    meta: { timestamp: new Date().toISOString() },
  });
});
