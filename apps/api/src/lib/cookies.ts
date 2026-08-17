import type { Request } from "express";

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAgeSec: number;
    secure: boolean;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
  }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${options.maxAgeSec}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(
  name: string,
  options: { secure: boolean; path?: string }
): string {
  return serializeCookie(name, "", {
    maxAgeSec: 0,
    secure: options.secure,
    path: options.path ?? "/",
    sameSite: "Lax",
  });
}
