import type { NextFunction, Request, Response } from "express";
import { getCookie } from "../lib/cookies.js";
import {
  ADMIN_COOKIE,
  resolveAdminSession,
  type AdminUser,
} from "../services/adminAuth.js";

export type AdminRequest = Request & { admin?: AdminUser };

export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const token = getCookie(req, ADMIN_COOKIE);
    const user = await resolveAdminSession(token);
    if (!user || user.role !== "super_admin") {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Admin sign-in required" },
        meta: { request_id: `req_${Date.now().toString(36)}` },
      });
    }
    req.admin = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
