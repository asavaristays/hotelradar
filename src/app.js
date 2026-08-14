import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { asyncHandler } from './middleware/asyncHandler.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { hotelsRouter } from './routes/hotels.js';
import { leadRadarRouter } from './routes/leadRadarRoutes.js';
import { legalRouter } from './routes/legal.js';
import { runReadinessChecks } from './services/readinessService.js';

const frontendDistDir = path.resolve(process.cwd(), 'frontend', 'dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');
const frontendAvailable = fs.existsSync(frontendIndexFile);

const spaExactPaths = new Set(['/', '/dashboard', '/admin', '/leadradar', '/research', '/legal/privacy', '/legal/terms', '/legal/disclaimer']);

export function shouldServeFrontendShell(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const pathname = String(req.path || '/').trim() || '/';
  if (spaExactPaths.has(pathname)) {
    return true;
  }

  if (!String(req.headers.accept || '').includes('text/html')) {
    return false;
  }

  if (pathname.startsWith('/api/') || pathname === '/api') return false;
  if (pathname.startsWith('/auth/') || pathname === '/auth') return false;
  if (pathname.startsWith('/hotel/') || pathname === '/hotel') return false;
  if (pathname.startsWith('/hotels/') || pathname === '/hotels') return false;
  if (pathname.startsWith('/webhook/') || pathname === '/webhook') return false;
  if (pathname.startsWith('/admin/')) return false;
  if (pathname === '/health' || pathname === '/ready') return false;
  if (path.extname(pathname)) return false;

  return true;
}

export function createFrontendShellMiddleware(frontendIndexPath) {
  return (req, res, next) => {
    if (!shouldServeFrontendShell(req)) {
      return next();
    }

    return res.sendFile(frontendIndexPath);
  };
}

function corsOptionsDelegate(req, callback) {
  const allowed = env.corsOrigins;
  const origin = req.header('Origin');
  const allowAll = allowed.includes('*');

  if (!origin || allowAll || allowed.includes(origin)) {
    callback(null, {
      origin: true,
      credentials: true,
      optionsSuccessStatus: 204,
    });
    return;
  }

  const error = new Error(`CORS origin not allowed: ${origin}`);
  error.status = 403;
  callback(error, { origin: false });
}

const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/ready',
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
      timestamp: new Date().toISOString(),
      error: 'Too many requests, please try again later.',
    }),
});

export function createApp({
  serveFrontend = frontendAvailable,
  frontendDistDir: appFrontendDistDir = frontendDistDir,
  frontendIndexFile: appFrontendIndexFile = frontendIndexFile,
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(corsOptionsDelegate));
  app.use(limiter);
  app.use(express.json({ limit: env.requestBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.requestBodyLimit }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('http_request', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      res.json({ status: 'ok' });
    }),
  );

  app.get(
    '/ready',
    asyncHandler(async (req, res) => {
      const readiness = await runReadinessChecks();
      if (!readiness.ready) {
        return res.status(503).json(readiness);
      }
      return res.json(readiness);
    }),
  );

  if (serveFrontend) {
    app.use(express.static(appFrontendDistDir, { index: false }));
  }

  app.use(authRouter);
  app.use(legalRouter);
  app.use(hotelsRouter);
  app.use(dashboardRouter);
  app.use(adminRouter);
  app.use('/api/leadradar', leadRadarRouter);

  if (serveFrontend) {
    app.get('*', createFrontendShellMiddleware(appFrontendIndexFile));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
