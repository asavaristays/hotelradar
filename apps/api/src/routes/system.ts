import { HOTELRADAR_BRAND } from "@hotelradar/direct-shared";
import { Router } from "express";
import { config } from "../config.js";
import { asavariContract } from "../services/asavari.js";

export const systemRouter = Router();

systemRouter.get("/system", (_req, res) => {
  res.status(200).json({
    data: {
      service: "hotelradar-direct-api",
      version: "0.1.0",
      phase: "assistant-asavari-v1",
      env: config.nodeEnv,
      features: {
        otp: true,
        desk_ui: true,
        private_offers: true,
        assistant_home: true,
        asavari_sync: config.asavari.syncEnabled,
        asavari_connect: true,
        otp_provider: config.otp.provider,
      },
      brand: {
        version: HOTELRADAR_BRAND.version,
        name: HOTELRADAR_BRAND.name,
        product: HOTELRADAR_BRAND.product,
        roles: HOTELRADAR_BRAND.roles,
        assets: HOTELRADAR_BRAND.assets,
      },
      asavari: asavariContract(),
      api_base: "/api/v1",
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

systemRouter.get("/brand", (_req, res) => {
  res.status(200).json({
    data: HOTELRADAR_BRAND,
    meta: { timestamp: new Date().toISOString() },
  });
});