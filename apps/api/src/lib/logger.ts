import { config } from "../config.js";

type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const min = order[(config.logLevel as Level) in order ? (config.logLevel as Level) : "info"];

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (order[level] < min) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
