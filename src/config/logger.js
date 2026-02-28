import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { env } from './env.js';

const logDirectory = path.resolve(process.cwd(), env.logDir);
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const transports = [];

if (env.enableConsoleLogs) {
  transports.push(
    new winston.transports.Console({
      level: env.logLevel,
      format: jsonFormat,
    }),
  );
}

transports.push(
  new winston.transports.File({
    filename: path.join(logDirectory, 'app-error.log'),
    level: 'error',
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
  }),
);

transports.push(
  new winston.transports.File({
    filename: path.join(logDirectory, 'app-info.log'),
    level: env.logLevel,
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
  }),
);

const baseLogger = winston.createLogger({
  level: env.logLevel,
  defaultMeta: { service: 'radar-light', env: env.nodeEnv },
  transports,
});

export const logger = {
  info(message, meta = {}) {
    baseLogger.info(message, meta);
  },
  warn(message, meta = {}) {
    baseLogger.warn(message, meta);
  },
  error(message, meta = {}) {
    baseLogger.error(message, meta);
  },
};
