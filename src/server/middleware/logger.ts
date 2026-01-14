import type { MiddlewareHandler } from "hono";
import { Config } from "../../config/index.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  const configLevel = Config.get().logLevel;
  return LOG_LEVELS[level] >= LOG_LEVELS[configLevel];
}

function formatDuration(start: number): string {
  const duration = Date.now() - start;
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

/**
 * Logger Middleware
 *
 * Logs HTTP requests with timing information.
 */
export function logger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    // Log request start (debug level)
    if (shouldLog("debug")) {
      console.log(`→ ${method} ${path}`);
    }

    await next();

    const status = c.res.status;
    const duration = formatDuration(start);

    // Log completed request
    if (shouldLog("info")) {
      const statusIndicator = status >= 400 ? "✗" : "✓";
      console.log(`${statusIndicator} ${method} ${path} ${status} ${duration}`);
    }
  };
}
