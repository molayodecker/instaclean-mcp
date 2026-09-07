import type { IncomingMessage } from "node:http";

import { isOriginAllowed } from "./auth.js";
import type { Config } from "./config.js";

const FIXED_URL_BASE = "http://localhost";

export function requestPath(req: IncomingMessage): string | null {
  try {
    return new URL(req.url || "/", FIXED_URL_BASE).pathname;
  } catch {
    return null;
  }
}

export function corsHeaders(req: IncomingMessage, config: Config): Record<string, string> | null {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!isOriginAllowed(req, config)) return null;

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
      "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
    "access-control-expose-headers": "MCP-Session-Id",
    vary: "Origin",
  };
}

export function isCorsPreflight(req: IncomingMessage): boolean {
  return (
    req.method === "OPTIONS" &&
    typeof req.headers.origin === "string" &&
    typeof req.headers["access-control-request-method"] === "string"
  );
}
