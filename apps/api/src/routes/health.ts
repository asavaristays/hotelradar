import { Router } from "express";
import { pool } from "../db/pool.js";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "hotelradar-direct-api",
    env: config.nodeEnv,
  });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ ok: true, database: "up" });
  } catch {
    res.status(503).json({ ok: false, database: "down" });
  }
});
