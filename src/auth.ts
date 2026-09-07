import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import type { Config } from "./config.js";
import type { MithrilAuth } from "./mithril/client.js";

export class UnauthorizedError extends Error {}

export function bearerToken(req: IncomingMessage): string | null {
  const value = req.headers.authorization;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}

function secureEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function resolveMithrilAuth(req: IncomingMessage, config: Config): MithrilAuth {
  const token = bearerToken(req);
  if (!token) throw new UnauthorizedError("missing_bearer_token");

  if (config.authMode === "passthrough") {
    return { type: "bearer", accessToken: token };
  }

  if (!config.mcpApiKey || !secureEqual(config.mcpApiKey, token)) {
    throw new UnauthorizedError("invalid_mcp_api_key");
  }

  if (!config.mithrilDirectToken || !config.mithrilActorUserId) {
    throw new UnauthorizedError("service_auth_not_configured");
  }

  return {
    type: "gateway",
    directToken: config.mithrilDirectToken,
    actorUserId: config.mithrilActorUserId,
  };
}

export function isOriginAllowed(req: IncomingMessage, config: Config): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin);
}
