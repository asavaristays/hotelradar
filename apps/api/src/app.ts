import cors from "cors";
import express from "express";
import { adminRouter } from "./routes/admin.js";
import { asavariRouter } from "./routes/asavari.js";
import { healthRouter } from "./routes/health.js";
import { opportunitiesRouter } from "./routes/opportunities.js";
import { systemRouter } from "./routes/system.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: [
        "http://localhost:4100",
        "http://127.0.0.1:4100",
        "http://localhost:3000",
        "https://hotelradar.in",
        "https://www.hotelradar.in",
      ],
      credentials: true,
    })
  );

  app.use(healthRouter);
  app.use("/api/v1", systemRouter);

  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/opportunities", opportunitiesRouter);
  app.use("/api/v1/integrations/asavari", asavariRouter);

  app.use(
    (
      _err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error",
        },
      });
    }
  );

  return app;
}
